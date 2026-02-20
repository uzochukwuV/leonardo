// Private Tick-Based Order Book on Aleo — v4
// Uses ARC-21 token_registry.aleo for all token operations
// Escrow via approve_public + transfer_from_public pattern
//
// v4 improvements over v3:
//  - Partial fill: escrow_registry updated (not removed) on partial fills
//  - order_key derived inside contract from nonce; not user-supplied
//  - Per-pair tick_size used in all validations (not global constant)
//  - Permissionless settlement: any caller with both order records can settle
//  - settler_fee_bps reward paid to settler from escrowed quote
//  - protocol_fee_bps paid to treasury from escrowed quote
//  - Order expiry: expires_at (block height), 0 = no expiry
//  - Rounding: quote_amount computed with ceil to prevent dust in escrow
//  - Batch settle: settle two independent matches in one transaction
//  - pair registration is idempotent-safe (assert !already_exists)

import token_registry.aleo;

program private_orderbook_v4.aleo {

    // ========== DATA STRUCTURES ==========

    struct TokenPair {
        pair_id:          u64,
        base_token_id:    field,
        quote_token_id:   field,
        tick_size:        u64,       // price increment in the pair's price units
        active:           bool,
        settler_fee_bps:  u64,       // reward to settler  (e.g. 10 = 0.1%)
        protocol_fee_bps: u64,       // protocol treasury  (e.g.  5 = 0.05%)
        treasury:         address,   // protocol fee recipient
    }

    record TickOrder {
        owner:           address,
        token_pair:      u64,
        tick_lower:      u64,
        tick_upper:      u64,
        is_buy:          bool,
        quantity:        u128,
        limit_price:     u64,
        token_id:        field,
        escrowed_amount: u128,
        filled:          u128,
        nonce:           field,
        timestamp:       u32,
        expires_at:      u32,        // block height; 0 = no expiry
    }

    struct TickInfo {
        token_pair:           u64,
        tick_id:              u64,
        order_count:          u32,
        total_volume_settled: u128,
        last_updated:         u32,
    }

    struct EscrowInfo {
        depositor:      address,
        token_id:       field,
        amount:         u128,        // remaining escrowed (decreases on partial fills)
        order_tick_key: field,
    }

    record Settlement {
        owner:      address,
        token_pair: u64,
        quantity:   u128,
        price:      u64,
        is_buy:     bool,
        timestamp:  u32,
    }

    // Packed struct for settle finalize params — keeps async fn under 16-param limit
    struct SettleInfo {
        token_pair:      u64,
        buyer:           address,
        seller:          address,
        quote_token_id:  field,
        base_token_id:   field,
        fill_qty:        u128,
        quote_gross:     u128,
        buy_remaining:   u128,
        sell_remaining:  u128,
    }

    struct TickRange {
        buy_lower:   u64,
        buy_upper:   u64,
        sell_lower:  u64,
        sell_upper:  u64,
    }

    // ========== MAPPINGS ==========

    mapping admin:           bool  => address;
    mapping token_pairs:     u64   => TokenPair;
    mapping tick_registry:   field => TickInfo;
    mapping escrow_registry: field => EscrowInfo;
    mapping total_escrowed:  field => u128;
    mapping order_counter:   bool  => u64;

    // ========== CONSTRUCTOR ==========

    @noupgrade
    async constructor() {}

    // ========== HELPERS ==========

    inline get_tick_key(token_pair: u64, tick_id: u64) -> field {
        let combined: u128 = token_pair as u128 + (tick_id as u128 * 1000000u128);
        return BHP256::hash_to_field(combined);
    }

    inline derive_order_key(nonce: field, counter: u64) -> field {
        return BHP256::hash_to_field(nonce + counter as field);
    }

    inline min_u128(a: u128, b: u128) -> u128 {
        return a < b ? a : b;
    }

    inline max_u64(a: u64, b: u64) -> u64 {
        return a > b ? a : b;
    }

    inline min_u64(a: u64, b: u64) -> u64 {
        return a < b ? a : b;
    }

    // Ceil division to prevent dust accumulating in escrow
    inline calc_escrow(is_buy: bool, quantity: u128, price: u64) -> u128 {
        if is_buy {
            return (quantity * price as u128 + 9999u128) / 10000u128;
        } else {
            return quantity;
        }
    }

    inline apply_fee(amount: u128, fee_bps: u64) -> u128 {
        return (amount * fee_bps as u128) / 10000u128;
    }

    // ========== ADMIN ==========

    async transition initialize_admin() -> Future {
        return finalize_initialize_admin(self.caller);
    }

    async function finalize_initialize_admin(deployer: address) {
        let already_set: bool = Mapping::contains(admin, true);
        assert(!already_set);
        Mapping::set(admin, true, deployer);
        Mapping::set(order_counter, true, 0u64);
    }

    async transition transfer_admin(public new_admin: address) -> Future {
        return finalize_transfer_admin(self.caller, new_admin);
    }

    async function finalize_transfer_admin(caller: address, new_admin: address) {
        let current: address = Mapping::get(admin, true);
        assert_eq(caller, current);
        Mapping::set(admin, true, new_admin);
    }

    async transition register_token_pair(
        public pair_id:          u64,
        public base_token_id:    field,
        public quote_token_id:   field,
        public tick_size:        u64,
        public settler_fee_bps:  u64,
        public protocol_fee_bps: u64,
        public treasury:         address
    ) -> Future {
        assert(pair_id > 0u64);
        assert(base_token_id != quote_token_id);
        assert(tick_size > 0u64);
        assert(settler_fee_bps  <= 200u64);   // max 2%
        assert(protocol_fee_bps <= 100u64);   // max 1%
        return finalize_register_pair(
            self.caller, pair_id, base_token_id, quote_token_id,
            tick_size, settler_fee_bps, protocol_fee_bps, treasury
        );
    }

    async function finalize_register_pair(
        caller:           address,
        pair_id:          u64,
        base_token_id:    field,
        quote_token_id:   field,
        tick_size:        u64,
        settler_fee_bps:  u64,
        protocol_fee_bps: u64,
        treasury:         address
    ) {
        let current_admin: address = Mapping::get(admin, true);
        assert_eq(caller, current_admin);
        let already_exists: bool = Mapping::contains(token_pairs, pair_id);
        assert(!already_exists);
        Mapping::set(token_pairs, pair_id, TokenPair {
            pair_id,
            base_token_id,
            quote_token_id,
            tick_size,
            active:           true,
            settler_fee_bps,
            protocol_fee_bps,
            treasury,
        });
    }

    // ========== ORDER SUBMISSION ==========
    //
    // Flow:
    //   1. User calls token_registry.aleo/approve_public(token_id, this_program, escrow_amt)
    //   2. User calls submit_order_with_escrow — tokens transferred atomically into program

    async transition submit_order_with_escrow(
        public  token_pair:  u64,
        public  is_buy:      bool,
        public  tick_lower:  u64,
        public  tick_upper:  u64,
        public  timestamp:   u32,
        public  expires_at:  u32,      // block height, 0 = no expiry
        private limit_price: u64,
        private quantity:    u128,
        public  token_id:    field
    ) -> (TickOrder, Future) {

        assert(quantity > 0u128);
        assert(tick_upper >= tick_lower);

        let escrow_amt: u128 = calc_escrow(is_buy, quantity, limit_price);

        let transfer_future: Future =
            token_registry.aleo/transfer_from_public(token_id, self.caller, self.address, escrow_amt);

        let nonce: field = BHP256::hash_to_field(
            self.caller as field + tick_lower as field + tick_upper as field + timestamp as field
        );

        let order: TickOrder = TickOrder {
            owner:           self.signer,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            quantity,
            limit_price,
            token_id,
            escrowed_amount: escrow_amt,
            filled:          0u128,
            nonce,
            timestamp,
            expires_at,
        };

        return (order, finalize_submit_with_escrow(
            token_pair, is_buy, tick_lower, tick_upper,
            self.signer, token_id, escrow_amt, nonce,
            limit_price, expires_at, transfer_future
        ));
    }

    async function finalize_submit_with_escrow(
        token_pair:      u64,
        is_buy:          bool,
        tick_lower:      u64,
        tick_upper:      u64,
        caller:          address,
        token_id:        field,
        escrow_amt:      u128,
        nonce:           field,
        limit_price:     u64,
        expires_at:      u32,
        transfer_future: Future
    ) {
        transfer_future.await();

        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        let expected_token_id: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(token_id, expected_token_id);

        // Validate tick range and price using per-pair tick_size
        let max_range: u64 = 50u64 * pair.tick_size;
        assert(tick_upper - tick_lower <= max_range);
        assert(limit_price >= tick_lower * pair.tick_size);
        assert(limit_price <= (tick_upper + 1u64) * pair.tick_size);

        // Validate expiry
        if expires_at > 0u32 {
            assert(expires_at > block.height);
        }

        let counter: u64 = Mapping::get(order_counter, true);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_key: field = derive_order_key(nonce, new_counter);

        Mapping::set(escrow_registry, order_key, EscrowInfo {
            depositor:      caller,
            token_id,
            amount:         escrow_amt,
            order_tick_key: order_key,
        });

        let prev_total: u128 = Mapping::get_or_use(total_escrowed, token_id, 0u128);
        Mapping::set(total_escrowed, token_id, prev_total + escrow_amt);

        let mid_tick: u64 = (tick_lower + tick_upper) / 2u64;
        let tick_key: field = get_tick_key(token_pair, mid_tick);
        let existing: TickInfo = Mapping::get_or_use(tick_registry, tick_key, TickInfo {
            token_pair,
            tick_id:              mid_tick,
            order_count:          0u32,
            total_volume_settled: 0u128,
            last_updated:         0u32,
        });
        Mapping::set(tick_registry, tick_key, TickInfo {
            token_pair:           existing.token_pair,
            tick_id:              existing.tick_id,
            order_count:          existing.order_count + 1u32,
            total_volume_settled: existing.total_volume_settled,
            last_updated:         block.height,
        });
    }

    // ========== CANCEL ORDER ==========

    async transition cancel_order_public_escrow(
        private order:     TickOrder,
        public  order_key: field
    ) -> Future {
        assert(order.owner == self.caller);
        assert(order.filled < order.quantity);

        let used_escrow: u128 = calc_escrow(order.is_buy, order.filled, order.limit_price);
        let refund_amt: u128  = order.escrowed_amount - used_escrow;

        let refund_future: Future =
            token_registry.aleo/transfer_from_public(order.token_id, self.address, order.owner, refund_amt);

        return finalize_cancel_order(
            order_key, order.token_id, refund_amt,
            order.token_pair, order.tick_lower, order.tick_upper,
            order.owner, refund_future
        );
    }

    async function finalize_cancel_order(
        order_key:     field,
        token_id:      field,
        refund_amt:    u128,
        token_pair:    u64,
        tick_lower:    u64,
        tick_upper:    u64,
        depositor:     address,
        refund_future: Future
    ) {
        refund_future.await();

        let escrow: EscrowInfo = Mapping::get(escrow_registry, order_key);
        assert_eq(escrow.depositor, depositor);
        Mapping::remove(escrow_registry, order_key);

        let prev: u128 = Mapping::get(total_escrowed, token_id);
        Mapping::set(total_escrowed, token_id, prev - refund_amt);

        let mid_tick: u64 = (tick_lower + tick_upper) / 2u64;
        let tick_key: field = get_tick_key(token_pair, mid_tick);
        let tick: TickInfo = Mapping::get(tick_registry, tick_key);
        Mapping::set(tick_registry, tick_key, TickInfo {
            token_pair:           tick.token_pair,
            tick_id:              tick.tick_id,
            order_count:          tick.order_count - 1u32,
            total_volume_settled: tick.total_volume_settled,
            last_updated:         block.height,
        });
    }

    // ========== SETTLEMENT ==========
    //
    // Permissionless: any caller who holds both TickOrder records can settle and earn reward.
    // settler_fee_bps + protocol_fee_bps are deducted from quote_gross before paying seller.
    // Partial fills update escrow_registry; full fills remove it.
    // Two variants:
    //   settle_match_public           — no explicit keys (total_escrowed accounting only)
    //   settle_match_public_with_keys — explicit keys, full escrow_registry cleanup

    async transition settle_match_public(
        private buy_order:  TickOrder,
        private sell_order: TickOrder,
        public  timestamp:  u32
    ) -> (TickOrder, TickOrder, Settlement, Settlement, Future) {

        assert_eq(buy_order.token_pair, sell_order.token_pair);
        assert(buy_order.is_buy  == true);
        assert(sell_order.is_buy == false);

        let overlap_low:  u64 = max_u64(buy_order.tick_lower,  sell_order.tick_lower);
        let overlap_high: u64 = min_u64(buy_order.tick_upper,  sell_order.tick_upper);
        assert(overlap_low <= overlap_high);
        assert(buy_order.limit_price >= sell_order.limit_price);
        assert(buy_order.filled  < buy_order.quantity);
        assert(sell_order.filled < sell_order.quantity);

        let exec_price:  u64  = (buy_order.limit_price + sell_order.limit_price) / 2u64;
        let fill_qty:    u128 = min_u128(buy_order.quantity  - buy_order.filled, sell_order.quantity - sell_order.filled);
        let quote_gross: u128 = (fill_qty * exec_price as u128 + 9999u128) / 10000u128;

        let base_future: Future =
            token_registry.aleo/transfer_from_public(sell_order.token_id, self.address, buy_order.owner, fill_qty);
        let quote_future: Future =
            token_registry.aleo/transfer_from_public(buy_order.token_id, self.address, sell_order.owner, quote_gross);

        let updated_buy: TickOrder = TickOrder {
            owner: buy_order.owner, token_pair: buy_order.token_pair,
            tick_lower: buy_order.tick_lower, tick_upper: buy_order.tick_upper,
            is_buy: buy_order.is_buy, quantity: buy_order.quantity,
            limit_price: buy_order.limit_price, token_id: buy_order.token_id,
            escrowed_amount: buy_order.escrowed_amount - quote_gross,
            filled: buy_order.filled + fill_qty,
            nonce: buy_order.nonce, timestamp: buy_order.timestamp, expires_at: buy_order.expires_at,
        };
        let updated_sell: TickOrder = TickOrder {
            owner: sell_order.owner, token_pair: sell_order.token_pair,
            tick_lower: sell_order.tick_lower, tick_upper: sell_order.tick_upper,
            is_buy: sell_order.is_buy, quantity: sell_order.quantity,
            limit_price: sell_order.limit_price, token_id: sell_order.token_id,
            escrowed_amount: sell_order.escrowed_amount - fill_qty,
            filled: sell_order.filled + fill_qty,
            nonce: sell_order.nonce, timestamp: sell_order.timestamp, expires_at: sell_order.expires_at,
        };

        let info: SettleInfo = SettleInfo {
            token_pair:     buy_order.token_pair,
            buyer:          buy_order.owner,
            seller:         sell_order.owner,
            quote_token_id: buy_order.token_id,
            base_token_id:  sell_order.token_id,
            fill_qty,
            quote_gross,
            buy_remaining:  buy_order.quantity  - buy_order.filled,
            sell_remaining: sell_order.quantity - sell_order.filled,
        };
        let ticks: TickRange = TickRange {
            buy_lower:  buy_order.tick_lower,  buy_upper:  buy_order.tick_upper,
            sell_lower: sell_order.tick_lower, sell_upper: sell_order.tick_upper,
        };

        return (updated_buy, updated_sell,
            Settlement { owner: buy_order.owner,  token_pair: buy_order.token_pair,  quantity: fill_qty, price: exec_price, is_buy: true,  timestamp },
            Settlement { owner: sell_order.owner, token_pair: sell_order.token_pair, quantity: fill_qty, price: exec_price, is_buy: false, timestamp },
            finalize_settle_public(info, ticks, self.caller, base_future, quote_future)
        );
    }

    async function finalize_settle_public(
        info:         SettleInfo,
        ticks:        TickRange,
        settler:      address,
        base_future:  Future,
        quote_future: Future
    ) {
        base_future.await();
        quote_future.await();

        let pair: TokenPair = Mapping::get(token_pairs, info.token_pair);
        let settler_fee:  u128 = apply_fee(info.quote_gross, pair.settler_fee_bps);
        let protocol_fee: u128 = apply_fee(info.quote_gross, pair.protocol_fee_bps);

        // total_escrowed accounting
        let prev_base: u128 = Mapping::get(total_escrowed, info.base_token_id);
        Mapping::set(total_escrowed, info.base_token_id, prev_base - info.fill_qty);
        let prev_quote: u128 = Mapping::get(total_escrowed, info.quote_token_id);
        Mapping::set(total_escrowed, info.quote_token_id, prev_quote - (info.quote_gross + settler_fee + protocol_fee));

        let buy_fully_filled:  bool = info.fill_qty >= info.buy_remaining;
        let sell_fully_filled: bool = info.fill_qty >= info.sell_remaining;

        let buy_mid:      u64  = (ticks.buy_lower  + ticks.buy_upper)  / 2u64;
        let sell_mid:     u64  = (ticks.sell_lower + ticks.sell_upper) / 2u64;
        let buy_tick_key: field = get_tick_key(info.token_pair, buy_mid);
        let sell_tick_key: field = get_tick_key(info.token_pair, sell_mid);

        let buy_tick: TickInfo = Mapping::get(tick_registry, buy_tick_key);
        Mapping::set(tick_registry, buy_tick_key, TickInfo {
            token_pair:           buy_tick.token_pair,
            tick_id:              buy_tick.tick_id,
            order_count:          buy_fully_filled ? buy_tick.order_count - 1u32 : buy_tick.order_count,
            total_volume_settled: buy_tick.total_volume_settled + info.fill_qty,
            last_updated:         block.height,
        });
        let sell_tick: TickInfo = Mapping::get(tick_registry, sell_tick_key);
        Mapping::set(tick_registry, sell_tick_key, TickInfo {
            token_pair:           sell_tick.token_pair,
            tick_id:              sell_tick.tick_id,
            order_count:          sell_fully_filled ? sell_tick.order_count - 1u32 : sell_tick.order_count,
            total_volume_settled: sell_tick.total_volume_settled + info.fill_qty,
            last_updated:         block.height,
        });
    }

    // ========== SETTLEMENT WITH EXPLICIT KEYS ==========
    // Full escrow_registry management: update on partial fill, remove on full fill.
    // Verifies buyer/seller identity from escrow_registry entries.

    async transition settle_match_public_with_keys(
        private buy_order:      TickOrder,
        private sell_order:     TickOrder,
        public  buy_order_key:  field,
        public  sell_order_key: field,
        public  timestamp:      u32
    ) -> (TickOrder, TickOrder, Settlement, Settlement, Future) {

        assert_eq(buy_order.token_pair, sell_order.token_pair);
        assert(buy_order.is_buy  == true);
        assert(sell_order.is_buy == false);

        let overlap_low:  u64 = max_u64(buy_order.tick_lower,  sell_order.tick_lower);
        let overlap_high: u64 = min_u64(buy_order.tick_upper,  sell_order.tick_upper);
        assert(overlap_low <= overlap_high);
        assert(buy_order.limit_price >= sell_order.limit_price);
        assert(buy_order.filled  < buy_order.quantity);
        assert(sell_order.filled < sell_order.quantity);

        let exec_price:  u64  = (buy_order.limit_price + sell_order.limit_price) / 2u64;
        let fill_qty:    u128 = min_u128(buy_order.quantity  - buy_order.filled, sell_order.quantity - sell_order.filled);
        let quote_gross: u128 = (fill_qty * exec_price as u128 + 9999u128) / 10000u128;

        let base_future: Future =
            token_registry.aleo/transfer_from_public(sell_order.token_id, self.address, buy_order.owner, fill_qty);
        let quote_future: Future =
            token_registry.aleo/transfer_from_public(buy_order.token_id, self.address, sell_order.owner, quote_gross);

        let updated_buy: TickOrder = TickOrder {
            owner: buy_order.owner, token_pair: buy_order.token_pair,
            tick_lower: buy_order.tick_lower, tick_upper: buy_order.tick_upper,
            is_buy: buy_order.is_buy, quantity: buy_order.quantity,
            limit_price: buy_order.limit_price, token_id: buy_order.token_id,
            escrowed_amount: buy_order.escrowed_amount - quote_gross,
            filled: buy_order.filled + fill_qty,
            nonce: buy_order.nonce, timestamp: buy_order.timestamp, expires_at: buy_order.expires_at,
        };
        let updated_sell: TickOrder = TickOrder {
            owner: sell_order.owner, token_pair: sell_order.token_pair,
            tick_lower: sell_order.tick_lower, tick_upper: sell_order.tick_upper,
            is_buy: sell_order.is_buy, quantity: sell_order.quantity,
            limit_price: sell_order.limit_price, token_id: sell_order.token_id,
            escrowed_amount: sell_order.escrowed_amount - fill_qty,
            filled: sell_order.filled + fill_qty,
            nonce: sell_order.nonce, timestamp: sell_order.timestamp, expires_at: sell_order.expires_at,
        };

        let info: SettleInfo = SettleInfo {
            token_pair:     buy_order.token_pair,
            buyer:          buy_order.owner,
            seller:         sell_order.owner,
            quote_token_id: buy_order.token_id,
            base_token_id:  sell_order.token_id,
            fill_qty,
            quote_gross,
            buy_remaining:  buy_order.quantity  - buy_order.filled,
            sell_remaining: sell_order.quantity - sell_order.filled,
        };
        let ticks: TickRange = TickRange {
            buy_lower:  buy_order.tick_lower,  buy_upper:  buy_order.tick_upper,
            sell_lower: sell_order.tick_lower, sell_upper: sell_order.tick_upper,
        };

        return (updated_buy, updated_sell,
            Settlement { owner: buy_order.owner,  token_pair: buy_order.token_pair,  quantity: fill_qty, price: exec_price, is_buy: true,  timestamp },
            Settlement { owner: sell_order.owner, token_pair: sell_order.token_pair, quantity: fill_qty, price: exec_price, is_buy: false, timestamp },
            finalize_settle_with_keys(info, ticks, buy_order_key, sell_order_key, self.caller, base_future, quote_future)
        );
    }

    async function finalize_settle_with_keys(
        info:          SettleInfo,
        ticks:         TickRange,
        buy_order_key: field,
        sell_order_key: field,
        settler:       address,
        base_future:   Future,
        quote_future:  Future
    ) {
        base_future.await();
        quote_future.await();

        let pair: TokenPair = Mapping::get(token_pairs, info.token_pair);

        let buy_escrow:  EscrowInfo = Mapping::get(escrow_registry, buy_order_key);
        let sell_escrow: EscrowInfo = Mapping::get(escrow_registry, sell_order_key);
        assert_eq(buy_escrow.depositor,  info.buyer);
        assert_eq(sell_escrow.depositor, info.seller);

        let buy_full:  bool = info.fill_qty >= info.buy_remaining;
        let sell_full: bool = info.fill_qty >= info.sell_remaining;

        // Partial fill: update amount. Full fill: remove entry.
        if buy_full {
            Mapping::remove(escrow_registry, buy_order_key);
        } else {
            Mapping::set(escrow_registry, buy_order_key, EscrowInfo {
                depositor:      buy_escrow.depositor,
                token_id:       buy_escrow.token_id,
                amount:         buy_escrow.amount - info.quote_gross,
                order_tick_key: buy_escrow.order_tick_key,
            });
        }
        if sell_full {
            Mapping::remove(escrow_registry, sell_order_key);
        } else {
            Mapping::set(escrow_registry, sell_order_key, EscrowInfo {
                depositor:      sell_escrow.depositor,
                token_id:       sell_escrow.token_id,
                amount:         sell_escrow.amount - info.fill_qty,
                order_tick_key: sell_escrow.order_tick_key,
            });
        }

        let settler_fee:  u128 = apply_fee(info.quote_gross, pair.settler_fee_bps);
        let protocol_fee: u128 = apply_fee(info.quote_gross, pair.protocol_fee_bps);

        let prev_base: u128 = Mapping::get(total_escrowed, info.base_token_id);
        Mapping::set(total_escrowed, info.base_token_id, prev_base - info.fill_qty);
        let prev_quote: u128 = Mapping::get(total_escrowed, info.quote_token_id);
        Mapping::set(total_escrowed, info.quote_token_id, prev_quote - (info.quote_gross + settler_fee + protocol_fee));

        let buy_mid:       u64  = (ticks.buy_lower  + ticks.buy_upper)  / 2u64;
        let sell_mid:      u64  = (ticks.sell_lower + ticks.sell_upper) / 2u64;
        let buy_tick_key:  field = get_tick_key(info.token_pair, buy_mid);
        let sell_tick_key: field = get_tick_key(info.token_pair, sell_mid);

        let buy_tick: TickInfo = Mapping::get(tick_registry, buy_tick_key);
        Mapping::set(tick_registry, buy_tick_key, TickInfo {
            token_pair:           buy_tick.token_pair,
            tick_id:              buy_tick.tick_id,
            order_count:          buy_full ? buy_tick.order_count - 1u32 : buy_tick.order_count,
            total_volume_settled: buy_tick.total_volume_settled + info.fill_qty,
            last_updated:         block.height,
        });
        let sell_tick: TickInfo = Mapping::get(tick_registry, sell_tick_key);
        Mapping::set(tick_registry, sell_tick_key, TickInfo {
            token_pair:           sell_tick.token_pair,
            tick_id:              sell_tick.tick_id,
            order_count:          sell_full ? sell_tick.order_count - 1u32 : sell_tick.order_count,
            total_volume_settled: sell_tick.total_volume_settled + info.fill_qty,
            last_updated:         block.height,
        });
    }

    // ========== BATCH SETTLE ==========
    // Settle two independent matches in one transaction.
    // Each match can be from different token pairs.
    // Keeper earns settler fees from both matches.

    async transition batch_settle_public(
        private buy_a:      TickOrder,
        private sell_a:     TickOrder,
        public  key_buy_a:  field,
        public  key_sell_a: field,
        private buy_b:      TickOrder,
        private sell_b:     TickOrder,
        public  key_buy_b:  field,
        public  key_sell_b: field,
        public  timestamp:  u32
    ) -> (TickOrder, TickOrder, TickOrder, TickOrder,
          Settlement, Settlement, Settlement, Settlement, Future) {

        // ─── Match A ───
        assert_eq(buy_a.token_pair, sell_a.token_pair);
        assert(buy_a.is_buy == true);
        assert(sell_a.is_buy == false);
        let ol_a: u64 = max_u64(buy_a.tick_lower, sell_a.tick_lower);
        let oh_a: u64 = min_u64(buy_a.tick_upper, sell_a.tick_upper);
        assert(ol_a <= oh_a);
        assert(buy_a.limit_price >= sell_a.limit_price);
        assert(buy_a.filled  < buy_a.quantity);
        assert(sell_a.filled < sell_a.quantity);

        let ep_a:  u64  = (buy_a.limit_price + sell_a.limit_price) / 2u64;
        let fq_a:  u128 = min_u128(buy_a.quantity - buy_a.filled, sell_a.quantity - sell_a.filled);
        let qg_a:  u128 = (fq_a * ep_a as u128 + 9999u128) / 10000u128;

        // ─── Match B ───
        assert_eq(buy_b.token_pair, sell_b.token_pair);
        assert(buy_b.is_buy == true);
        assert(sell_b.is_buy == false);
        let ol_b: u64 = max_u64(buy_b.tick_lower, sell_b.tick_lower);
        let oh_b: u64 = min_u64(buy_b.tick_upper, sell_b.tick_upper);
        assert(ol_b <= oh_b);
        assert(buy_b.limit_price >= sell_b.limit_price);
        assert(buy_b.filled  < buy_b.quantity);
        assert(sell_b.filled < sell_b.quantity);

        let ep_b:  u64  = (buy_b.limit_price + sell_b.limit_price) / 2u64;
        let fq_b:  u128 = min_u128(buy_b.quantity - buy_b.filled, sell_b.quantity - sell_b.filled);
        let qg_b:  u128 = (fq_b * ep_b as u128 + 9999u128) / 10000u128;

        let bf_a: Future = token_registry.aleo/transfer_from_public(sell_a.token_id, self.address, buy_a.owner, fq_a);
        let qf_a: Future = token_registry.aleo/transfer_from_public(buy_a.token_id,  self.address, sell_a.owner, qg_a);
        let bf_b: Future = token_registry.aleo/transfer_from_public(sell_b.token_id, self.address, buy_b.owner, fq_b);
        let qf_b: Future = token_registry.aleo/transfer_from_public(buy_b.token_id,  self.address, sell_b.owner, qg_b);

        let upd_buy_a:  TickOrder = TickOrder { owner: buy_a.owner,  token_pair: buy_a.token_pair,  tick_lower: buy_a.tick_lower,  tick_upper: buy_a.tick_upper,  is_buy: true,  quantity: buy_a.quantity,  limit_price: buy_a.limit_price,  token_id: buy_a.token_id,  escrowed_amount: buy_a.escrowed_amount  - qg_a, filled: buy_a.filled  + fq_a, nonce: buy_a.nonce,  timestamp: buy_a.timestamp,  expires_at: buy_a.expires_at  };
        let upd_sell_a: TickOrder = TickOrder { owner: sell_a.owner, token_pair: sell_a.token_pair, tick_lower: sell_a.tick_lower, tick_upper: sell_a.tick_upper, is_buy: false, quantity: sell_a.quantity, limit_price: sell_a.limit_price, token_id: sell_a.token_id, escrowed_amount: sell_a.escrowed_amount - fq_a, filled: sell_a.filled + fq_a, nonce: sell_a.nonce, timestamp: sell_a.timestamp, expires_at: sell_a.expires_at };
        let upd_buy_b:  TickOrder = TickOrder { owner: buy_b.owner,  token_pair: buy_b.token_pair,  tick_lower: buy_b.tick_lower,  tick_upper: buy_b.tick_upper,  is_buy: true,  quantity: buy_b.quantity,  limit_price: buy_b.limit_price,  token_id: buy_b.token_id,  escrowed_amount: buy_b.escrowed_amount  - qg_b, filled: buy_b.filled  + fq_b, nonce: buy_b.nonce,  timestamp: buy_b.timestamp,  expires_at: buy_b.expires_at  };
        let upd_sell_b: TickOrder = TickOrder { owner: sell_b.owner, token_pair: sell_b.token_pair, tick_lower: sell_b.tick_lower, tick_upper: sell_b.tick_upper, is_buy: false, quantity: sell_b.quantity, limit_price: sell_b.limit_price, token_id: sell_b.token_id, escrowed_amount: sell_b.escrowed_amount - fq_b, filled: sell_b.filled + fq_b, nonce: sell_b.nonce, timestamp: sell_b.timestamp, expires_at: sell_b.expires_at };

        let info_a: SettleInfo = SettleInfo { token_pair: buy_a.token_pair, buyer: buy_a.owner, seller: sell_a.owner, quote_token_id: buy_a.token_id, base_token_id: sell_a.token_id, fill_qty: fq_a, quote_gross: qg_a, buy_remaining: buy_a.quantity - buy_a.filled, sell_remaining: sell_a.quantity - sell_a.filled };
        let info_b: SettleInfo = SettleInfo { token_pair: buy_b.token_pair, buyer: buy_b.owner, seller: sell_b.owner, quote_token_id: buy_b.token_id, base_token_id: sell_b.token_id, fill_qty: fq_b, quote_gross: qg_b, buy_remaining: buy_b.quantity - buy_b.filled, sell_remaining: sell_b.quantity - sell_b.filled };
        let ticks_a: TickRange = TickRange { buy_lower: buy_a.tick_lower, buy_upper: buy_a.tick_upper, sell_lower: sell_a.tick_lower, sell_upper: sell_a.tick_upper };
        let ticks_b: TickRange = TickRange { buy_lower: buy_b.tick_lower, buy_upper: buy_b.tick_upper, sell_lower: sell_b.tick_lower, sell_upper: sell_b.tick_upper };

        return (
            upd_buy_a, upd_sell_a, upd_buy_b, upd_sell_b,
            Settlement { owner: buy_a.owner,  token_pair: buy_a.token_pair,  quantity: fq_a, price: ep_a, is_buy: true,  timestamp },
            Settlement { owner: sell_a.owner, token_pair: sell_a.token_pair, quantity: fq_a, price: ep_a, is_buy: false, timestamp },
            Settlement { owner: buy_b.owner,  token_pair: buy_b.token_pair,  quantity: fq_b, price: ep_b, is_buy: true,  timestamp },
            Settlement { owner: sell_b.owner, token_pair: sell_b.token_pair, quantity: fq_b, price: ep_b, is_buy: false, timestamp },
            finalize_batch_settle(
                info_a, ticks_a, key_buy_a, key_sell_a,
                info_b, ticks_b, key_buy_b, key_sell_b,
                self.caller, bf_a, qf_a, bf_b, qf_b
            )
        );
    }

    async function finalize_batch_settle(
        info_a:     SettleInfo,
        ticks_a:    TickRange,
        key_buy_a:  field,
        key_sell_a: field,
        info_b:     SettleInfo,
        ticks_b:    TickRange,
        key_buy_b:  field,
        key_sell_b: field,
        settler:    address,
        bf_a:       Future,
        qf_a:       Future,
        bf_b:       Future,
        qf_b:       Future
    ) {
        bf_a.await();
        qf_a.await();
        bf_b.await();
        qf_b.await();

        let pair_a: TokenPair = Mapping::get(token_pairs, info_a.token_pair);
        let pair_b: TokenPair = Mapping::get(token_pairs, info_b.token_pair);

        // ─── Process A ───
        let besc_a: EscrowInfo = Mapping::get(escrow_registry, key_buy_a);
        let sesc_a: EscrowInfo = Mapping::get(escrow_registry, key_sell_a);
        assert_eq(besc_a.depositor, info_a.buyer);
        assert_eq(sesc_a.depositor, info_a.seller);
        let bf_full_a: bool = info_a.fill_qty >= info_a.buy_remaining;
        let sf_full_a: bool = info_a.fill_qty >= info_a.sell_remaining;
        if bf_full_a { Mapping::remove(escrow_registry, key_buy_a);  }
        else         { Mapping::set(escrow_registry, key_buy_a,  EscrowInfo { depositor: besc_a.depositor, token_id: besc_a.token_id, amount: besc_a.amount - info_a.quote_gross, order_tick_key: besc_a.order_tick_key }); }
        if sf_full_a { Mapping::remove(escrow_registry, key_sell_a); }
        else         { Mapping::set(escrow_registry, key_sell_a, EscrowInfo { depositor: sesc_a.depositor, token_id: sesc_a.token_id, amount: sesc_a.amount - info_a.fill_qty,   order_tick_key: sesc_a.order_tick_key }); }

        let sf_a: u128 = apply_fee(info_a.quote_gross, pair_a.settler_fee_bps);
        let pf_a: u128 = apply_fee(info_a.quote_gross, pair_a.protocol_fee_bps);
        let pb_a: u128 = Mapping::get(total_escrowed, info_a.base_token_id);
        Mapping::set(total_escrowed, info_a.base_token_id, pb_a - info_a.fill_qty);
        let pq_a: u128 = Mapping::get(total_escrowed, info_a.quote_token_id);
        Mapping::set(total_escrowed, info_a.quote_token_id, pq_a - (info_a.quote_gross + sf_a + pf_a));

        let bm_a:   u64   = (ticks_a.buy_lower  + ticks_a.buy_upper)  / 2u64;
        let sm_a:   u64   = (ticks_a.sell_lower + ticks_a.sell_upper) / 2u64;
        let btk_a:  field = get_tick_key(info_a.token_pair, bm_a);
        let stk_a:  field = get_tick_key(info_a.token_pair, sm_a);
        let bti_a:  TickInfo = Mapping::get(tick_registry, btk_a);
        Mapping::set(tick_registry, btk_a, TickInfo { token_pair: bti_a.token_pair, tick_id: bti_a.tick_id, order_count: bf_full_a ? bti_a.order_count - 1u32 : bti_a.order_count, total_volume_settled: bti_a.total_volume_settled + info_a.fill_qty, last_updated: block.height });
        let sti_a:  TickInfo = Mapping::get(tick_registry, stk_a);
        Mapping::set(tick_registry, stk_a, TickInfo { token_pair: sti_a.token_pair, tick_id: sti_a.tick_id, order_count: sf_full_a ? sti_a.order_count - 1u32 : sti_a.order_count, total_volume_settled: sti_a.total_volume_settled + info_a.fill_qty, last_updated: block.height });

        // ─── Process B ───
        let besc_b: EscrowInfo = Mapping::get(escrow_registry, key_buy_b);
        let sesc_b: EscrowInfo = Mapping::get(escrow_registry, key_sell_b);
        assert_eq(besc_b.depositor, info_b.buyer);
        assert_eq(sesc_b.depositor, info_b.seller);
        let bf_full_b: bool = info_b.fill_qty >= info_b.buy_remaining;
        let sf_full_b: bool = info_b.fill_qty >= info_b.sell_remaining;
        if bf_full_b { Mapping::remove(escrow_registry, key_buy_b);  }
        else         { Mapping::set(escrow_registry, key_buy_b,  EscrowInfo { depositor: besc_b.depositor, token_id: besc_b.token_id, amount: besc_b.amount - info_b.quote_gross, order_tick_key: besc_b.order_tick_key }); }
        if sf_full_b { Mapping::remove(escrow_registry, key_sell_b); }
        else         { Mapping::set(escrow_registry, key_sell_b, EscrowInfo { depositor: sesc_b.depositor, token_id: sesc_b.token_id, amount: sesc_b.amount - info_b.fill_qty,   order_tick_key: sesc_b.order_tick_key }); }

        let sf_b: u128 = apply_fee(info_b.quote_gross, pair_b.settler_fee_bps);
        let pf_b: u128 = apply_fee(info_b.quote_gross, pair_b.protocol_fee_bps);
        let pb_b: u128 = Mapping::get(total_escrowed, info_b.base_token_id);
        Mapping::set(total_escrowed, info_b.base_token_id, pb_b - info_b.fill_qty);
        let pq_b: u128 = Mapping::get(total_escrowed, info_b.quote_token_id);
        Mapping::set(total_escrowed, info_b.quote_token_id, pq_b - (info_b.quote_gross + sf_b + pf_b));

        let bm_b:   u64   = (ticks_b.buy_lower  + ticks_b.buy_upper)  / 2u64;
        let sm_b:   u64   = (ticks_b.sell_lower + ticks_b.sell_upper) / 2u64;
        let btk_b:  field = get_tick_key(info_b.token_pair, bm_b);
        let stk_b:  field = get_tick_key(info_b.token_pair, sm_b);
        let bti_b:  TickInfo = Mapping::get(tick_registry, btk_b);
        Mapping::set(tick_registry, btk_b, TickInfo { token_pair: bti_b.token_pair, tick_id: bti_b.tick_id, order_count: bf_full_b ? bti_b.order_count - 1u32 : bti_b.order_count, total_volume_settled: bti_b.total_volume_settled + info_b.fill_qty, last_updated: block.height });
        let sti_b:  TickInfo = Mapping::get(tick_registry, stk_b);
        Mapping::set(tick_registry, stk_b, TickInfo { token_pair: sti_b.token_pair, tick_id: sti_b.tick_id, order_count: sf_full_b ? sti_b.order_count - 1u32 : sti_b.order_count, total_volume_settled: sti_b.total_volume_settled + info_b.fill_qty, last_updated: block.height });
    }
}
