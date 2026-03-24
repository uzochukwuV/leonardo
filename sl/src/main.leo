// ============================================================================
// Private Order Book v17 - Multi-Token Support
// ============================================================================
// Architecture:
//   - Order records owned by ORCHESTRATOR (keeper) - private, encrypted
//   - Users receive Receipt records as proof of order
//   - Only orchestrator can settle/cancel orders
//   - Settlement creates SettlementProof records for traders
//
// Token Design:
//   - Base token: Native ALEO (0field) or any ARC20 token
//   - Quote token: Any ARC20 token (via token_registry.aleo)
//   - Supports any TOKEN/TOKEN pair registered in the orderbook
//
// Storage:
//   - Uses storage vectors for pair enumeration
//   - Pairs are indexed by pair_id (u64) and stored with full token info
// ============================================================================

import credits.aleo;
import token_registry.aleo;
import test_usdcx_stablecoin.aleo;

program private_orderbook_v19.aleo {

    // USDCx token ID constant - arbitrary ID to route to test_usdcx_stablecoin.aleo
    // When quote_token_id == 7000field, use USDCx contract instead of token_registry
    const USDCX_TOKEN_ID: field = 7000field;

    // Fee constants (in basis points, 1 bp = 0.01%)
    const SETTLER_FEE_BPS: u64 = 10u64;    // 0.10% settler fee
    const PROTOCOL_FEE_BPS: u64 = 5u64;    // 0.05% protocol fee

    // ========== RECORDS ==========

    // Order record - OWNED BY ORCHESTRATOR (private, encrypted)
    record Order {
        owner: address,           // ORCHESTRATOR (keeper)
        trader: address,          // Who placed the order
        order_id: field,
        pair_id: u64,
        is_buy: bool,
        price: u64,               // Price in basis points (quote per base)
        quantity: u128,           // Base token (ALEO) quantity in microcredits
        quote_token_id: field,    // Which quote token
        escrow_amount: u128,      // Amount escrowed (ALEO for sell, quote for buy)
        filled: u128,
        created_at: u32,
        expires_at: u32,
    }

    // Receipt record - OWNED BY TRADER (proof of order)
    record Receipt {
        owner: address,           // TRADER
        order_id: field,
        pair_id: u64,
        is_buy: bool,
        price: u64,
        quantity: u128,
        quote_token_id: field,
        escrow_amount: u128,
        created_at: u32,
    }

    // Settlement proof - OWNED BY TRADER (proof of fill)
    record SettlementProof {
        owner: address,           // TRADER
        order_id: field,
        fill_quantity: u128,
        fill_price: u64,
        received_token: field,    // 0field = ALEO, else quote_token_id
        received_amount: u128,
        settled_at: u32,
    }

    // Cancellation request - OWNED BY KEEPER (trader asks to cancel)
    // Trader creates this so keeper can see and process the cancellation
    record CancellationRequest {
        owner: address,           // KEEPER (orchestrator)
        order_id: field,
        trader: address,          // Who requested cancellation
        is_buy: bool,
        created_at: u32,
    }

    // Cancellation proof - OWNED BY TRADER (proof of cancellation)
    // Keeper creates this after processing the cancellation
    record CancellationProof {
        owner: address,           // TRADER
        order_id: field,
        is_buy: bool,             // true = quote token refund, false = ALEO refund
        returned_amount: u128,
        cancelled_at: u32,
    }

    // ========== STRUCTS ==========

    struct TokenPair {
        base_token_id: field,     // Base token (0field = ALEO, else ARC20 token)
        quote_token_id: field,    // Quote token (USDC, USDT, etc.)
        tick_size: u64,           // Minimum price increment
        is_active: bool,
    }

    struct OrderIdInput {
        caller: address,
        timestamp: u32,
        price: u64,
        quantity: u128,
        is_buy: bool,
        pair_id: u64,
    }

    struct SplitOrderIdInput {
        original_order_id: field,
        remaining_quantity: u128,
    }

    // ========== MAPPINGS ==========

    mapping orchestrator: bool => address;
    mapping keepers: address => bool;
    mapping token_pairs: u64 => TokenPair;
    mapping treasury: bool => address;
    mapping pair_volume: u64 => u128;
    mapping order_counter: bool => u64;

    // Pair enumeration - tracks registered pair IDs
    mapping pair_count: bool => u64;           // Total number of pairs
    mapping pair_ids: u64 => u64;              // Index => pair_id (for enumeration)

    // ========== CONSTRUCTOR ==========

    @custom
    async constructor() {
        Mapping::set(orchestrator, true, self.program_owner);
        Mapping::set(keepers, self.program_owner, true);
        Mapping::set(treasury, true, self.program_owner);
        Mapping::set(order_counter, true, 0u64);
        Mapping::set(pair_count, true, 0u64);
    }

    // ========== ADMIN FUNCTIONS ==========

    async transition add_keeper(keeper: address) -> Future {
        return finalize_add_keeper(self.caller, keeper);
    }

    async function finalize_add_keeper(caller: address, keeper: address) {
        let orch: address = Mapping::get(orchestrator, true);
        assert_eq(caller, orch);
        Mapping::set(keepers, keeper, true);
    }

    async transition remove_keeper(keeper: address) -> Future {
        return finalize_remove_keeper(self.caller, keeper);
    }

    async function finalize_remove_keeper(caller: address, keeper: address) {
        let orch: address = Mapping::get(orchestrator, true);
        assert_eq(caller, orch);
        Mapping::set(keepers, keeper, false);
    }

    async transition set_treasury(new_treasury: address) -> Future {
        return finalize_set_treasury(self.caller, new_treasury);
    }

    async function finalize_set_treasury(caller: address, new_treasury: address) {
        let orch: address = Mapping::get(orchestrator, true);
        assert_eq(caller, orch);
        Mapping::set(treasury, true, new_treasury);
    }

    // Register trading pair: base_token / quote_token
    // OPEN: Anyone can register a new trading pair
    // Base token can be 0field (native ALEO) or any ARC20 token
    // Quote token must exist in token_registry
    async transition register_pair(
        base_token_id: field,
        quote_token_id: field,
        tick_size: u64
    ) -> Future {
        // Ensure base and quote are different
        assert_neq(base_token_id, quote_token_id);
        assert(tick_size > 0u64);

        return finalize_register_pair(base_token_id, quote_token_id, tick_size);
    }

    async function finalize_register_pair(
        base_token_id: field,
        quote_token_id: field,
        tick_size: u64
    ) {
        // Auto-generate pair_id from current count
        let pair_id: u64 = Mapping::get_or_use(pair_count, true, 0u64) + 1u64;

        // Note: Token validation happens when transfers are attempted
        // If token IDs are invalid, transfer calls will fail

        let pair: TokenPair = TokenPair {
            base_token_id: base_token_id,
            quote_token_id: quote_token_id,
            tick_size: tick_size,
            is_active: true,
        };
        Mapping::set(token_pairs, pair_id, pair);
        Mapping::set(pair_volume, pair_id, 0u128);

        // Add to pair enumeration for querying all pairs
        let count: u64 = Mapping::get_or_use(pair_count, true, 0u64);
        Mapping::set(pair_ids, count, pair_id);
        Mapping::set(pair_count, true, count + 1u64);
    }

    // Deactivate a trading pair (admin only)
    async transition deactivate_pair(pair_id: u64) -> Future {
        return finalize_deactivate_pair(self.caller, pair_id);
    }

    async function finalize_deactivate_pair(caller: address, pair_id: u64) {
        let orch: address = Mapping::get(orchestrator, true);
        assert_eq(caller, orch);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        let updated_pair: TokenPair = TokenPair {
            base_token_id: pair.base_token_id,
            quote_token_id: pair.quote_token_id,
            tick_size: pair.tick_size,
            is_active: false,
        };
        Mapping::set(token_pairs, pair_id, updated_pair);
    }

    // Reactivate a trading pair (admin only)
    async transition activate_pair(pair_id: u64) -> Future {
        return finalize_activate_pair(self.caller, pair_id);
    }

    async function finalize_activate_pair(caller: address, pair_id: u64) {
        let orch: address = Mapping::get(orchestrator, true);
        assert_eq(caller, orch);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        let updated_pair: TokenPair = TokenPair {
            base_token_id: pair.base_token_id,
            quote_token_id: pair.quote_token_id,
            tick_size: pair.tick_size,
            is_active: true,
        };
        Mapping::set(token_pairs, pair_id, updated_pair);
    }

    // ========== ORDER SUBMISSION ==========

    // Submit BUY order - escrow QUOTE TOKEN to buy ALEO
    // Buyer pays quote tokens, receives ALEO on settlement
    async transition submit_buy_order(
        pair_id: u64,
        quote_token_id: field,
        price: u64,
        quantity: u128,            // ALEO quantity to buy (microcredits)
        escrow_quote: u128,        // Quote tokens to escrow
        timestamp: u32,
        expires_at: u32,
        orchestrator_addr: address
    ) -> (Order, Receipt, Future) {
        assert(quantity > 0u128);
        assert(price > 0u64);
        assert(escrow_quote > 0u128);

        let order_id: field = BHP256::hash_to_field(OrderIdInput {
            caller: self.caller,
            timestamp: timestamp,
            price: price,
            quantity: quantity,
            is_buy: true,
            pair_id: pair_id,
        });

        let order: Order = Order {
            owner: orchestrator_addr,
            trader: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: true,
            price: price,
            quantity: quantity,
            quote_token_id: quote_token_id,
            escrow_amount: escrow_quote,
            filled: 0u128,
            created_at: timestamp,
            expires_at: expires_at,
        };

        let receipt: Receipt = Receipt {
            owner: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: true,
            price: price,
            quantity: quantity,
            quote_token_id: quote_token_id,
            escrow_amount: escrow_quote,
            created_at: timestamp,
        };

        // Escrow quote tokens via token_registry
        let escrow_future: Future = token_registry.aleo/transfer_public_as_signer(
            quote_token_id,
            self.address,
            escrow_quote
        );

        return (order, receipt, finalize_submit_buy_order(
            pair_id,
            quote_token_id,
            price,
            quantity,
            escrow_quote,
            orchestrator_addr,
            escrow_future
        ));
    }

    async function finalize_submit_buy_order(
        pair_id: u64,
        quote_token_id: field,
        price: u64,
        quantity: u128,
        escrow_quote: u128,
        orchestrator_addr: address,
        escrow_future: Future
    ) {
        let expected_orch: address = Mapping::get(orchestrator, true);
        assert_eq(orchestrator_addr, expected_orch);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        assert(pair.is_active);
        assert_eq(pair.quote_token_id, quote_token_id);

        // Verify enough quote escrowed: quantity * price / 10000
        let required: u128 = (quantity * price as u128 + 9999u128) / 10000u128;
        assert(escrow_quote >= required);

        escrow_future.await();

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        Mapping::set(order_counter, true, counter + 1u64);
    }

    // ========== USDCX ORDER SUBMISSION ==========

    // Submit BUY order with USDCx - escrow USDCx (7000field) to buy ALEO
    async transition submit_buy_order_usdcx(
        pair_id: u64,
        price: u64,
        quantity: u128,
        escrow_quote: u128,
        timestamp: u32,
        expires_at: u32,
        orchestrator_addr: address
    ) -> (Order, Receipt, Future) {
        assert(quantity > 0u128);
        assert(price > 0u64);
        assert(escrow_quote > 0u128);

        let order_id: field = BHP256::hash_to_field(OrderIdInput {
            caller: self.caller,
            timestamp: timestamp,
            price: price,
            quantity: quantity,
            is_buy: true,
            pair_id: pair_id,
        });

        let order: Order = Order {
            owner: orchestrator_addr,
            trader: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: true,
            price: price,
            quantity: quantity,
            quote_token_id: USDCX_TOKEN_ID,
            escrow_amount: escrow_quote,
            filled: 0u128,
            created_at: timestamp,
            expires_at: expires_at,
        };

        let receipt: Receipt = Receipt {
            owner: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: true,
            price: price,
            quantity: quantity,
            quote_token_id: USDCX_TOKEN_ID,
            escrow_amount: escrow_quote,
            created_at: timestamp,
        };

        // Escrow USDCx via test_usdcx_stablecoin.aleo
        let escrow_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            escrow_quote
        );

        return (order, receipt, finalize_submit_buy_order_usdcx(
            pair_id, price, quantity, escrow_quote, orchestrator_addr, escrow_future
        ));
    }

    async function finalize_submit_buy_order_usdcx(
        pair_id: u64,
        price: u64,
        quantity: u128,
        escrow_quote: u128,
        orchestrator_addr: address,
        escrow_future: Future
    ) {
        let expected_orch: address = Mapping::get(orchestrator, true);
        assert_eq(orchestrator_addr, expected_orch);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        assert(pair.is_active);
        assert_eq(pair.quote_token_id, USDCX_TOKEN_ID);

        let required: u128 = (quantity * price as u128 + 9999u128) / 10000u128;
        assert(escrow_quote >= required);

        escrow_future.await();

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        Mapping::set(order_counter, true, counter + 1u64);
    }

    // Submit SELL order - escrow ALEO to sell for QUOTE TOKEN
    // Seller pays ALEO, receives quote tokens on settlement
    async transition submit_sell_order(
        pair_id: u64,
        quote_token_id: field,
        price: u64,
        quantity: u128,            // ALEO quantity to sell (microcredits)
        escrow_aleo: u64,          // ALEO to escrow (must equal quantity)
        timestamp: u32,
        expires_at: u32,
        orchestrator_addr: address
    ) -> (Order, Receipt, Future) {
        assert(quantity > 0u128);
        assert(price > 0u64);
        assert(escrow_aleo > 0u64);

        let order_id: field = BHP256::hash_to_field(OrderIdInput {
            caller: self.caller,
            timestamp: timestamp,
            price: price,
            quantity: quantity,
            is_buy: false,
            pair_id: pair_id,
        });

        let order: Order = Order {
            owner: orchestrator_addr,
            trader: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: false,
            price: price,
            quantity: quantity,
            quote_token_id: quote_token_id,
            escrow_amount: escrow_aleo as u128,
            filled: 0u128,
            created_at: timestamp,
            expires_at: expires_at,
        };

        let receipt: Receipt = Receipt {
            owner: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: false,
            price: price,
            quantity: quantity,
            quote_token_id: quote_token_id,
            escrow_amount: escrow_aleo as u128,
            created_at: timestamp,
        };

        // Escrow ALEO via credits.aleo
        let escrow_future: Future = credits.aleo/transfer_public_as_signer(
            self.address,
            escrow_aleo
        );

        return (order, receipt, finalize_submit_sell_order(
            pair_id,
            quote_token_id,
            price,
            quantity,
            escrow_aleo as u128,
            orchestrator_addr,
            escrow_future
        ));
    }

    async function finalize_submit_sell_order(
        pair_id: u64,
        quote_token_id: field,
        price: u64,
        quantity: u128,
        escrow_aleo: u128,
        orchestrator_addr: address,
        escrow_future: Future
    ) {
        let expected_orch: address = Mapping::get(orchestrator, true);
        assert_eq(orchestrator_addr, expected_orch);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        assert(pair.is_active);
        assert_eq(pair.quote_token_id, quote_token_id);

        // Verify seller escrowed exactly the quantity
        assert_eq(escrow_aleo, quantity);

        escrow_future.await();

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        Mapping::set(order_counter, true, counter + 1u64);
    }

    // Submit SELL order with USDCx as BASE token - escrow USDCx to sell for quote token
    // Example: USDCx/TKNB pair - seller deposits USDCx, receives TKNB on settlement
    async transition submit_sell_order_usdcx(
        pair_id: u64,
        quote_token_id: field,
        price: u64,
        quantity: u128,
        escrow_usdcx: u128,
        timestamp: u32,
        expires_at: u32,
        orchestrator_addr: address
    ) -> (Order, Receipt, Future) {
        assert(quantity > 0u128);
        assert(price > 0u64);
        assert(escrow_usdcx > 0u128);

        let order_id: field = BHP256::hash_to_field(OrderIdInput {
            caller: self.caller,
            timestamp: timestamp,
            price: price,
            quantity: quantity,
            is_buy: false,
            pair_id: pair_id,
        });

        let order: Order = Order {
            owner: orchestrator_addr,
            trader: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: false,
            price: price,
            quantity: quantity,
            quote_token_id: quote_token_id,
            escrow_amount: escrow_usdcx,
            filled: 0u128,
            created_at: timestamp,
            expires_at: expires_at,
        };

        let receipt: Receipt = Receipt {
            owner: self.caller,
            order_id: order_id,
            pair_id: pair_id,
            is_buy: false,
            price: price,
            quantity: quantity,
            quote_token_id: quote_token_id,
            escrow_amount: escrow_usdcx,
            created_at: timestamp,
        };

        // Escrow USDCx via test_usdcx_stablecoin.aleo
        let escrow_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            escrow_usdcx
        );

        return (order, receipt, finalize_sell_order_usdcx(
            pair_id, quote_token_id, price, quantity, escrow_usdcx, orchestrator_addr, escrow_future
        ));
    }

    async function finalize_sell_order_usdcx(
        pair_id: u64,
        quote_token_id: field,
        price: u64,
        quantity: u128,
        escrow_usdcx: u128,
        orchestrator_addr: address,
        escrow_future: Future
    ) {
        let expected_orch: address = Mapping::get(orchestrator, true);
        assert_eq(orchestrator_addr, expected_orch);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        assert(pair.is_active);
        // Verify pair has USDCx as base token
        assert_eq(pair.base_token_id, USDCX_TOKEN_ID);
        assert_eq(pair.quote_token_id, quote_token_id);

        // Verify seller escrowed exactly the quantity
        assert_eq(escrow_usdcx, quantity);

        escrow_future.await();

        let counter: u64 = Mapping::get_or_use(order_counter, true, 0u64);
        Mapping::set(order_counter, true, counter + 1u64);
    }

    // ========== SETTLEMENT ==========

    // Settle matching buy + sell orders (partial or full fill).
    // Returns updated Order records with filled/escrow_amount adjusted.
    // Keeper holds updated records; when filled == quantity the order is fully spent.
    async transition settle_match(
        buy_order: Order,
        sell_order: Order,
        fill_quantity: u128,
        fill_price: u64,
        timestamp: u32,
        treasury_addr: address
    ) -> (Order, Order, SettlementProof, SettlementProof, Future) {
        // Keeper owns both records — enforced by ZK
        assert(buy_order.is_buy);
        assert(!sell_order.is_buy);
        assert_eq(buy_order.pair_id, sell_order.pair_id);
        assert_eq(buy_order.quote_token_id, sell_order.quote_token_id);

        // fill_price must be within the bid-ask spread
        assert(fill_price >= sell_order.price);
        assert(fill_price <= buy_order.price);

        assert(fill_quantity > 0u128);
        assert(fill_quantity <= buy_order.quantity - buy_order.filled);
        assert(fill_quantity <= sell_order.quantity - sell_order.filled);

        let quote_token_id: field = buy_order.quote_token_id;

        // Calculate amounts
        let quote_amount: u128 = (fill_quantity * fill_price as u128) / 10000u128;
        let settler_fee: u128 = (quote_amount * SETTLER_FEE_BPS as u128) / 10000u128;
        let protocol_fee: u128 = (quote_amount * PROTOCOL_FEE_BPS as u128) / 10000u128;
        let seller_receives: u128 = quote_amount - settler_fee - protocol_fee;

        // Escrow safety: payout must not exceed remaining escrow
        assert(quote_amount <= buy_order.escrow_amount);
        assert(fill_quantity <= sell_order.escrow_amount);

        // Updated buy order: filled += fill_quantity, escrow_amount -= quote debited
        let updated_buy: Order = Order {
            owner: buy_order.owner,
            trader: buy_order.trader,
            order_id: buy_order.order_id,
            pair_id: buy_order.pair_id,
            is_buy: buy_order.is_buy,
            price: buy_order.price,
            quantity: buy_order.quantity,
            quote_token_id: buy_order.quote_token_id,
            escrow_amount: buy_order.escrow_amount - quote_amount,
            filled: buy_order.filled + fill_quantity,
            created_at: buy_order.created_at,
            expires_at: buy_order.expires_at,
        };

        // Updated sell order: filled += fill_quantity, escrow_amount -= ALEO paid out
        let updated_sell: Order = Order {
            owner: sell_order.owner,
            trader: sell_order.trader,
            order_id: sell_order.order_id,
            pair_id: sell_order.pair_id,
            is_buy: sell_order.is_buy,
            price: sell_order.price,
            quantity: sell_order.quantity,
            quote_token_id: sell_order.quote_token_id,
            escrow_amount: sell_order.escrow_amount - fill_quantity,
            filled: sell_order.filled + fill_quantity,
            created_at: sell_order.created_at,
            expires_at: sell_order.expires_at,
        };

        // Settlement proofs for traders
        let buyer_proof: SettlementProof = SettlementProof {
            owner: buy_order.trader,
            order_id: buy_order.order_id,
            fill_quantity: fill_quantity,
            fill_price: fill_price,
            received_token: 0field,  // ALEO
            received_amount: fill_quantity,
            settled_at: timestamp,
        };

        let seller_proof: SettlementProof = SettlementProof {
            owner: sell_order.trader,
            order_id: sell_order.order_id,
            fill_quantity: fill_quantity,
            fill_price: fill_price,
            received_token: quote_token_id,
            received_amount: seller_receives,
            settled_at: timestamp,
        };

        // Transfer ALEO to buyer (from seller's escrowed ALEO)
        let pay_buyer: Future = credits.aleo/transfer_public(
            buy_order.trader,
            fill_quantity as u64
        );
        // Transfer quote tokens to seller
        let pay_seller: Future = token_registry.aleo/transfer_public(
            quote_token_id,
            sell_order.trader,
            seller_receives
        );
        // Settler fee to keeper
        let pay_settler: Future = token_registry.aleo/transfer_public(
            quote_token_id,
            self.caller,
            settler_fee
        );
        // Protocol fee to treasury
        let pay_protocol: Future = token_registry.aleo/transfer_public(
            quote_token_id,
            treasury_addr,
            protocol_fee
        );

        return (updated_buy, updated_sell, buyer_proof, seller_proof, finalize_settle_match(
            buy_order.pair_id,
            buy_order.expires_at,
            sell_order.expires_at,
            fill_quantity,
            quote_amount,
            self.caller,
            treasury_addr,
            pay_buyer,
            pay_seller,
            pay_settler,
            pay_protocol
        ));
    }

    async function finalize_settle_match(
        pair_id: u64,
        buy_expires_at: u32,
        sell_expires_at: u32,
        fill_quantity: u128,
        quote_amount: u128,
        caller: address,
        treasury_addr: address,
        pay_buyer: Future,
        pay_seller: Future,
        pay_settler: Future,
        pay_protocol: Future
    ) {
        let is_keeper: bool = Mapping::get_or_use(keepers, caller, false);
        assert(is_keeper);

        let expected_treasury: address = Mapping::get(treasury, true);
        assert_eq(treasury_addr, expected_treasury);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        assert(pair.is_active);

        // Both orders must not have expired at settlement time
        assert(block.height <= buy_expires_at);
        assert(block.height <= sell_expires_at);

        pay_buyer.await();
        pay_seller.await();
        pay_settler.await();
        pay_protocol.await();

        let volume: u128 = Mapping::get_or_use(pair_volume, pair_id, 0u128);
        Mapping::set(pair_volume, pair_id, volume + quote_amount);
    }

    // ========== USDCX SETTLEMENT ==========

    // Settle matching orders where quote token is USDCx (7000field)
    async transition settle_match_usdcx(
        buy_order: Order,
        sell_order: Order,
        fill_quantity: u128,
        fill_price: u64,
        timestamp: u32,
        treasury_addr: address
    ) -> (Order, Order, SettlementProof, SettlementProof, Future) {
        assert(buy_order.is_buy);
        assert(!sell_order.is_buy);
        assert_eq(buy_order.pair_id, sell_order.pair_id);
        assert_eq(buy_order.quote_token_id, USDCX_TOKEN_ID);
        assert_eq(sell_order.quote_token_id, USDCX_TOKEN_ID);

        assert(fill_price >= sell_order.price);
        assert(fill_price <= buy_order.price);

        assert(fill_quantity > 0u128);
        assert(fill_quantity <= buy_order.quantity - buy_order.filled);
        assert(fill_quantity <= sell_order.quantity - sell_order.filled);

        let quote_amount: u128 = (fill_quantity * fill_price as u128) / 10000u128;
        let settler_fee: u128 = (quote_amount * SETTLER_FEE_BPS as u128) / 10000u128;
        let protocol_fee: u128 = (quote_amount * PROTOCOL_FEE_BPS as u128) / 10000u128;
        let seller_receives: u128 = quote_amount - settler_fee - protocol_fee;

        assert(quote_amount <= buy_order.escrow_amount);
        assert(fill_quantity <= sell_order.escrow_amount);

        let updated_buy: Order = Order {
            owner: buy_order.owner,
            trader: buy_order.trader,
            order_id: buy_order.order_id,
            pair_id: buy_order.pair_id,
            is_buy: buy_order.is_buy,
            price: buy_order.price,
            quantity: buy_order.quantity,
            quote_token_id: buy_order.quote_token_id,
            escrow_amount: buy_order.escrow_amount - quote_amount,
            filled: buy_order.filled + fill_quantity,
            created_at: buy_order.created_at,
            expires_at: buy_order.expires_at,
        };

        let updated_sell: Order = Order {
            owner: sell_order.owner,
            trader: sell_order.trader,
            order_id: sell_order.order_id,
            pair_id: sell_order.pair_id,
            is_buy: sell_order.is_buy,
            price: sell_order.price,
            quantity: sell_order.quantity,
            quote_token_id: sell_order.quote_token_id,
            escrow_amount: sell_order.escrow_amount - fill_quantity,
            filled: sell_order.filled + fill_quantity,
            created_at: sell_order.created_at,
            expires_at: sell_order.expires_at,
        };

        let buyer_proof: SettlementProof = SettlementProof {
            owner: buy_order.trader,
            order_id: buy_order.order_id,
            fill_quantity: fill_quantity,
            fill_price: fill_price,
            received_token: 0field,
            received_amount: fill_quantity,
            settled_at: timestamp,
        };

        let seller_proof: SettlementProof = SettlementProof {
            owner: sell_order.trader,
            order_id: sell_order.order_id,
            fill_quantity: fill_quantity,
            fill_price: fill_price,
            received_token: USDCX_TOKEN_ID,
            received_amount: seller_receives,
            settled_at: timestamp,
        };

        // Transfer ALEO to buyer
        let pay_buyer: Future = credits.aleo/transfer_public(
            buy_order.trader,
            fill_quantity as u64
        );
        // Transfer USDCx to seller
        let pay_seller: Future = test_usdcx_stablecoin.aleo/transfer_public(
            sell_order.trader,
            seller_receives
        );
        // Settler fee to keeper (USDCx)
        let pay_settler: Future = test_usdcx_stablecoin.aleo/transfer_public(
            self.caller,
            settler_fee
        );
        // Protocol fee to treasury (USDCx)
        let pay_protocol: Future = test_usdcx_stablecoin.aleo/transfer_public(
            treasury_addr,
            protocol_fee
        );

        return (updated_buy, updated_sell, buyer_proof, seller_proof, finalize_settle_match_usdcx(
            buy_order.pair_id,
            buy_order.expires_at,
            sell_order.expires_at,
            fill_quantity,
            quote_amount,
            self.caller,
            treasury_addr,
            pay_buyer,
            pay_seller,
            pay_settler,
            pay_protocol
        ));
    }

    async function finalize_settle_match_usdcx(
        pair_id: u64,
        buy_expires_at: u32,
        sell_expires_at: u32,
        fill_quantity: u128,
        quote_amount: u128,
        caller: address,
        treasury_addr: address,
        pay_buyer: Future,
        pay_seller: Future,
        pay_settler: Future,
        pay_protocol: Future
    ) {
        let is_keeper: bool = Mapping::get_or_use(keepers, caller, false);
        assert(is_keeper);

        let expected_treasury: address = Mapping::get(treasury, true);
        assert_eq(treasury_addr, expected_treasury);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        assert(pair.is_active);
        assert_eq(pair.quote_token_id, USDCX_TOKEN_ID);

        assert(block.height <= buy_expires_at);
        assert(block.height <= sell_expires_at);

        pay_buyer.await();
        pay_seller.await();
        pay_settler.await();
        pay_protocol.await();

        let volume: u128 = Mapping::get_or_use(pair_volume, pair_id, 0u128);
        Mapping::set(pair_volume, pair_id, volume + quote_amount);
    }

    // Settle when USDCx is BASE token - buyer receives USDCx, seller receives quote tokens
    async transition settle_match_usdcx_base(
        buy_order: Order,
        sell_order: Order,
        fill_quantity: u128,
        fill_price: u64,
        timestamp: u32,
        treasury_addr: address
    ) -> (Order, Order, SettlementProof, SettlementProof, Future) {
        assert(buy_order.is_buy);
        assert(!sell_order.is_buy);
        assert_eq(buy_order.pair_id, sell_order.pair_id);
        assert_eq(buy_order.quote_token_id, sell_order.quote_token_id);

        assert(fill_price >= sell_order.price);
        assert(fill_price <= buy_order.price);

        assert(fill_quantity > 0u128);
        assert(fill_quantity <= buy_order.quantity - buy_order.filled);
        assert(fill_quantity <= sell_order.quantity - sell_order.filled);

        let quote_token_id: field = buy_order.quote_token_id;
        let quote_amount: u128 = (fill_quantity * fill_price as u128) / 10000u128;
        let settler_fee: u128 = (quote_amount * SETTLER_FEE_BPS as u128) / 10000u128;
        let protocol_fee: u128 = (quote_amount * PROTOCOL_FEE_BPS as u128) / 10000u128;
        let seller_receives: u128 = quote_amount - settler_fee - protocol_fee;

        assert(quote_amount <= buy_order.escrow_amount);
        assert(fill_quantity <= sell_order.escrow_amount);

        let updated_buy: Order = Order {
            owner: buy_order.owner,
            trader: buy_order.trader,
            order_id: buy_order.order_id,
            pair_id: buy_order.pair_id,
            is_buy: buy_order.is_buy,
            price: buy_order.price,
            quantity: buy_order.quantity,
            quote_token_id: buy_order.quote_token_id,
            escrow_amount: buy_order.escrow_amount - quote_amount,
            filled: buy_order.filled + fill_quantity,
            created_at: buy_order.created_at,
            expires_at: buy_order.expires_at,
        };

        let updated_sell: Order = Order {
            owner: sell_order.owner,
            trader: sell_order.trader,
            order_id: sell_order.order_id,
            pair_id: sell_order.pair_id,
            is_buy: sell_order.is_buy,
            price: sell_order.price,
            quantity: sell_order.quantity,
            quote_token_id: sell_order.quote_token_id,
            escrow_amount: sell_order.escrow_amount - fill_quantity,
            filled: sell_order.filled + fill_quantity,
            created_at: sell_order.created_at,
            expires_at: sell_order.expires_at,
        };

        let buyer_proof: SettlementProof = SettlementProof {
            owner: buy_order.trader,
            order_id: buy_order.order_id,
            fill_quantity: fill_quantity,
            fill_price: fill_price,
            received_token: USDCX_TOKEN_ID,  // Buyer receives USDCx
            received_amount: fill_quantity,
            settled_at: timestamp,
        };

        let seller_proof: SettlementProof = SettlementProof {
            owner: sell_order.trader,
            order_id: sell_order.order_id,
            fill_quantity: fill_quantity,
            fill_price: fill_price,
            received_token: quote_token_id,
            received_amount: seller_receives,
            settled_at: timestamp,
        };

        // Transfer USDCx to buyer (base token)
        let pay_buyer: Future = test_usdcx_stablecoin.aleo/transfer_public(
            buy_order.trader,
            fill_quantity
        );
        // Transfer quote tokens to seller (via token_registry)
        let pay_seller: Future = token_registry.aleo/transfer_public(
            quote_token_id,
            sell_order.trader,
            seller_receives
        );
        // Settler fee (quote tokens)
        let pay_settler: Future = token_registry.aleo/transfer_public(
            quote_token_id,
            self.caller,
            settler_fee
        );
        // Protocol fee (quote tokens)
        let pay_protocol: Future = token_registry.aleo/transfer_public(
            quote_token_id,
            treasury_addr,
            protocol_fee
        );

        return (updated_buy, updated_sell, buyer_proof, seller_proof, fin_settle_usdcx_base(
            buy_order.pair_id,
            buy_order.expires_at,
            sell_order.expires_at,
            fill_quantity,
            quote_amount,
            self.caller,
            treasury_addr,
            pay_buyer,
            pay_seller,
            pay_settler,
            pay_protocol
        ));
    }

    async function fin_settle_usdcx_base(
        pair_id: u64,
        buy_expires_at: u32,
        sell_expires_at: u32,
        fill_quantity: u128,
        quote_amount: u128,
        caller: address,
        treasury_addr: address,
        pay_buyer: Future,
        pay_seller: Future,
        pay_settler: Future,
        pay_protocol: Future
    ) {
        let is_keeper: bool = Mapping::get_or_use(keepers, caller, false);
        assert(is_keeper);

        let expected_treasury: address = Mapping::get(treasury, true);
        assert_eq(treasury_addr, expected_treasury);

        let pair: TokenPair = Mapping::get(token_pairs, pair_id);
        assert(pair.is_active);
        assert_eq(pair.base_token_id, USDCX_TOKEN_ID);

        assert(block.height <= buy_expires_at);
        assert(block.height <= sell_expires_at);

        pay_buyer.await();
        pay_seller.await();
        pay_settler.await();
        pay_protocol.await();

        let volume: u128 = Mapping::get_or_use(pair_volume, pair_id, 0u128);
        Mapping::set(pair_volume, pair_id, volume + quote_amount);
    }

    // ========== CROSS-PAIR SETTLEMENT ==========
    // Atomic settlement for cross-pair swaps via USDCx bridge
    // Example: User sells ALEO → receives TKNB (via ALEO/USDCx + TKNB/USDCx pairs)
    //
    // Participants:
    //   - User: sells base token (leg1), receives base token (leg2)
    //   - CP1: buys base token on leg1 pair (has escrowed USDCx)
    //   - CP2: sells base token on leg2 pair (has escrowed target token)
    //
    // Token Flow:
    //   - User's ALEO → CP1
    //   - CP1's USDCx → CP2 (bridge, internal routing)
    //   - CP2's TKNB → User

    async transition settle_cross_pair(
        // User's sell order on leg1 pair (e.g., sells ALEO for USDCx)
        user_sell_order: Order,
        // Counterparty 1's buy order on leg1 pair (buys ALEO with USDCx)
        cp1_buy_order: Order,
        // Counterparty 2's sell order on leg2 pair (sells TKNB for USDCx)
        cp2_sell_order: Order,
        // Fill quantities and prices
        fill_qty_leg1: u128,     // Amount of base token in leg1 (e.g., ALEO)
        fill_price_leg1: u64,    // Price for leg1 (ALEO/USDCx)
        fill_qty_leg2: u128,     // Amount of base token in leg2 user receives (e.g., TKNB)
        fill_price_leg2: u64,    // Price for leg2 (TKNB/USDCx)
        leg2_base_token_id: field, // Base token ID of leg2 pair (token user receives)
        timestamp: u32,
        treasury_addr: address
    ) -> (Order, Order, Order, SettlementProof, SettlementProof, SettlementProof, Future) {
        // Validate order directions
        assert(!user_sell_order.is_buy);  // User is selling
        assert(cp1_buy_order.is_buy);     // CP1 is buying on leg1
        assert(!cp2_sell_order.is_buy);   // CP2 is selling on leg2

        // Both leg1 orders must be on same pair
        assert_eq(user_sell_order.pair_id, cp1_buy_order.pair_id);
        assert_eq(user_sell_order.quote_token_id, cp1_buy_order.quote_token_id);

        // Leg1 and Leg2 must both use USDCx as quote (bridge token)
        assert_eq(user_sell_order.quote_token_id, USDCX_TOKEN_ID);
        assert_eq(cp2_sell_order.quote_token_id, USDCX_TOKEN_ID);

        // Price validation
        assert(fill_price_leg1 >= user_sell_order.price);   // User gets at least their limit
        assert(fill_price_leg1 <= cp1_buy_order.price);     // CP1 pays at most their limit
        assert(fill_price_leg2 >= cp2_sell_order.price);    // CP2 gets at least their limit

        // Quantity validation for leg1
        assert(fill_qty_leg1 > 0u128);
        assert(fill_qty_leg1 <= user_sell_order.quantity - user_sell_order.filled);
        assert(fill_qty_leg1 <= cp1_buy_order.quantity - cp1_buy_order.filled);

        // Quantity validation for leg2
        assert(fill_qty_leg2 > 0u128);
        assert(fill_qty_leg2 <= cp2_sell_order.quantity - cp2_sell_order.filled);

        // Calculate USDCx amounts
        // Leg1: User sells ALEO → CP1 pays USDCx
        let usdcx_from_leg1: u128 = (fill_qty_leg1 * fill_price_leg1 as u128) / 10000u128;
        // Leg2: CP2 sells TKNB → needs USDCx payment
        let usdcx_for_leg2: u128 = (fill_qty_leg2 * fill_price_leg2 as u128) / 10000u128;

        // USDCx must balance: what CP1 pays must cover what CP2 needs (minus fees)
        let settler_fee: u128 = (usdcx_from_leg1 * SETTLER_FEE_BPS as u128) / 10000u128;
        let protocol_fee: u128 = (usdcx_from_leg1 * PROTOCOL_FEE_BPS as u128) / 10000u128;
        let bridge_amount: u128 = usdcx_from_leg1 - settler_fee - protocol_fee;

        // Bridge amount must equal what CP2 receives
        assert_eq(bridge_amount, usdcx_for_leg2);

        // Validate escrow amounts
        assert(fill_qty_leg1 <= user_sell_order.escrow_amount);  // User escrowed base token
        assert(usdcx_from_leg1 <= cp1_buy_order.escrow_amount);  // CP1 escrowed USDCx
        assert(fill_qty_leg2 <= cp2_sell_order.escrow_amount);   // CP2 escrowed target token

        // Update user's sell order (leg1)
        let updated_user: Order = Order {
            owner: user_sell_order.owner,
            trader: user_sell_order.trader,
            order_id: user_sell_order.order_id,
            pair_id: user_sell_order.pair_id,
            is_buy: user_sell_order.is_buy,
            price: user_sell_order.price,
            quantity: user_sell_order.quantity,
            quote_token_id: user_sell_order.quote_token_id,
            escrow_amount: user_sell_order.escrow_amount - fill_qty_leg1,
            filled: user_sell_order.filled + fill_qty_leg1,
            created_at: user_sell_order.created_at,
            expires_at: user_sell_order.expires_at,
        };

        // Update CP1's buy order (leg1)
        let updated_cp1: Order = Order {
            owner: cp1_buy_order.owner,
            trader: cp1_buy_order.trader,
            order_id: cp1_buy_order.order_id,
            pair_id: cp1_buy_order.pair_id,
            is_buy: cp1_buy_order.is_buy,
            price: cp1_buy_order.price,
            quantity: cp1_buy_order.quantity,
            quote_token_id: cp1_buy_order.quote_token_id,
            escrow_amount: cp1_buy_order.escrow_amount - usdcx_from_leg1,
            filled: cp1_buy_order.filled + fill_qty_leg1,
            created_at: cp1_buy_order.created_at,
            expires_at: cp1_buy_order.expires_at,
        };

        // Update CP2's sell order (leg2)
        let updated_cp2: Order = Order {
            owner: cp2_sell_order.owner,
            trader: cp2_sell_order.trader,
            order_id: cp2_sell_order.order_id,
            pair_id: cp2_sell_order.pair_id,
            is_buy: cp2_sell_order.is_buy,
            price: cp2_sell_order.price,
            quantity: cp2_sell_order.quantity,
            quote_token_id: cp2_sell_order.quote_token_id,
            escrow_amount: cp2_sell_order.escrow_amount - fill_qty_leg2,
            filled: cp2_sell_order.filled + fill_qty_leg2,
            created_at: cp2_sell_order.created_at,
            expires_at: cp2_sell_order.expires_at,
        };

        // Settlement proofs
        let user_proof: SettlementProof = SettlementProof {
            owner: user_sell_order.trader,
            order_id: user_sell_order.order_id,
            fill_quantity: fill_qty_leg1,
            fill_price: fill_price_leg1,
            received_token: leg2_base_token_id,  // Token user receives from leg2
            received_amount: fill_qty_leg2,
            settled_at: timestamp,
        };

        let cp1_proof: SettlementProof = SettlementProof {
            owner: cp1_buy_order.trader,
            order_id: cp1_buy_order.order_id,
            fill_quantity: fill_qty_leg1,
            fill_price: fill_price_leg1,
            received_token: 0field,  // ALEO (native credits)
            received_amount: fill_qty_leg1,
            settled_at: timestamp,
        };

        let cp2_proof: SettlementProof = SettlementProof {
            owner: cp2_sell_order.trader,
            order_id: cp2_sell_order.order_id,
            fill_quantity: fill_qty_leg2,
            fill_price: fill_price_leg2,
            received_token: USDCX_TOKEN_ID,
            received_amount: bridge_amount,
            settled_at: timestamp,
        };

        // Execute transfers:
        // 1. User's ALEO → CP1
        let pay_cp1: Future = credits.aleo/transfer_public(
            cp1_buy_order.trader,
            fill_qty_leg1 as u64
        );

        // 2. CP2's target token → User (via token_registry)
        let pay_user: Future = token_registry.aleo/transfer_public(
            leg2_base_token_id,
            user_sell_order.trader,
            fill_qty_leg2
        );

        // 3. Bridge: CP1's USDCx → CP2 (internal routing)
        let pay_cp2: Future = test_usdcx_stablecoin.aleo/transfer_public(
            cp2_sell_order.trader,
            bridge_amount
        );

        // 4. Settler fee (USDCx)
        let pay_settler: Future = test_usdcx_stablecoin.aleo/transfer_public(
            self.caller,
            settler_fee
        );

        // 5. Protocol fee (USDCx)
        let pay_protocol: Future = test_usdcx_stablecoin.aleo/transfer_public(
            treasury_addr,
            protocol_fee
        );

        return (
            updated_user, updated_cp1, updated_cp2,
            user_proof, cp1_proof, cp2_proof,
            fin_settle_cross_pair(
                user_sell_order.pair_id,
                cp2_sell_order.pair_id,
                leg2_base_token_id,
                user_sell_order.expires_at,
                cp1_buy_order.expires_at,
                cp2_sell_order.expires_at,
                usdcx_from_leg1,
                self.caller,
                treasury_addr,
                pay_cp1,
                pay_user,
                pay_cp2,
                pay_settler,
                pay_protocol
            )
        );
    }

    async function fin_settle_cross_pair(
        pair_id_leg1: u64,
        pair_id_leg2: u64,
        leg2_base_token_id: field,
        user_expires_at: u32,
        cp1_expires_at: u32,
        cp2_expires_at: u32,
        bridge_volume: u128,
        caller: address,
        treasury_addr: address,
        pay_cp1: Future,
        pay_user: Future,
        pay_cp2: Future,
        pay_settler: Future,
        pay_protocol: Future
    ) {
        // Verify keeper
        let is_keeper: bool = Mapping::get_or_use(keepers, caller, false);
        assert(is_keeper);

        // Verify treasury
        let expected_treasury: address = Mapping::get(treasury, true);
        assert_eq(treasury_addr, expected_treasury);

        // Verify leg1 pair is active and uses USDCx as quote
        let pair1: TokenPair = Mapping::get(token_pairs, pair_id_leg1);
        assert(pair1.is_active);
        assert_eq(pair1.quote_token_id, USDCX_TOKEN_ID);

        // Verify leg2 pair is active, uses USDCx as quote, and base token matches
        let pair2: TokenPair = Mapping::get(token_pairs, pair_id_leg2);
        assert(pair2.is_active);
        assert_eq(pair2.quote_token_id, USDCX_TOKEN_ID);
        assert_eq(pair2.base_token_id, leg2_base_token_id);

        // Verify all orders not expired
        assert(block.height <= user_expires_at);
        assert(block.height <= cp1_expires_at);
        assert(block.height <= cp2_expires_at);

        // Execute all transfers atomically
        pay_cp1.await();
        pay_user.await();
        pay_cp2.await();
        pay_settler.await();
        pay_protocol.await();

        // Update volume for both pairs
        let volume1: u128 = Mapping::get_or_use(pair_volume, pair_id_leg1, 0u128);
        Mapping::set(pair_volume, pair_id_leg1, volume1 + bridge_volume);

        let volume2: u128 = Mapping::get_or_use(pair_volume, pair_id_leg2, 0u128);
        Mapping::set(pair_volume, pair_id_leg2, volume2 + bridge_volume);
    }

    // ========== CANCELLATION ==========

    // STEP 1 (TRADER): Request cancellation using your Receipt as proof of order.
    // Creates a CancellationRequest record owned by the keeper so they can see and act on it.
    async transition request_cancel(
        receipt: Receipt,
        keeper_addr: address,
        timestamp: u32
    ) -> (CancellationRequest, Future) {
        // receipt.owner == self.caller is enforced by ZK record ownership

        let cancel_req: CancellationRequest = CancellationRequest {
            owner: keeper_addr,
            order_id: receipt.order_id,
            trader: self.caller,
            is_buy: receipt.is_buy,
            created_at: timestamp,
        };

        return (cancel_req, async {
            let expected_orch: address = Mapping::get(orchestrator, true);
            assert_eq(keeper_addr, expected_orch);
        });
    }

    // STEP 2 (KEEPER): Cancel BUY order - refund quote tokens, give trader a CancellationProof
    async transition cancel_buy_order(
        order: Order,
        cancel_req: CancellationRequest,
        timestamp: u32
    ) -> (CancellationProof, Future) {
        // Keeper owns both records — enforced by ZK
        assert(order.is_buy);
        assert_eq(order.order_id, cancel_req.order_id);
        assert_eq(cancel_req.trader, order.trader);  // refund must go to the order's trader

        // escrow_amount is already reduced by any prior partial fills — refund what remains
        let refund: u128 = order.escrow_amount;
        assert(refund > 0u128);

        let proof: CancellationProof = CancellationProof {
            owner: cancel_req.trader,
            order_id: order.order_id,
            is_buy: true,
            returned_amount: refund,
            cancelled_at: timestamp,
        };

        // Refund quote tokens to trader
        let refund_future: Future = token_registry.aleo/transfer_public(
            order.quote_token_id,
            cancel_req.trader,
            refund
        );

        return (proof, finalize_cancel_order(self.caller, refund_future));
    }

    // Cancel BUY order with USDCx quote - refund USDCx to trader
    async transition cancel_buy_order_usdcx(
        order: Order,
        cancel_req: CancellationRequest,
        timestamp: u32
    ) -> (CancellationProof, Future) {
        assert(order.is_buy);
        assert_eq(order.order_id, cancel_req.order_id);
        assert_eq(cancel_req.trader, order.trader);
        assert_eq(order.quote_token_id, USDCX_TOKEN_ID);

        let refund: u128 = order.escrow_amount;
        assert(refund > 0u128);

        let proof: CancellationProof = CancellationProof {
            owner: cancel_req.trader,
            order_id: order.order_id,
            is_buy: true,
            returned_amount: refund,
            cancelled_at: timestamp,
        };

        // Refund USDCx to trader
        let refund_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            cancel_req.trader,
            refund
        );

        return (proof, finalize_cancel_order(self.caller, refund_future));
    }

    // STEP 2 (KEEPER): Cancel SELL order - refund ALEO, give trader a CancellationProof
    async transition cancel_sell_order(
        order: Order,
        cancel_req: CancellationRequest,
        timestamp: u32
    ) -> (CancellationProof, Future) {
        // Keeper owns both records — enforced by ZK
        assert(!order.is_buy);
        assert_eq(order.order_id, cancel_req.order_id);
        assert_eq(cancel_req.trader, order.trader);  // refund must go to the order's trader

        // escrow_amount is already reduced by any prior partial fills — refund what remains
        let refund: u128 = order.escrow_amount;
        assert(refund > 0u128);

        let proof: CancellationProof = CancellationProof {
            owner: cancel_req.trader,
            order_id: order.order_id,
            is_buy: false,
            returned_amount: refund,
            cancelled_at: timestamp,
        };

        // Refund ALEO to trader
        let refund_future: Future = credits.aleo/transfer_public(
            cancel_req.trader,
            refund as u64
        );

        return (proof, finalize_cancel_order(self.caller, refund_future));
    }

    // Cancel SELL order with USDCx as BASE - refund USDCx to trader
    async transition cancel_sell_order_usdcx(
        order: Order,
        cancel_req: CancellationRequest,
        timestamp: u32
    ) -> (CancellationProof, Future) {
        assert(!order.is_buy);
        assert_eq(order.order_id, cancel_req.order_id);
        assert_eq(cancel_req.trader, order.trader);

        let refund: u128 = order.escrow_amount;
        assert(refund > 0u128);

        let proof: CancellationProof = CancellationProof {
            owner: cancel_req.trader,
            order_id: order.order_id,
            is_buy: false,
            returned_amount: refund,
            cancelled_at: timestamp,
        };

        // Refund USDCx to trader (USDCx was base token)
        let refund_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            cancel_req.trader,
            refund
        );

        return (proof, finalize_cancel_order(self.caller, refund_future));
    }

    async function finalize_cancel_order(caller: address, refund_future: Future) {
        let is_keeper: bool = Mapping::get_or_use(keepers, caller, false);
        assert(is_keeper);
        refund_future.await();
    }

    // ========== SPLIT ORDER ==========

    transition split_order(
        order: Order,
        fill_quantity: u128
    ) -> (Order, Order) {
        assert_eq(order.owner, self.caller);
        assert(fill_quantity < order.quantity);
        assert(fill_quantity > 0u128);

        let remaining_quantity: u128 = order.quantity - fill_quantity;
        let fill_escrow: u128 = (order.escrow_amount * fill_quantity) / order.quantity;
        let remaining_escrow: u128 = order.escrow_amount - fill_escrow;

        let fill_order: Order = Order {
            owner: self.caller,
            trader: order.trader,
            order_id: order.order_id,
            pair_id: order.pair_id,
            is_buy: order.is_buy,
            price: order.price,
            quantity: fill_quantity,
            quote_token_id: order.quote_token_id,
            escrow_amount: fill_escrow,
            filled: 0u128,
            created_at: order.created_at,
            expires_at: order.expires_at,
        };

        let new_order_id: field = BHP256::hash_to_field(SplitOrderIdInput {
            original_order_id: order.order_id,
            remaining_quantity: remaining_quantity,
        });

        let remaining_order: Order = Order {
            owner: self.caller,
            trader: order.trader,
            order_id: new_order_id,
            pair_id: order.pair_id,
            is_buy: order.is_buy,
            price: order.price,
            quantity: remaining_quantity,
            quote_token_id: order.quote_token_id,
            escrow_amount: remaining_escrow,
            filled: 0u128,
            created_at: order.created_at,
            expires_at: order.expires_at,
        };

        return (fill_order, remaining_order);
    }
}
