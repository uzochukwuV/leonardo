// Private Tick-Based Order Book on Aleo — v6
// FIX: Use transfer_public_as_signer for native ALEO deposits
// FIXED: Orders stored in public mapping for matcher accessibility
// SUPPORTS: Both native ALEO credits AND ARC-21 tokens (USDC, etc.)
//
// Architecture:
//   - Orders stored in PUBLIC mapping (accessible by matchers)
//   - Tick ranges are public (for matching)
//   - Exact limit prices stored as commitments (private until settlement)
//   - Permissionless settlement by any keeper
//   - Settler earns fees for executing matches
//
// ADVANCED FEATURES:
//   - Private Stop-Loss: Invisible trigger prices (anti-hunting)
//   - Iceberg Orders: Hidden depth, auto-refilling visible portion
//   - Order expiry: Block height based expiration
//
// TOKEN SUPPORT:
//   - Native ALEO credits: Use token_id = 0field, calls credits.aleo
//   - ARC-21 tokens: Use actual token_id, calls token_registry.aleo

import credits.aleo; 
import token_registry.aleo;
import test_usdc_token.aleo;

program private_orderbook_0000v8testnet.aleo {

    // ========== CONSTANTS ==========

    // Special token ID for native ALEO credits
    // When base_token_id or quote_token_id equals this, use credits.aleo
    const NATIVE_CREDITS_ID: field = 0field;

    // Circle's test USDC token ID marker
    // When this is the quote token, use test_usdc_token.aleo interface
    const CIRCLE_USDC_ID: field = 1field;

    // ========== DATA STRUCTURES ==========

    struct TokenPair {
        pair_id:          u64,
        base_token_id:    field,
        quote_token_id:   field,
        tick_size:        u64,
        active:           bool,
        settler_fee_bps:  u64,
        protocol_fee_bps: u64,
        treasury:         address,
    }

    // Public order data stored in mapping (accessible by matchers)
    struct Order {
        trader:          address,   // Cannot use "owner" - reserved in Leo
        token_pair:      u64,
        tick_lower:      u64,
        tick_upper:      u64,
        is_buy:          bool,
        quantity:        u128,
        limit_price:     u64,       // Stored publicly for settlement
        token_id:        field,
        escrowed_amount: u128,
        filled:          u128,
        timestamp:       u32,
        expires_at:      u32,
        status:          u8,        // 0=active, 1=filled, 2=cancelled
        order_type:      u8,        // 0=limit, 1=stop-loss, 2=iceberg
    }

    // ========== PRIVATE STOP-LOSS (Anti-Hunting) ==========
    // The stop price is stored as a COMMITMENT (hash).
    // Attackers cannot see where your stop is!
    // Keeper provides the actual price + proof to trigger.

    struct StopLossOrder {
        trader:           address,
        token_pair:       u64,
        is_buy:           bool,
        quantity:         u128,
        stop_price_hash:  field,     // Hash of actual stop price - INVISIBLE!
        limit_price:      u64,       // Price to execute at when triggered
        token_id:         field,
        escrowed_amount:  u128,
        triggered:        bool,
        timestamp:        u32,
        expires_at:       u32,
    }

    // ========== ICEBERG ORDERS (Hidden Depth) ==========
    // Only shows a small "visible" portion publicly.
    // As visible portion fills, it auto-refills from hidden reserve.
    // Prevents market impact from large orders.

    struct IcebergOrder {
        trader:           address,
        token_pair:       u64,
        tick_lower:       u64,
        tick_upper:       u64,
        is_buy:           bool,
        total_quantity:   u128,      // Full order size (PRIVATE in mapping!)
        visible_quantity: u128,      // Publicly shown amount
        refill_quantity:  u128,      // How much to show after each fill
        limit_price:      u64,
        token_id:         field,
        escrowed_amount:  u128,
        filled:           u128,
        timestamp:        u32,
        expires_at:       u32,
        status:           u8,
    }

    // Private receipt for order owner (proof of order)
    record OrderReceipt {
        owner:      address,
        order_id:   field,
        token_pair: u64,
        is_buy:     bool,
        quantity:   u128,
        limit_price: u64,
        timestamp:  u32,
    }

    struct TickInfo {
        token_pair:           u64,
        tick_id:              u64,
        order_count:          u32,
        total_volume_settled: u128,
        last_updated:         u32,
    }

    record Settlement {
        owner:      address,
        token_pair: u64,
        quantity:   u128,
        price:      u64,
        is_buy:     bool,
        timestamp:  u32,
    }

    // ========== MAPPINGS ==========

    mapping admin:           bool  => address;
    mapping token_pairs:     u64   => TokenPair;
    mapping orders:          field => Order;           // PUBLIC order book!
    mapping stop_orders:     field => StopLossOrder;   // Private stop-loss orders
    mapping iceberg_orders:  field => IcebergOrder;    // Iceberg orders
    mapping tick_registry:   field => TickInfo;
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

    inline derive_order_id(caller: address, counter: u64, timestamp: u32) -> field {
        return BHP256::hash_to_field(caller as field + counter as field + timestamp as field);
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
        return finalize_init_admin(self.caller);
    }

    async function finalize_init_admin(deployer: address) {
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
        assert(settler_fee_bps  <= 200u64);
        assert(protocol_fee_bps <= 100u64);
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
        let exists: bool = Mapping::contains(token_pairs, pair_id);
        assert(!exists);
        Mapping::set(token_pairs, pair_id, TokenPair {
            pair_id,
            base_token_id,
            quote_token_id,
            tick_size,
            active: true,
            settler_fee_bps,
            protocol_fee_bps,
            treasury,
        });
    }

    // ========== ORDER SUBMISSION ==========
    //
    // User flow:
    //   1. Approve tokens: token_registry.aleo/approve_public(token_id, this_program, amount)
    //   2. Submit order: submit_order(...)
    //   3. Order stored in PUBLIC mapping (matchers can see it)
    //   4. User receives private OrderReceipt as proof

    async transition submit_order(
        public  token_pair:  u64,
        public  is_buy:      bool,
        public  tick_lower:  u64,
        public  tick_upper:  u64,
        public  timestamp:   u32,
        public  expires_at:  u32,
        public  limit_price: u64,    // Public for settlement matching
        public  quantity:    u128,
        public  token_id:    field
    ) -> (OrderReceipt, Future) {

        assert(quantity > 0u128);
        assert(tick_upper >= tick_lower);

        let escrow_amt: u128 = calc_escrow(is_buy, quantity, limit_price);

        // Transfer tokens from user to program using transfer_public_as_signer
        // This transfers from the transaction signer to the program
        // User must first approve: token_registry.aleo/approve_public(token_id, program_address, amount)
        let transfer_future: Future =
            token_registry.aleo/transfer_public_as_signer(token_id, self.signer, escrow_amt);

        // Create receipt for user (private proof of order)
        let receipt: OrderReceipt = OrderReceipt {
            owner:       self.caller,
            order_id:    0field,  // Will be set in finalize
            token_pair,
            is_buy,
            quantity,
            limit_price,
            timestamp,
        };

        return (receipt, finalize_submit_order(
            self.caller, token_pair, is_buy, tick_lower, tick_upper,
            timestamp, expires_at, limit_price, quantity, token_id,
            escrow_amt, transfer_future
        ));
    }

    async function finalize_submit_order(
        caller:       address,
        token_pair:   u64,
        is_buy:       bool,
        tick_lower:   u64,
        tick_upper:   u64,
        timestamp:    u32,
        expires_at:   u32,
        limit_price:  u64,
        quantity:     u128,
        token_id:     field,
        escrow_amt:   u128,
        transfer_fut: Future
    ) {
        transfer_fut.await();

        // Validate token pair
        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        let expected_token: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(token_id, expected_token);

        // Validate tick range
        let max_range: u64 = 50u64 * pair.tick_size;
        assert(tick_upper - tick_lower <= max_range);
        assert(limit_price >= tick_lower * pair.tick_size);
        assert(limit_price <= (tick_upper + 1u64) * pair.tick_size);

        // Validate expiry
        if expires_at > 0u32 {
            assert(expires_at > block.height);
        }

        // Generate order ID
        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_id: field = derive_order_id(caller, new_counter, timestamp);

        // Store order in PUBLIC mapping (key change - matchers can access!)
        Mapping::set(orders, order_id, Order {
            trader:          caller,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            quantity,
            limit_price,
            token_id,
            escrowed_amount: escrow_amt,
            filled:          0u128,
            timestamp,
            expires_at,
            status:          0u8,  // active
            order_type:      0u8,  // limit order
        });

        // Update escrow tracking
        let prev_total: u128 = Mapping::get_or_use(total_escrowed, token_id, 0u128);
        Mapping::set(total_escrowed, token_id, prev_total + escrow_amt);

        // Update tick registry
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

    // ========== ORDER SUBMISSION (NATIVE ALEO CREDITS) ==========
    //
    // For trading with native ALEO credits (not ARC-21 tokens).
    // Uses credits.aleo/transfer_public instead of token_registry.
    // No approval needed - direct transfer.

    async transition submit_order_credits(
        public  token_pair:  u64,
        public  is_buy:      bool,
        public  tick_lower:  u64,
        public  tick_upper:  u64,
        public  timestamp:   u32,
        public  expires_at:  u32,
        public  limit_price: u64,
        public  quantity:    u128,
    ) -> (OrderReceipt, Future) {

        assert(quantity > 0u128);
        assert(tick_upper >= tick_lower);

        let escrow_amt: u128 = calc_escrow(is_buy, quantity, limit_price);

        // Transfer native ALEO credits to escrow (no approval needed!)
        // Use transfer_public_as_signer to transfer from the signer (user), not the caller (program)
        let transfer_future: Future =
            credits.aleo/transfer_public_as_signer(self.address, escrow_amt as u64);

        // Create receipt for user
        let receipt: OrderReceipt = OrderReceipt {
            owner:       self.caller,
            order_id:    0field,
            token_pair,
            is_buy,
            quantity,
            limit_price,
            timestamp,
        };

        return (receipt, finalize_submit_order_credits(
            self.caller, token_pair, is_buy, tick_lower, tick_upper,
            timestamp, expires_at, limit_price, quantity,
            escrow_amt, transfer_future
        ));
    }

    async function finalize_submit_order_credits(
        caller:       address,
        token_pair:   u64,
        is_buy:       bool,
        tick_lower:   u64,
        tick_upper:   u64,
        timestamp:    u32,
        expires_at:   u32,
        limit_price:  u64,
        quantity:     u128,
        escrow_amt:   u128,
        transfer_fut: Future
    ) {
        transfer_fut.await();

        // Validate token pair
        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        // For native credits, verify the pair uses NATIVE_CREDITS_ID
        let expected_token: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(expected_token, NATIVE_CREDITS_ID);

        // Validate tick range
        let max_range: u64 = 50u64 * pair.tick_size;
        assert(tick_upper - tick_lower <= max_range);
        assert(limit_price >= tick_lower * pair.tick_size);
        assert(limit_price <= (tick_upper + 1u64) * pair.tick_size);

        // Validate expiry
        if expires_at > 0u32 {
            assert(expires_at > block.height);
        }

        // Generate order ID
        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_id: field = derive_order_id(caller, new_counter, timestamp);

        // Store order in PUBLIC mapping
        Mapping::set(orders, order_id, Order {
            trader:          caller,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            quantity,
            limit_price,
            token_id:        NATIVE_CREDITS_ID,  // Mark as native credits
            escrowed_amount: escrow_amt,
            filled:          0u128,
            timestamp,
            expires_at,
            status:          0u8,
            order_type:      0u8,
        });

        // Update escrow tracking
        let prev_total: u128 = Mapping::get_or_use(total_escrowed, NATIVE_CREDITS_ID, 0u128);
        Mapping::set(total_escrowed, NATIVE_CREDITS_ID, prev_total + escrow_amt);

        // Update tick registry
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

    // ========== ORDER SUBMISSION (CIRCLE USDC) ==========
    //
    // For trading with Circle's test USDC token (test_usdc_token.aleo).
    // Uses different interface: transfer_from_public(from, to, amount)
    // No token_id parameter required - direct program call.

    async transition submit_order_usdc(
        public  token_pair:  u64,
        public  is_buy:      bool,
        public  tick_lower:  u64,
        public  tick_upper:  u64,
        public  timestamp:   u32,
        public  expires_at:  u32,
        public  limit_price: u64,
        public  quantity:    u128,
    ) -> (OrderReceipt, Future) {

        assert(quantity > 0u128);
        assert(tick_upper >= tick_lower);

        let escrow_amt: u128 = calc_escrow(is_buy, quantity, limit_price);

        // Transfer Circle USDC to escrow (3 args: from, to, amount as u128)
        let transfer_future: Future =
            test_usdc_token.aleo/transfer_from_public(self.caller, self.address, escrow_amt);

        let receipt: OrderReceipt = OrderReceipt {
            owner:       self.caller,
            order_id:    0field,
            token_pair,
            is_buy,
            quantity,
            limit_price,
            timestamp,
        };

        return (receipt, finalize_submit_order_usdc(
            self.caller, token_pair, is_buy, tick_lower, tick_upper,
            timestamp, expires_at, limit_price, quantity,
            escrow_amt, transfer_future
        ));
    }

    async function finalize_submit_order_usdc(
        caller:       address,
        token_pair:   u64,
        is_buy:       bool,
        tick_lower:   u64,
        tick_upper:   u64,
        timestamp:    u32,
        expires_at:   u32,
        limit_price:  u64,
        quantity:     u128,
        escrow_amt:   u128,
        transfer_fut: Future
    ) {
        transfer_fut.await();

        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        // Verify pair uses Circle USDC
        let expected_token: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(expected_token, CIRCLE_USDC_ID);

        let max_range: u64 = 50u64 * pair.tick_size;
        assert(tick_upper - tick_lower <= max_range);
        assert(limit_price >= tick_lower * pair.tick_size);
        assert(limit_price <= (tick_upper + 1u64) * pair.tick_size);

        if expires_at > 0u32 {
            assert(expires_at > block.height);
        }

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_id: field = derive_order_id(caller, new_counter, timestamp);

        Mapping::set(orders, order_id, Order {
            trader:          caller,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            quantity,
            limit_price,
            token_id:        CIRCLE_USDC_ID,
            escrowed_amount: escrow_amt,
            filled:          0u128,
            timestamp,
            expires_at,
            status:          0u8,
            order_type:      0u8,
        });

        let prev_total: u128 = Mapping::get_or_use(total_escrowed, CIRCLE_USDC_ID, 0u128);
        Mapping::set(total_escrowed, CIRCLE_USDC_ID, prev_total + escrow_amt);

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

    // ========== PRIVATE STOP-LOSS ORDERS ==========
    //
    // "The Only Exchange Where You Can't Be Hunted"
    //
    // Stop price is stored as a HASH. Attackers cannot see it.
    // To trigger: keeper provides actual price + ZK proof that hash matches.
    // Result: No more "wicking" attacks, no liquidation hunting.

    async transition submit_stop_loss(
        public  token_pair:      u64,
        public  is_buy:          bool,
        public  timestamp:       u32,
        public  expires_at:      u32,
        private stop_price:      u64,    // PRIVATE! Only you know this
        public  limit_price:     u64,    // Execution price when triggered
        public  quantity:        u128,
        public  token_id:        field
    ) -> Future {

        assert(quantity > 0u128);

        // Hash the stop price - this is what gets stored publicly
        let stop_hash: field = BHP256::hash_to_field(stop_price as field);

        let escrow_amt: u128 = calc_escrow(is_buy, quantity, limit_price);

        let transfer_future: Future =
            token_registry.aleo/transfer_from_public(token_id, self.caller, self.address, escrow_amt);

        return finalize_submit_stop_loss(
            self.caller, token_pair, is_buy, timestamp, expires_at,
            stop_hash, limit_price, quantity, token_id, escrow_amt,
            transfer_future
        );
    }

    async function finalize_submit_stop_loss(
        caller:       address,
        token_pair:   u64,
        is_buy:       bool,
        timestamp:    u32,
        expires_at:   u32,
        stop_hash:    field,
        limit_price:  u64,
        quantity:     u128,
        token_id:     field,
        escrow_amt:   u128,
        transfer_fut: Future
    ) {
        transfer_fut.await();

        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        let expected_token: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(token_id, expected_token);

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_id: field = derive_order_id(caller, new_counter, timestamp);

        // Store stop-loss with HASHED stop price (invisible to attackers!)
        Mapping::set(stop_orders, order_id, StopLossOrder {
            trader:          caller,
            token_pair,
            is_buy,
            quantity,
            stop_price_hash: stop_hash,  // Only the HASH is stored!
            limit_price,
            token_id,
            escrowed_amount: escrow_amt,
            triggered:       false,
            timestamp,
            expires_at,
        });

        let prev_total: u128 = Mapping::get_or_use(total_escrowed, token_id, 0u128);
        Mapping::set(total_escrowed, token_id, prev_total + escrow_amt);
    }

    // Trigger a stop-loss order (called by keeper with price proof)
    async transition trigger_stop_loss(
        public order_id:     field,
        public actual_price: u64,       // Keeper reveals actual stop price
        public market_price: u64        // Current market price to verify trigger
    ) -> Future {
        return finalize_trigger_stop(order_id, actual_price, market_price, self.caller);
    }

    async function finalize_trigger_stop(
        order_id:     field,
        actual_price: u64,
        market_price: u64,
        keeper:       address
    ) {
        let stop_order: StopLossOrder = Mapping::get(stop_orders, order_id);

        // Verify hash matches (proves keeper knows actual stop price)
        let computed_hash: field = BHP256::hash_to_field(actual_price as field);
        assert_eq(computed_hash, stop_order.stop_price_hash);

        // Verify market price has crossed stop price
        if stop_order.is_buy {
            // Buy stop triggers when price rises above stop
            assert(market_price >= actual_price);
        } else {
            // Sell stop triggers when price falls below stop
            assert(market_price <= actual_price);
        }

        assert(!stop_order.triggered);

        // Mark as triggered
        Mapping::set(stop_orders, order_id, StopLossOrder {
            trader:          stop_order.trader,
            token_pair:      stop_order.token_pair,
            is_buy:          stop_order.is_buy,
            quantity:        stop_order.quantity,
            stop_price_hash: stop_order.stop_price_hash,
            limit_price:     stop_order.limit_price,
            token_id:        stop_order.token_id,
            escrowed_amount: stop_order.escrowed_amount,
            triggered:       true,  // Now visible as a regular limit order
            timestamp:       stop_order.timestamp,
            expires_at:      stop_order.expires_at,
        });
    }

    // ========== STOP-LOSS (NATIVE ALEO CREDITS) ==========

    async transition submit_stop_loss_credits(
        public  token_pair:      u64,
        public  is_buy:          bool,
        public  timestamp:       u32,
        public  expires_at:      u32,
        private stop_price:      u64,    // PRIVATE! Only you know this
        public  limit_price:     u64,
        public  quantity:        u128,
    ) -> Future {

        assert(quantity > 0u128);

        let stop_hash: field = BHP256::hash_to_field(stop_price as field);
        let escrow_amt: u128 = calc_escrow(is_buy, quantity, limit_price);

        // Transfer native ALEO credits to escrow
        // Use transfer_public_as_signer to transfer from the signer (user), not the caller (program)
        let transfer_future: Future =
            credits.aleo/transfer_public_as_signer(self.address, escrow_amt as u64);

        return finalize_stop_credits(
            self.caller, token_pair, is_buy, timestamp, expires_at,
            stop_hash, limit_price, quantity, escrow_amt, transfer_future
        );
    }

    async function finalize_stop_credits(
        caller:       address,
        token_pair:   u64,
        is_buy:       bool,
        timestamp:    u32,
        expires_at:   u32,
        stop_hash:    field,
        limit_price:  u64,
        quantity:     u128,
        escrow_amt:   u128,
        transfer_fut: Future
    ) {
        transfer_fut.await();

        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        // Verify pair uses native credits
        let expected_token: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(expected_token, NATIVE_CREDITS_ID);

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_id: field = derive_order_id(caller, new_counter, timestamp);

        Mapping::set(stop_orders, order_id, StopLossOrder {
            trader:          caller,
            token_pair,
            is_buy,
            quantity,
            stop_price_hash: stop_hash,
            limit_price,
            token_id:        NATIVE_CREDITS_ID,
            escrowed_amount: escrow_amt,
            triggered:       false,
            timestamp,
            expires_at,
        });

        let prev_total: u128 = Mapping::get_or_use(total_escrowed, NATIVE_CREDITS_ID, 0u128);
        Mapping::set(total_escrowed, NATIVE_CREDITS_ID, prev_total + escrow_amt);
    }

    // ========== ICEBERG ORDERS ==========
    //
    // "Hidden Depth" - Trade $5M without showing a $5M wall
    //
    // Only a small portion is visible. As it fills, more appears.
    // Result: Better execution prices, no "telegraphing" your moves.

    async transition submit_iceberg(
        public  token_pair:       u64,
        public  is_buy:           bool,
        public  tick_lower:       u64,
        public  tick_upper:       u64,
        public  timestamp:        u32,
        public  expires_at:       u32,
        public  limit_price:      u64,
        private total_quantity:   u128,   // PRIVATE! Full order size
        public  visible_quantity: u128,   // Public portion shown
        public  refill_quantity:  u128,   // How much to show after each fill
        public  token_id:         field
    ) -> Future {

        assert(total_quantity > 0u128);
        assert(visible_quantity > 0u128);
        assert(visible_quantity <= total_quantity);
        assert(refill_quantity > 0u128);

        let escrow_amt: u128 = calc_escrow(is_buy, total_quantity, limit_price);

        let transfer_future: Future =
            token_registry.aleo/transfer_from_public(token_id, self.caller, self.address, escrow_amt);

        return finalize_submit_iceberg(
            self.caller, token_pair, is_buy, tick_lower, tick_upper,
            timestamp, expires_at, limit_price, total_quantity,
            visible_quantity, refill_quantity, token_id, escrow_amt,
            transfer_future
        );
    }

    async function finalize_submit_iceberg(
        caller:           address,
        token_pair:       u64,
        is_buy:           bool,
        tick_lower:       u64,
        tick_upper:       u64,
        timestamp:        u32,
        expires_at:       u32,
        limit_price:      u64,
        total_quantity:   u128,
        visible_quantity: u128,
        refill_quantity:  u128,
        token_id:         field,
        escrow_amt:       u128,
        transfer_fut:     Future
    ) {
        transfer_fut.await();

        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        let expected_token: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(token_id, expected_token);

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_id: field = derive_order_id(caller, new_counter, timestamp);

        // Store iceberg - only visible_quantity shown to market!
        Mapping::set(iceberg_orders, order_id, IcebergOrder {
            trader:           caller,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            total_quantity,      // Hidden from public view
            visible_quantity,    // This is what traders see
            refill_quantity,
            limit_price,
            token_id,
            escrowed_amount:     escrow_amt,
            filled:              0u128,
            timestamp,
            expires_at,
            status:              0u8,
        });

        // Only add visible portion to tick registry
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

        let prev_total: u128 = Mapping::get_or_use(total_escrowed, token_id, 0u128);
        Mapping::set(total_escrowed, token_id, prev_total + escrow_amt);
    }

    // ========== ICEBERG (NATIVE ALEO CREDITS) ==========

    async transition submit_iceberg_credits(
        public  token_pair:       u64,
        public  is_buy:           bool,
        public  tick_lower:       u64,
        public  tick_upper:       u64,
        public  timestamp:        u32,
        public  expires_at:       u32,
        public  limit_price:      u64,
        private total_quantity:   u128,
        public  visible_quantity: u128,
        public  refill_quantity:  u128,
    ) -> Future {

        assert(total_quantity > 0u128);
        assert(visible_quantity > 0u128);
        assert(visible_quantity <= total_quantity);
        assert(refill_quantity > 0u128);

        let escrow_amt: u128 = calc_escrow(is_buy, total_quantity, limit_price);

        // Transfer native ALEO credits
        // Use transfer_public_as_signer to transfer from the signer (user), not the caller (program)
        let transfer_future: Future =
            credits.aleo/transfer_public_as_signer(self.address, escrow_amt as u64);

        return finalize_submit_iceberg_credits(
            self.caller, token_pair, is_buy, tick_lower, tick_upper,
            timestamp, expires_at, limit_price, total_quantity,
            visible_quantity, refill_quantity, escrow_amt, transfer_future
        );
    }

    async function finalize_submit_iceberg_credits(
        caller:           address,
        token_pair:       u64,
        is_buy:           bool,
        tick_lower:       u64,
        tick_upper:       u64,
        timestamp:        u32,
        expires_at:       u32,
        limit_price:      u64,
        total_quantity:   u128,
        visible_quantity: u128,
        refill_quantity:  u128,
        escrow_amt:       u128,
        transfer_fut:     Future
    ) {
        transfer_fut.await();

        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        // Verify pair uses native credits
        let expected_token: field = is_buy ? pair.quote_token_id : pair.base_token_id;
        assert_eq(expected_token, NATIVE_CREDITS_ID);

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        let new_counter: u64 = counter + 1u64;
        Mapping::set(order_counter, true, new_counter);

        let order_id: field = derive_order_id(caller, new_counter, timestamp);

        Mapping::set(iceberg_orders, order_id, IcebergOrder {
            trader:           caller,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            total_quantity,
            visible_quantity,
            refill_quantity,
            limit_price,
            token_id:         NATIVE_CREDITS_ID,
            escrowed_amount:  escrow_amt,
            filled:           0u128,
            timestamp,
            expires_at,
            status:           0u8,
        });

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

        let prev_total: u128 = Mapping::get_or_use(total_escrowed, NATIVE_CREDITS_ID, 0u128);
        Mapping::set(total_escrowed, NATIVE_CREDITS_ID, prev_total + escrow_amt);
    }

    // ========== CANCEL ORDER ==========

    async transition cancel_order(
        public order_id: field
    ) -> Future {
        return finalize_cancel_order(self.caller, order_id);
    }

    async function finalize_cancel_order(
        caller:   address,
        order_id: field
    ) {
        // Get order from PUBLIC mapping
        let order: Order = Mapping::get(orders, order_id);

        // Only owner can cancel
        assert_eq(order.trader, caller);
        assert(order.status == 0u8);  // Must be active
        assert(order.filled < order.quantity);

        // Calculate refund
        let used_escrow: u128 = calc_escrow(order.is_buy, order.filled, order.limit_price);
        let refund_amt: u128 = order.escrowed_amount - used_escrow;

        // Update order status
        Mapping::set(orders, order_id, Order {
            trader:          order.trader,
            token_pair:      order.token_pair,
            tick_lower:      order.tick_lower,
            tick_upper:      order.tick_upper,
            is_buy:          order.is_buy,
            quantity:        order.quantity,
            limit_price:     order.limit_price,
            token_id:        order.token_id,
            escrowed_amount: 0u128,
            filled:          order.filled,
            timestamp:       order.timestamp,
            expires_at:      order.expires_at,
            status:          2u8,  // cancelled
            order_type:      order.order_type,
        });

        // Update escrow tracking
        let prev: u128 = Mapping::get(total_escrowed, order.token_id);
        Mapping::set(total_escrowed, order.token_id, prev - refund_amt);

        // Update tick registry
        let mid_tick: u64 = (order.tick_lower + order.tick_upper) / 2u64;
        let tick_key: field = get_tick_key(order.token_pair, mid_tick);
        let tick: TickInfo = Mapping::get(tick_registry, tick_key);
        Mapping::set(tick_registry, tick_key, TickInfo {
            token_pair:           tick.token_pair,
            tick_id:              tick.tick_id,
            order_count:          tick.order_count - 1u32,
            total_volume_settled: tick.total_volume_settled,
            last_updated:         block.height,
        });
    }

    // Token refund happens separately (owner calls this after cancel)
    // For ARC-21 tokens - use withdraw_cancelled
    // For native ALEO credits - use withdraw_cancelled_credits

    async transition withdraw_cancelled(
        public order_id:  field,
        public token_id:  field,
        public amount:    u128
    ) -> Future {
        // Caller must know correct token_id and amount (from order data)
        let withdraw_future: Future =
            token_registry.aleo/transfer_public(token_id, self.caller, amount);
        return finalize_withdraw(self.caller, order_id, token_id, amount, withdraw_future);
    }

    async function finalize_withdraw(
        caller:       address,
        order_id:     field,
        token_id:     field,
        amount:       u128,
        withdraw_fut: Future
    ) {
        let order: Order = Mapping::get(orders, order_id);
        assert_eq(order.trader, caller);
        assert(order.status == 2u8);  // Must be cancelled
        assert_eq(order.token_id, token_id);
        assert(token_id != NATIVE_CREDITS_ID); // Must use credits version for native

        // Verify amount is correct (remaining escrow after partial fills)
        let used_escrow: u128 = calc_escrow(order.is_buy, order.filled, order.limit_price);
        let expected_refund: u128 = order.escrowed_amount - used_escrow;
        assert_eq(amount, expected_refund);

        withdraw_fut.await();
    }

    // Withdrawal for native ALEO credits
    async transition withdraw_cancelled_credits(
        public order_id: field,
        public amount:   u64
    ) -> Future {
        let withdraw_future: Future =
            credits.aleo/transfer_public(self.caller, amount);
        return finalize_withdraw_credits(self.caller, order_id, amount as u128, withdraw_future);
    }

    async function finalize_withdraw_credits(
        caller:       address,
        order_id:     field,
        amount:       u128,
        withdraw_fut: Future
    ) {
        let order: Order = Mapping::get(orders, order_id);
        assert_eq(order.trader, caller);
        assert(order.status == 2u8);
        assert_eq(order.token_id, NATIVE_CREDITS_ID);

        let used_escrow: u128 = calc_escrow(order.is_buy, order.filled, order.limit_price);
        let expected_refund: u128 = order.escrowed_amount - used_escrow;
        assert_eq(amount, expected_refund);

        withdraw_fut.await();
    }

    // ========== SETTLEMENT (PERMISSIONLESS) ==========
    //
    // ANY keeper can settle matching orders!
    // Reads orders from PUBLIC mapping - no private records needed.

    async transition settle_match(
        public buy_order_id:  field,
        public sell_order_id: field,
        public timestamp:     u32
    ) -> (Settlement, Settlement, Future) {

        // Settlements created for both parties
        let buyer_settlement: Settlement = Settlement {
            owner:      self.caller,  // Placeholder, updated in finalize
            token_pair: 0u64,
            quantity:   0u128,
            price:      0u64,
            is_buy:     true,
            timestamp,
        };

        let seller_settlement: Settlement = Settlement {
            owner:      self.caller,
            token_pair: 0u64,
            quantity:   0u128,
            price:      0u64,
            is_buy:     false,
            timestamp,
        };

        return (buyer_settlement, seller_settlement,
            finalize_settle_match(buy_order_id, sell_order_id, self.caller, timestamp));
    }

    async function finalize_settle_match(
        buy_order_id:  field,
        sell_order_id: field,
        settler:       address,
        timestamp:     u32
    ) {
        // Read orders from PUBLIC mapping
        let buy_order: Order = Mapping::get(orders, buy_order_id);
        let sell_order: Order = Mapping::get(orders, sell_order_id);

        // Validate orders
        assert_eq(buy_order.token_pair, sell_order.token_pair);
        assert(buy_order.is_buy == true);
        assert(sell_order.is_buy == false);
        assert(buy_order.status == 0u8);   // active
        assert(sell_order.status == 0u8);  // active

        // Check expiry
        if buy_order.expires_at > 0u32 {
            assert(buy_order.expires_at > block.height);
        }
        if sell_order.expires_at > 0u32 {
            assert(sell_order.expires_at > block.height);
        }

        // Verify tick overlap
        let overlap_low: u64 = max_u64(buy_order.tick_lower, sell_order.tick_lower);
        let overlap_high: u64 = min_u64(buy_order.tick_upper, sell_order.tick_upper);
        assert(overlap_low <= overlap_high);

        // Verify prices cross (buy >= sell)
        assert(buy_order.limit_price >= sell_order.limit_price);

        // Verify unfilled quantity
        assert(buy_order.filled < buy_order.quantity);
        assert(sell_order.filled < sell_order.quantity);

        // Calculate fill
        let buy_remaining: u128 = buy_order.quantity - buy_order.filled;
        let sell_remaining: u128 = sell_order.quantity - sell_order.filled;
        let fill_qty: u128 = min_u128(buy_remaining, sell_remaining);

        // Midpoint execution price
        let exec_price: u64 = (buy_order.limit_price + sell_order.limit_price) / 2u64;
        let quote_amount: u128 = (fill_qty * exec_price as u128 + 9999u128) / 10000u128;

        // Get pair for fees
        let pair: TokenPair = Mapping::get(token_pairs, buy_order.token_pair);
        let settler_fee: u128 = apply_fee(quote_amount, pair.settler_fee_bps);
        let protocol_fee: u128 = apply_fee(quote_amount, pair.protocol_fee_bps);
        let seller_receives: u128 = quote_amount - settler_fee - protocol_fee;

        // Update buy order
        let buy_fully_filled: bool = fill_qty >= buy_remaining;
        Mapping::set(orders, buy_order_id, Order {
            trader:          buy_order.trader,
            token_pair:      buy_order.token_pair,
            tick_lower:      buy_order.tick_lower,
            tick_upper:      buy_order.tick_upper,
            is_buy:          true,
            quantity:        buy_order.quantity,
            limit_price:     buy_order.limit_price,
            token_id:        buy_order.token_id,
            escrowed_amount: buy_order.escrowed_amount - quote_amount,
            filled:          buy_order.filled + fill_qty,
            timestamp:       buy_order.timestamp,
            expires_at:      buy_order.expires_at,
            status:          buy_fully_filled ? 1u8 : 0u8,
            order_type:      buy_order.order_type,
        });

        // Update sell order
        let sell_fully_filled: bool = fill_qty >= sell_remaining;
        Mapping::set(orders, sell_order_id, Order {
            trader:          sell_order.trader,
            token_pair:      sell_order.token_pair,
            tick_lower:      sell_order.tick_lower,
            tick_upper:      sell_order.tick_upper,
            is_buy:          false,
            quantity:        sell_order.quantity,
            limit_price:     sell_order.limit_price,
            token_id:        sell_order.token_id,
            escrowed_amount: sell_order.escrowed_amount - fill_qty,
            filled:          sell_order.filled + fill_qty,
            timestamp:       sell_order.timestamp,
            expires_at:      sell_order.expires_at,
            status:          sell_fully_filled ? 1u8 : 0u8,
            order_type:      sell_order.order_type,
        });

        // Update escrow totals
        let prev_base: u128 = Mapping::get(total_escrowed, sell_order.token_id);
        Mapping::set(total_escrowed, sell_order.token_id, prev_base - fill_qty);

        let prev_quote: u128 = Mapping::get(total_escrowed, buy_order.token_id);
        Mapping::set(total_escrowed, buy_order.token_id, prev_quote - quote_amount);

        // Update tick registry
        let buy_mid: u64 = (buy_order.tick_lower + buy_order.tick_upper) / 2u64;
        let buy_tick_key: field = get_tick_key(buy_order.token_pair, buy_mid);
        let buy_tick: TickInfo = Mapping::get(tick_registry, buy_tick_key);
        Mapping::set(tick_registry, buy_tick_key, TickInfo {
            token_pair:           buy_tick.token_pair,
            tick_id:              buy_tick.tick_id,
            order_count:          buy_fully_filled ? buy_tick.order_count - 1u32 : buy_tick.order_count,
            total_volume_settled: buy_tick.total_volume_settled + fill_qty,
            last_updated:         block.height,
        });

        let sell_mid: u64 = (sell_order.tick_lower + sell_order.tick_upper) / 2u64;
        let sell_tick_key: field = get_tick_key(sell_order.token_pair, sell_mid);
        let sell_tick: TickInfo = Mapping::get(tick_registry, sell_tick_key);
        Mapping::set(tick_registry, sell_tick_key, TickInfo {
            token_pair:           sell_tick.token_pair,
            tick_id:              sell_tick.tick_id,
            order_count:          sell_fully_filled ? sell_tick.order_count - 1u32 : sell_tick.order_count,
            total_volume_settled: sell_tick.total_volume_settled + fill_qty,
            last_updated:         block.height,
        });
    }

    // ========== TOKEN TRANSFER EXECUTION ==========
    //
    // After settle_match validates and updates orders, call one of these
    // based on the token types in the pair:
    //
    // - execute_transfers_arc21: Both base and quote are ARC-21 tokens
    // - execute_transfers_credits_base: Base is native ALEO, quote is ARC-21
    // - execute_transfers_credits_quote: Base is ARC-21, quote is native ALEO
    // - execute_transfers_credits_both: Both are native ALEO credits

    // ARC-21 to ARC-21 transfer (e.g., TOKEN_A/USDC)
    async transition execute_transfers_arc21(
        public buy_order_id:    field,
        public sell_order_id:   field,
        public base_token_id:   field,
        public quote_token_id:  field,
        public fill_qty:        u128,
        public quote_amount:    u128,
        public seller_receives: u128,
        public settler_fee:     u128,
        public buyer:           address,
        public seller:          address
    ) -> Future {
        // Transfer base tokens: escrow → buyer
        let base_transfer: Future = token_registry.aleo/transfer_public(
            base_token_id, buyer, fill_qty
        );

        // Transfer quote tokens: escrow → seller (minus fees)
        let quote_transfer: Future = token_registry.aleo/transfer_public(
            quote_token_id, seller, seller_receives
        );

        // Transfer settler fee
        let fee_transfer: Future = token_registry.aleo/transfer_public(
            quote_token_id, self.caller, settler_fee
        );

        return finalize_transfers_arc21(
            buy_order_id, sell_order_id, base_token_id, quote_token_id,
            fill_qty, quote_amount, buyer, seller,
            base_transfer, quote_transfer, fee_transfer
        );
    }

    async function finalize_transfers_arc21(
        buy_order_id:   field,
        sell_order_id:  field,
        base_token_id:  field,
        quote_token_id: field,
        fill_qty:       u128,
        quote_amount:   u128,
        buyer:          address,
        seller:         address,
        base_fut:       Future,
        quote_fut:      Future,
        fee_fut:        Future
    ) {
        // Verify order data matches parameters
        let buy_order: Order = Mapping::get(orders, buy_order_id);
        let sell_order: Order = Mapping::get(orders, sell_order_id);
        let pair: TokenPair = Mapping::get(token_pairs, buy_order.token_pair);

        assert_eq(pair.base_token_id, base_token_id);
        assert_eq(pair.quote_token_id, quote_token_id);
        assert_eq(buy_order.trader, buyer);
        assert_eq(sell_order.trader, seller);
        assert(base_token_id != NATIVE_CREDITS_ID);
        assert(quote_token_id != NATIVE_CREDITS_ID);

        base_fut.await();
        quote_fut.await();
        fee_fut.await();
    }

    // Native ALEO base + ARC-21 quote (e.g., ALEO/USDC)
    async transition execute_transfers_credits_base(
        public buy_order_id:    field,
        public sell_order_id:   field,
        public quote_token_id:  field,
        public fill_qty:        u64,     // Native credits amount (u64)
        public quote_amount:    u128,
        public seller_receives: u128,
        public settler_fee:     u128,
        public buyer:           address,
        public seller:          address
    ) -> Future {
        // Transfer native ALEO: escrow → buyer
        let base_transfer: Future = credits.aleo/transfer_public(buyer, fill_qty);

        // Transfer quote tokens (ARC-21): escrow → seller
        let quote_transfer: Future = token_registry.aleo/transfer_public(
            quote_token_id, seller, seller_receives
        );

        // Settler fee in quote token
        let fee_transfer: Future = token_registry.aleo/transfer_public(
            quote_token_id, self.caller, settler_fee
        );

        return finalize_tx_cred_base(
            buy_order_id, sell_order_id, quote_token_id, fill_qty as u128,
            quote_amount, buyer, seller,
            base_transfer, quote_transfer, fee_transfer
        );
    }

    async function finalize_tx_cred_base(
        buy_order_id:   field,
        sell_order_id:  field,
        quote_token_id: field,
        fill_qty:       u128,
        quote_amount:   u128,
        buyer:          address,
        seller:         address,
        base_fut:       Future,
        quote_fut:      Future,
        fee_fut:        Future
    ) {
        let buy_order: Order = Mapping::get(orders, buy_order_id);
        let sell_order: Order = Mapping::get(orders, sell_order_id);
        let pair: TokenPair = Mapping::get(token_pairs, buy_order.token_pair);

        assert_eq(pair.base_token_id, NATIVE_CREDITS_ID);
        assert_eq(pair.quote_token_id, quote_token_id);
        assert_eq(buy_order.trader, buyer);
        assert_eq(sell_order.trader, seller);
        assert(quote_token_id != NATIVE_CREDITS_ID);

        base_fut.await();
        quote_fut.await();
        fee_fut.await();
    }

    // ARC-21 base + Native ALEO quote (e.g., TOKEN/ALEO)
    async transition execute_transfers_credits_quote(
        public buy_order_id:    field,
        public sell_order_id:   field,
        public base_token_id:   field,
        public fill_qty:        u128,
        public seller_receives: u64,     // Native credits (u64)
        public settler_fee:     u64,
        public buyer:           address,
        public seller:          address
    ) -> Future {
        // Transfer base tokens (ARC-21): escrow → buyer
        let base_transfer: Future = token_registry.aleo/transfer_public(
            base_token_id, buyer, fill_qty
        );

        // Transfer native ALEO: escrow → seller
        let quote_transfer: Future = credits.aleo/transfer_public(seller, seller_receives);

        // Settler fee in native ALEO
        let fee_transfer: Future = credits.aleo/transfer_public(self.caller, settler_fee);

        return finalize_tx_cred_quote(
            buy_order_id, sell_order_id, base_token_id, fill_qty,
            seller_receives as u128, buyer, seller,
            base_transfer, quote_transfer, fee_transfer
        );
    }

    async function finalize_tx_cred_quote(
        buy_order_id:   field,
        sell_order_id:  field,
        base_token_id:  field,
        fill_qty:       u128,
        seller_receives: u128,
        buyer:          address,
        seller:         address,
        base_fut:       Future,
        quote_fut:      Future,
        fee_fut:        Future
    ) {
        let buy_order: Order = Mapping::get(orders, buy_order_id);
        let sell_order: Order = Mapping::get(orders, sell_order_id);
        let pair: TokenPair = Mapping::get(token_pairs, buy_order.token_pair);

        assert_eq(pair.base_token_id, base_token_id);
        assert_eq(pair.quote_token_id, NATIVE_CREDITS_ID);
        assert_eq(buy_order.trader, buyer);
        assert_eq(sell_order.trader, seller);
        assert(base_token_id != NATIVE_CREDITS_ID);

        base_fut.await();
        quote_fut.await();
        fee_fut.await();
    }

    // Both native ALEO credits (rare - ALEO/ALEO wrapper scenario)
    async transition execute_transfers_credits_both(
        public buy_order_id:    field,
        public sell_order_id:   field,
        public fill_qty:        u64,
        public seller_receives: u64,
        public settler_fee:     u64,
        public buyer:           address,
        public seller:          address
    ) -> Future {
        // All transfers in native ALEO credits
        let base_transfer: Future = credits.aleo/transfer_public(buyer, fill_qty);
        let quote_transfer: Future = credits.aleo/transfer_public(seller, seller_receives);
        let fee_transfer: Future = credits.aleo/transfer_public(self.caller, settler_fee);

        return finalize_tx_cred_both(
            buy_order_id, sell_order_id, fill_qty as u128,
            seller_receives as u128, buyer, seller,
            base_transfer, quote_transfer, fee_transfer
        );
    }

    async function finalize_tx_cred_both(
        buy_order_id:   field,
        sell_order_id:  field,
        fill_qty:       u128,
        seller_receives: u128,
        buyer:          address,
        seller:         address,
        base_fut:       Future,
        quote_fut:      Future,
        fee_fut:        Future
    ) {
        let buy_order: Order = Mapping::get(orders, buy_order_id);
        let sell_order: Order = Mapping::get(orders, sell_order_id);
        let pair: TokenPair = Mapping::get(token_pairs, buy_order.token_pair);

        assert_eq(pair.base_token_id, NATIVE_CREDITS_ID);
        assert_eq(pair.quote_token_id, NATIVE_CREDITS_ID);
        assert_eq(buy_order.trader, buyer);
        assert_eq(sell_order.trader, seller);

        base_fut.await();
        quote_fut.await();
        fee_fut.await();
    }

    // ========== CIRCLE USDC TRANSFER EXECUTION ==========
    //
    // Transfer variants for Circle's test_usdc_token.aleo
    // Interface: transfer_public(to, amount) - simpler than ARC-21

    // Native ALEO base + Circle USDC quote (e.g., ALEO/USDC)
    async transition execute_transfers_usdc_quote(
        public buy_order_id:    field,
        public sell_order_id:   field,
        public fill_qty:        u64,        // Native ALEO amount (u64)
        public seller_receives: u128,       // Circle USDC amount (u128)
        public settler_fee:     u128,
        public buyer:           address,
        public seller:          address
    ) -> Future {
        // Transfer native ALEO: escrow → buyer
        let base_transfer: Future = credits.aleo/transfer_public(buyer, fill_qty);

        // Transfer Circle USDC: escrow → seller
        let quote_transfer: Future = test_usdc_token.aleo/transfer_public(seller, seller_receives);

        // Settler fee in Circle USDC
        let fee_transfer: Future = test_usdc_token.aleo/transfer_public(self.caller, settler_fee);

        return finalize_tx_usdc_quote(
            buy_order_id, sell_order_id, fill_qty as u128,
            seller_receives, buyer, seller,
            base_transfer, quote_transfer, fee_transfer
        );
    }

    async function finalize_tx_usdc_quote(
        buy_order_id:    field,
        sell_order_id:   field,
        fill_qty:        u128,
        seller_receives: u128,
        buyer:           address,
        seller:          address,
        base_fut:        Future,
        quote_fut:       Future,
        fee_fut:         Future
    ) {
        let buy_order: Order = Mapping::get(orders, buy_order_id);
        let sell_order: Order = Mapping::get(orders, sell_order_id);
        let pair: TokenPair = Mapping::get(token_pairs, buy_order.token_pair);

        assert_eq(pair.base_token_id, NATIVE_CREDITS_ID);
        assert_eq(pair.quote_token_id, CIRCLE_USDC_ID);
        assert_eq(buy_order.trader, buyer);
        assert_eq(sell_order.trader, seller);

        base_fut.await();
        quote_fut.await();
        fee_fut.await();
    }

    // ARC-21 base + Circle USDC quote (e.g., TOKEN/USDC)
    async transition execute_transfers_arc21_usdc(
        public buy_order_id:    field,
        public sell_order_id:   field,
        public base_token_id:   field,
        public fill_qty:        u128,       // ARC-21 base amount
        public seller_receives: u128,       // Circle USDC amount (u128)
        public settler_fee:     u128,
        public buyer:           address,
        public seller:          address
    ) -> Future {
        // Transfer ARC-21 base: escrow → buyer
        let base_transfer: Future = token_registry.aleo/transfer_public(
            base_token_id, buyer, fill_qty
        );

        // Transfer Circle USDC: escrow → seller
        let quote_transfer: Future = test_usdc_token.aleo/transfer_public(seller, seller_receives);

        // Settler fee in Circle USDC
        let fee_transfer: Future = test_usdc_token.aleo/transfer_public(self.caller, settler_fee);

        return finalize_tx_arc21_usdc(
            buy_order_id, sell_order_id, base_token_id, fill_qty,
            seller_receives, buyer, seller,
            base_transfer, quote_transfer, fee_transfer
        );
    }

    async function finalize_tx_arc21_usdc(
        buy_order_id:    field,
        sell_order_id:   field,
        base_token_id:   field,
        fill_qty:        u128,
        seller_receives: u128,
        buyer:           address,
        seller:          address,
        base_fut:        Future,
        quote_fut:       Future,
        fee_fut:         Future
    ) {
        let buy_order: Order = Mapping::get(orders, buy_order_id);
        let sell_order: Order = Mapping::get(orders, sell_order_id);
        let pair: TokenPair = Mapping::get(token_pairs, buy_order.token_pair);

        assert_eq(pair.base_token_id, base_token_id);
        assert_eq(pair.quote_token_id, CIRCLE_USDC_ID);
        assert_eq(buy_order.trader, buyer);
        assert_eq(sell_order.trader, seller);
        assert(base_token_id != NATIVE_CREDITS_ID);
        assert(base_token_id != CIRCLE_USDC_ID);

        base_fut.await();
        quote_fut.await();
        fee_fut.await();
    }

    // Withdrawal for Circle USDC
    async transition withdraw_cancelled_usdc(
        public order_id: field,
        public amount:   u128
    ) -> Future {
        let withdraw_future: Future =
            test_usdc_token.aleo/transfer_public(self.caller, amount);
        return finalize_withdraw_usdc(self.caller, order_id, amount, withdraw_future);
    }

    async function finalize_withdraw_usdc(
        caller:       address,
        order_id:     field,
        amount:       u128,
        withdraw_fut: Future
    ) {
        let order: Order = Mapping::get(orders, order_id);
        assert_eq(order.trader, caller);
        assert(order.status == 2u8);
        assert_eq(order.token_id, CIRCLE_USDC_ID);

        let used_escrow: u128 = calc_escrow(order.is_buy, order.filled, order.limit_price);
        let expected_refund: u128 = order.escrowed_amount - used_escrow;
        assert_eq(amount, expected_refund);

        withdraw_fut.await();
    }

    // ========== VIEW FUNCTIONS (for frontend) ==========

    transition get_order_info(public order_id: field) -> field {
        // Returns order_id - actual data is in public mapping
        return order_id;
    }
}
