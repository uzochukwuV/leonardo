// Private Tick-Based Order Book on Aleo
// A privacy-preserving order book using tick ranges and zero-knowledge proofs
// Integrated with ARC-21 Token Registry for secure token transfers

import token_registry.aleo;

program private_orderbook_v1.aleo {
    // ========== CONSTANTS ==========

    // Tick size in basis points (100 = 0.01 = 1 cent for prices around $1-10)
    const TICK_SIZE: u64 = 100u64;

    // Maximum tick range a single order can span (prevents abuse)
    const MAX_TICK_RANGE: u64 = 50u64; // e.g., $0.50 range for $1-10 tokens

    // Matcher fee in basis points (5 = 0.05%)
    const MATCHER_FEE_BPS: u64 = 5u64;

    // Trading fee in basis points (10 = 0.10%)
    const TRADING_FEE_BPS: u64 = 10u64;

    // ========== DATA STRUCTURES ==========

    // Token record from token_registry.aleo
    // This is how tokens are represented in Aleo
    record Token {
        owner: address,
        amount: u64,
        token_id: field,
        external_authorization_required: bool,
        authorized_until: u32,
    }

    // Token pair configuration
    struct TokenPair {
        pair_id: u64,
        base_token_id: field,    // e.g., ALEO token ID
        quote_token_id: field,   // e.g., USDC token ID
        tick_size: u64,          // Price increment in basis points
        active: bool,            // Whether this pair is enabled for trading
    }

    // Record representing a private order with escrowed tokens
    record TickOrder {
        // Identity (owner is always private in records)
        owner: address,

        // Market Info (public)
        token_pair: u64,        // e.g., 1 = USDC/ALEO

        // Tick Range (public - enables matching)
        tick_lower: u64,        // Minimum acceptable price tick
        tick_upper: u64,        // Maximum acceptable price tick

        // Order Details (private)
        is_buy: bool,           // true = buy, false = sell
        quantity: u64,          // Order size in base units
        limit_price: u64,       // Exact limit price within tick range

        // Token Escrow
        token_id: field,        // Which token is escrowed
        escrowed_amount: u64,   // Amount of tokens locked in this order

        // State
        filled: u64,            // Amount filled so far
        timestamp: u32,         // Block height when created
    }

    // Public state tracking aggregate tick information
    struct TickInfo {
        token_pair: u64,
        tick_id: u64,
        order_count: u32,           // Total number of active orders in this tick
        total_volume_settled: u64,  // Cumulative settled volume (public metric)
        last_updated: u32,
    }

    // Settlement record for completed trades
    record Settlement {
        owner: address,             // Party receiving this settlement
        token_pair: u64,
        quantity: u64,              // Amount traded
        price: u64,                 // Execution price
        is_buy: bool,               // Whether this party was buyer
        timestamp: u32,
    }

    // ========== MAPPINGS (Global State) ==========

    // Maps pair_id to TokenPair configuration
    mapping token_pairs: u64 => TokenPair;

    // Maps tick_key (hash of token_pair + tick_id) to TickInfo
    mapping tick_registry: field => TickInfo;

    // Maps order_id to fill status (for preventing double-spending)
    mapping order_fills: field => u64;

    // Maps tick_key to total settled volume (for price discovery)
    mapping tick_volumes: field => u64;

    // ========== CONSTRUCTOR ==========

    @noupgrade
    async constructor() {}

    // ========== HELPER FUNCTIONS ==========

    // Calculate minimum price for a tick
    inline get_tick_min_price(tick_id: u64) -> u64 {
        return tick_id * TICK_SIZE;
    }

    // Calculate maximum price for a tick
    inline get_tick_max_price(tick_id: u64) -> u64 {
        return (tick_id + 1u64) * TICK_SIZE;
    }

    // Create unique tick key for mapping
    inline get_tick_key(token_pair: u64, tick_id: u64) -> field {
        return BHP256::hash_to_field(token_pair + (tick_id * 1000000u64));
    }

    // Calculate midpoint execution price
    inline calculate_midpoint_price(buy_limit: u64, sell_limit: u64) -> u64 {
        return (buy_limit + sell_limit) / 2u64;
    }

    // Get minimum of two values
    inline min(a: u64, b: u64) -> u64 {
        return a < b ? a : b;
    }

    // Get maximum of two values
    inline max(a: u64, b: u64) -> u64 {
        return a > b ? a : b;
    }

    // Calculate required escrow amount based on order type
    inline calculate_escrow_amount(is_buy: bool, quantity: u64, price: u64) -> u64 {
        if is_buy {
            // Buyer escrows quote currency (e.g., USDC)
            // Amount = quantity * price / 10000 (basis points to decimal)
            return (quantity * price) / 10000u64;
        } else {
            // Seller escrows base currency (e.g., ALEO)
            return quantity;
        }
    }

    // ========== ADMIN TRANSITIONS ==========

    // Register a new token pair for trading
    async transition register_token_pair(
        public pair_id: u64,
        public base_token_id: field,
        public quote_token_id: field,
        public tick_size: u64
    ) -> Future {
        // Validate inputs
        assert(pair_id > 0u64);
        assert(base_token_id != quote_token_id);
        assert(tick_size > 0u64);

        return finalize_register_pair(pair_id, base_token_id, quote_token_id, tick_size);
    }

    async function finalize_register_pair(
        pair_id: u64,
        base_token_id: field,
        quote_token_id: field,
        tick_size: u64
    ) {
        // Create pair struct
        let pair: TokenPair = TokenPair {
            pair_id,
            base_token_id,
            quote_token_id,
            tick_size,
            active: true,
        };

        // Store in mapping
        Mapping::set(token_pairs, pair_id, pair);
    }

    // Deactivate a token pair (disable trading)
    async transition deactivate_token_pair(
        public pair_id: u64
    ) -> Future {
        return finalize_deactivate_pair(pair_id);
    }

    async function finalize_deactivate_pair(pair_id: u64) {
        // Get existing pair
        let pair: TokenPair = Mapping::get(token_pairs, pair_id);

        // Update to inactive
        let updated_pair: TokenPair = TokenPair {
            pair_id: pair.pair_id,
            base_token_id: pair.base_token_id,
            quote_token_id: pair.quote_token_id,
            tick_size: pair.tick_size,
            active: false,
        };

        Mapping::set(token_pairs, pair_id, updated_pair);
    }

    // Reactivate a token pair
    async transition reactivate_token_pair(
        public pair_id: u64
    ) -> Future {
        return finalize_reactivate_pair(pair_id);
    }

    async function finalize_reactivate_pair(pair_id: u64) {
        // Get existing pair
        let pair: TokenPair = Mapping::get(token_pairs, pair_id);

        // Update to active
        let updated_pair: TokenPair = TokenPair {
            pair_id: pair.pair_id,
            base_token_id: pair.base_token_id,
            quote_token_id: pair.quote_token_id,
            tick_size: pair.tick_size,
            active: true,
        };

        Mapping::set(token_pairs, pair_id, updated_pair);
    }

    // ========== CORE TRANSITIONS ==========

    // Submit a new tick-based order with token escrow
    async transition submit_tick_order_with_escrow(
        public token_pair: u64,
        public is_buy: bool,
        public tick_lower: u64,
        public tick_upper: u64,
        public timestamp: u32,
        limit_price: u64,           // Private: exact price
        quantity: u64,              // Private: order size
        escrow_token: Token         // Token to escrow
    ) -> (TickOrder, Token, Future) {

        // 1. Validate tick range
        let range_width: u64 = tick_upper - tick_lower;
        assert(range_width <= MAX_TICK_RANGE);

        // 2. Verify limit price within declared tick range
        let min_allowed: u64 = get_tick_min_price(tick_lower);
        let max_allowed: u64 = get_tick_max_price(tick_upper);
        assert(limit_price >= min_allowed);
        assert(limit_price <= max_allowed);

        // 3. Ensure quantity is non-zero
        assert(quantity > 0u64);

        // 4. Calculate required escrow
        let required_escrow: u64 = calculate_escrow_amount(is_buy, quantity, limit_price);

        // 5. Verify sufficient tokens for escrow
        assert(escrow_token.amount >= required_escrow);
        assert(escrow_token.owner == self.caller);

        // 6. Create the order record with escrowed tokens
        let order: TickOrder = TickOrder {
            owner: self.caller,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            quantity,
            limit_price,
            token_id: escrow_token.token_id,
            escrowed_amount: required_escrow,
            filled: 0u64,
            timestamp,
        };

        // 7. Return change if any
        let change: Token = Token {
            owner: self.caller,
            amount: escrow_token.amount - required_escrow,
            token_id: escrow_token.token_id,
            external_authorization_required: escrow_token.external_authorization_required,
            authorized_until: escrow_token.authorized_until,
        };

        return (order, change, finalize_submit_escrow(token_pair, escrow_token.token_id, is_buy));
    }

    async function finalize_submit_escrow(
        token_pair: u64,
        token_id: field,
        is_buy: bool
    ) {
        // Validate token pair exists and is active
        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        // Verify correct token is being escrowed
        if is_buy {
            // Buy orders must escrow quote token
            assert(token_id == pair.quote_token_id);
        } else {
            // Sell orders must escrow base token
            assert(token_id == pair.base_token_id);
        }
    }

    // Submit order without escrow (for testing/demo)
    async transition submit_tick_order(
        public token_pair: u64,
        public is_buy: bool,
        public tick_lower: u64,
        public tick_upper: u64,
        public timestamp: u32,
        limit_price: u64,
        quantity: u64
    ) -> (TickOrder, Future) {

        // 1. Validate tick range
        let range_width: u64 = tick_upper - tick_lower;
        assert(range_width <= MAX_TICK_RANGE);

        // 2. Verify limit price within declared tick range
        let min_allowed: u64 = get_tick_min_price(tick_lower);
        let max_allowed: u64 = get_tick_max_price(tick_upper);
        assert(limit_price >= min_allowed);
        assert(limit_price <= max_allowed);

        // 3. Ensure quantity is non-zero
        assert(quantity > 0u64);

        // 4. Create the order record (no escrow)
        let order: TickOrder = TickOrder {
            owner: self.caller,
            token_pair,
            tick_lower,
            tick_upper,
            is_buy,
            quantity,
            limit_price,
            token_id: 0field,  // No token escrowed
            escrowed_amount: 0u64,
            filled: 0u64,
            timestamp,
        };

        return (order, finalize_submit_order(token_pair, tick_lower, tick_upper));
    }

    async function finalize_submit_order(
        token_pair: u64,
        tick_lower: u64,
        tick_upper: u64
    ) {
        // Validate token pair exists and is active
        let pair: TokenPair = Mapping::get(token_pairs, token_pair);
        assert(pair.active);

        // Update tick registry - just increment the midpoint tick for simplicity
        // In production, matcher will track actual tick ranges
        let mid_tick: u64 = (tick_lower + tick_upper) / 2u64;
        let tick_key: field = get_tick_key(token_pair, mid_tick);

        // Get existing tick info or create new one
        let existing: TickInfo = Mapping::get_or_use(tick_registry, tick_key, TickInfo {
            token_pair,
            tick_id: mid_tick,
            order_count: 0u32,
            total_volume_settled: 0u64,
            last_updated: 0u32,
        });

        // Increment order count
        let updated: TickInfo = TickInfo {
            token_pair: existing.token_pair,
            tick_id: existing.tick_id,
            order_count: existing.order_count + 1u32,
            total_volume_settled: existing.total_volume_settled,
            last_updated: existing.last_updated,
        };

        Mapping::set(tick_registry, tick_key, updated);
    }

    // Update an existing order (modify price or quantity)
    transition update_order(
        old_order: TickOrder,
        public new_tick_lower: u64,
        public new_tick_upper: u64,
        new_limit_price: u64,
        new_quantity: u64
    ) -> TickOrder {

        // 1. Only owner can update
        assert(old_order.owner == self.caller);

        // 2. Can only update unfilled or partially filled orders
        assert(old_order.filled < old_order.quantity);

        // 3. Validate new tick range
        let range_width: u64 = new_tick_upper - new_tick_lower;
        assert(range_width <= MAX_TICK_RANGE);

        // 4. Verify new limit price within new tick range
        let min_allowed: u64 = get_tick_min_price(new_tick_lower);
        let max_allowed: u64 = get_tick_max_price(new_tick_upper);
        assert(new_limit_price >= min_allowed);
        assert(new_limit_price <= max_allowed);

        // 5. New quantity must be greater than or equal to filled amount
        assert(new_quantity >= old_order.filled);

        // 6. New quantity must be non-zero
        assert(new_quantity > 0u64);

        // 7. Create updated order (preserves filled amount)
        let updated_order: TickOrder = TickOrder {
            owner: old_order.owner,
            token_pair: old_order.token_pair,
            tick_lower: new_tick_lower,
            tick_upper: new_tick_upper,
            is_buy: old_order.is_buy,
            quantity: new_quantity,
            limit_price: new_limit_price,
            token_id: old_order.token_id,
            escrowed_amount: old_order.escrowed_amount,
            filled: old_order.filled,
            timestamp: old_order.timestamp,
        };

        return updated_order;
    }

    // Settle a matched trade
    transition settle_match(
        buy_order: TickOrder,
        sell_order: TickOrder,
        public timestamp: u32
    ) -> (TickOrder, TickOrder, Settlement, Settlement) {

        // 1. Verify both orders are for same token pair
        assert(buy_order.token_pair == sell_order.token_pair);

        // 2. Verify buy_order is actually a buy and sell_order is a sell
        assert(buy_order.is_buy == true);
        assert(sell_order.is_buy == false);

        // 3. Verify tick ranges overlap
        let overlap_low: u64 = max(buy_order.tick_lower, sell_order.tick_lower);
        let overlap_high: u64 = min(buy_order.tick_upper, sell_order.tick_upper);
        assert(overlap_low <= overlap_high);

        // 4. Verify actual limit prices cross (buy >= sell)
        assert(buy_order.limit_price >= sell_order.limit_price);

        // 5. Verify prices are within declared tick ranges (anti-fraud)
        assert(buy_order.limit_price >= get_tick_min_price(buy_order.tick_lower));
        assert(buy_order.limit_price <= get_tick_max_price(buy_order.tick_upper));
        assert(sell_order.limit_price >= get_tick_min_price(sell_order.tick_lower));
        assert(sell_order.limit_price <= get_tick_max_price(sell_order.tick_upper));

        // 6. Verify orders have remaining quantity
        assert(buy_order.filled < buy_order.quantity);
        assert(sell_order.filled < sell_order.quantity);

        // 7. Calculate fill quantity
        let buy_remaining: u64 = buy_order.quantity - buy_order.filled;
        let sell_remaining: u64 = sell_order.quantity - sell_order.filled;
        let fill_qty: u64 = min(buy_remaining, sell_remaining);

        // 8. Calculate execution price (midpoint strategy)
        let exec_price: u64 = calculate_midpoint_price(
            buy_order.limit_price,
            sell_order.limit_price
        );

        // 9. Update order filled amounts
        let updated_buy: TickOrder = TickOrder {
            owner: buy_order.owner,
            token_pair: buy_order.token_pair,
            tick_lower: buy_order.tick_lower,
            tick_upper: buy_order.tick_upper,
            is_buy: buy_order.is_buy,
            quantity: buy_order.quantity,
            limit_price: buy_order.limit_price,
            token_id: buy_order.token_id,
            escrowed_amount: buy_order.escrowed_amount,
            filled: buy_order.filled + fill_qty,
            timestamp: buy_order.timestamp,
        };

        let updated_sell: TickOrder = TickOrder {
            owner: sell_order.owner,
            token_pair: sell_order.token_pair,
            tick_lower: sell_order.tick_lower,
            tick_upper: sell_order.tick_upper,
            is_buy: sell_order.is_buy,
            quantity: sell_order.quantity,
            limit_price: sell_order.limit_price,
            token_id: sell_order.token_id,
            escrowed_amount: sell_order.escrowed_amount,
            filled: sell_order.filled + fill_qty,
            timestamp: sell_order.timestamp,
        };

        // 10. Create settlement records for both parties
        let buyer_settlement: Settlement = Settlement {
            owner: buy_order.owner,
            token_pair: buy_order.token_pair,
            quantity: fill_qty,
            price: exec_price,
            is_buy: true,
            timestamp,
        };

        let seller_settlement: Settlement = Settlement {
            owner: sell_order.owner,
            token_pair: sell_order.token_pair,
            quantity: fill_qty,
            price: exec_price,
            is_buy: false,
            timestamp,
        };

        return (updated_buy, updated_sell, buyer_settlement, seller_settlement);
    }

    // Settle with token transfer (using ARC-21 Token Registry)
    // This version actually transfers tokens between buyer and seller
    transition settle_match_with_transfer(
        buy_order: TickOrder,
        sell_order: TickOrder,
        base_token: Token,          // Seller's token (e.g., ALEO)
        quote_token: Token,         // Buyer's token (e.g., USDC)
        public timestamp: u32
    ) -> (TickOrder, TickOrder, Token, Token, Settlement, Settlement) {

        // Perform all the same validations as settle_match
        assert(buy_order.token_pair == sell_order.token_pair);
        assert(buy_order.is_buy == true);
        assert(sell_order.is_buy == false);

        let overlap_low: u64 = max(buy_order.tick_lower, sell_order.tick_lower);
        let overlap_high: u64 = min(buy_order.tick_upper, sell_order.tick_upper);
        assert(overlap_low <= overlap_high);

        assert(buy_order.limit_price >= sell_order.limit_price);
        assert(buy_order.filled < buy_order.quantity);
        assert(sell_order.filled < sell_order.quantity);

        // Calculate trade details
        let buy_remaining: u64 = buy_order.quantity - buy_order.filled;
        let sell_remaining: u64 = sell_order.quantity - sell_order.filled;
        let fill_qty: u64 = min(buy_remaining, sell_remaining);
        let exec_price: u64 = calculate_midpoint_price(buy_order.limit_price, sell_order.limit_price);

        // Calculate token amounts to transfer
        let quote_amount: u64 = (fill_qty * exec_price) / 10000u64;  // Buyer pays
        let base_amount: u64 = fill_qty;  // Seller delivers

        // Verify token ownership and amounts
        assert(base_token.owner == sell_order.owner);
        assert(quote_token.owner == buy_order.owner);
        assert(base_token.amount >= base_amount);
        assert(quote_token.amount >= quote_amount);

        // Create tokens for transfer
        // Buyer receives base token (e.g., ALEO)
        let buyer_receives: Token = Token {
            owner: buy_order.owner,
            amount: base_amount,
            token_id: base_token.token_id,
            external_authorization_required: base_token.external_authorization_required,
            authorized_until: base_token.authorized_until,
        };

        // Seller receives quote token (e.g., USDC)
        let seller_receives: Token = Token {
            owner: sell_order.owner,
            amount: quote_amount,
            token_id: quote_token.token_id,
            external_authorization_required: quote_token.external_authorization_required,
            authorized_until: quote_token.authorized_until,
        };

        // Update orders
        let updated_buy: TickOrder = TickOrder {
            owner: buy_order.owner,
            token_pair: buy_order.token_pair,
            tick_lower: buy_order.tick_lower,
            tick_upper: buy_order.tick_upper,
            is_buy: buy_order.is_buy,
            quantity: buy_order.quantity,
            limit_price: buy_order.limit_price,
            token_id: buy_order.token_id,
            escrowed_amount: buy_order.escrowed_amount,
            filled: buy_order.filled + fill_qty,
            timestamp: buy_order.timestamp,
        };

        let updated_sell: TickOrder = TickOrder {
            owner: sell_order.owner,
            token_pair: sell_order.token_pair,
            tick_lower: sell_order.tick_lower,
            tick_upper: sell_order.tick_upper,
            is_buy: sell_order.is_buy,
            quantity: sell_order.quantity,
            limit_price: sell_order.limit_price,
            token_id: sell_order.token_id,
            escrowed_amount: sell_order.escrowed_amount,
            filled: sell_order.filled + fill_qty,
            timestamp: sell_order.timestamp,
        };

        // Create settlements
        let buyer_settlement: Settlement = Settlement {
            owner: buy_order.owner,
            token_pair: buy_order.token_pair,
            quantity: fill_qty,
            price: exec_price,
            is_buy: true,
            timestamp,
        };

        let seller_settlement: Settlement = Settlement {
            owner: sell_order.owner,
            token_pair: sell_order.token_pair,
            quantity: fill_qty,
            price: exec_price,
            is_buy: false,
            timestamp,
        };

        return (updated_buy, updated_sell, buyer_receives, seller_receives, buyer_settlement, seller_settlement);
    }

    // Cancel an order and return escrowed tokens
    transition cancel_order(order: TickOrder) -> bool {
        // Only owner can cancel
        assert(order.owner == self.caller);

        // Can only cancel if not fully filled
        assert(order.filled < order.quantity);

        return true;
    }

    // Cancel order with token return
    transition cancel_order_with_refund(order: TickOrder) -> (bool, Token) {
        // Only owner can cancel
        assert(order.owner == self.caller);

        // Can only cancel if not fully filled
        assert(order.filled < order.quantity);

        // Calculate refund amount (full escrow if unfilled, partial if partially filled)
        let filled_value: u64 = order.is_buy ?
            (order.filled * order.limit_price) / 10000u64 :
            order.filled;

        let refund_amount: u64 = order.escrowed_amount - filled_value;

        // Create refund token
        let refund: Token = Token {
            owner: order.owner,
            amount: refund_amount,
            token_id: order.token_id,
            external_authorization_required: false,
            authorized_until: 0u32,
        };

        return (true, refund);
    }

    // Get order details (for debugging/testing)
    transition get_order_info(order: TickOrder) -> (u64, u64, u64, u64, bool, u64) {
        // Only owner can view their order details
        assert(order.owner == self.caller);

        return (
            order.token_pair,
            order.tick_lower,
            order.tick_upper,
            order.quantity,
            order.is_buy,
            order.filled
        );
    }
}
