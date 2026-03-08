// Tests for private_orderbook_v5.aleo
//
// Focus: New features added in v5
//   - Native ALEO credits support (NATIVE_CREDITS_ID = 0field)
//   - Private Stop-Loss (stop price hashing)
//   - Iceberg Orders (visible vs hidden quantity)
//   - Dual token support (credits.aleo vs token_registry.aleo)

program test_sl.aleo {

    @noupgrade
    async constructor() {}

    // ========== CONSTANTS ==========

    const NATIVE_CREDITS_ID: field = 0field;

    // ========== HELPERS (mirrors contract internals) ==========

    inline calc_escrow(is_buy: bool, quantity: u128, price: u64) -> u128 {
        if is_buy {
            return (quantity * price as u128 + 9999u128) / 10000u128;
        } else {
            return quantity;
        }
    }

    inline is_native_credits(token_id: field) -> bool {
        return token_id == NATIVE_CREDITS_ID;
    }

    inline hash_stop_price(stop_price: u64) -> field {
        return BHP256::hash_to_field(stop_price as field);
    }

    inline verify_stop_hash(actual_price: u64, stored_hash: field) -> bool {
        let computed: field = BHP256::hash_to_field(actual_price as field);
        return computed == stored_hash;
    }

    inline calc_visible_after_fill(
        visible: u128,
        filled: u128,
        refill: u128,
        total_remaining: u128
    ) -> u128 {
        let after_fill: u128 = visible - filled;
        if after_fill == 0u128 {
            return refill < total_remaining ? refill : total_remaining;
        } else {
            return after_fill;
        }
    }

    // ========== TEST: Native Credits Detection ==========

    @test
    script test_native_id_is_zero() {
        assert_eq(NATIVE_CREDITS_ID, 0field);
    }

    @test
    script test_is_native_true() {
        let ok: bool = is_native_credits(0field);
        assert(ok);
    }

    @test
    script test_is_native_false() {
        let ok: bool = is_native_credits(123456789field);
        assert(!ok);
    }

    @test
    script test_arc21_not_native() {
        let usdc_token_id: field = 987654321field;
        let ok: bool = is_native_credits(usdc_token_id);
        assert(!ok);
    }

    // ========== TEST: Stop Price Hashing (Anti-Hunting) ==========

    @test
    script test_stop_hash_same_input() {
        let price1: u64 = 15000u64;
        let hash1: field = hash_stop_price(price1);
        let hash2: field = hash_stop_price(price1);
        assert_eq(hash1, hash2);
    }

    @test
    script test_stop_hash_unique() {
        let price1: u64 = 15000u64;
        let price2: u64 = 15001u64;
        let hash1: field = hash_stop_price(price1);
        let hash2: field = hash_stop_price(price2);
        assert(hash1 != hash2);
    }

    @test
    script test_verify_hash_correct() {
        let actual_price: u64 = 14500u64;
        let stored_hash: field = hash_stop_price(actual_price);
        let ok: bool = verify_stop_hash(actual_price, stored_hash);
        assert(ok);
    }

    @test
    script test_verify_hash_wrong() {
        let actual_price: u64 = 14500u64;
        let stored_hash: field = hash_stop_price(actual_price);
        let wrong_price: u64 = 14000u64;
        let ok: bool = verify_stop_hash(wrong_price, stored_hash);
        assert(!ok);
    }

    @test
    script test_hash_hides_magnitude() {
        let small_price: u64 = 100u64;
        let large_price: u64 = 100000u64;
        let hash_small: field = hash_stop_price(small_price);
        let hash_large: field = hash_stop_price(large_price);
        assert(hash_small != hash_large);
    }

    // ========== TEST: Iceberg Order Logic ==========

    @test
    script test_iceberg_visible_lt_total() {
        let total: u128 = 10000000000u128;
        let visible: u128 = 1000000000u128;
        assert(visible < total);
        assert(visible <= total);
    }

    @test
    script test_iceberg_refill_full() {
        let visible: u128 = 1000u128;
        let filled: u128 = 1000u128;
        let refill: u128 = 500u128;
        let total_remaining: u128 = 9000u128;
        let new_visible: u128 = calc_visible_after_fill(visible, filled, refill, total_remaining);
        assert_eq(new_visible, 500u128);
    }

    @test
    script test_iceberg_partial_fill() {
        let visible: u128 = 1000u128;
        let filled: u128 = 300u128;
        let refill: u128 = 500u128;
        let total_remaining: u128 = 9700u128;
        let new_visible: u128 = calc_visible_after_fill(visible, filled, refill, total_remaining);
        assert_eq(new_visible, 700u128);
    }

    @test
    script test_iceberg_final_fill() {
        let visible: u128 = 1000u128;
        let filled: u128 = 1000u128;
        let refill: u128 = 500u128;
        let total_remaining: u128 = 200u128;
        let new_visible: u128 = calc_visible_after_fill(visible, filled, refill, total_remaining);
        assert_eq(new_visible, 200u128);
    }

    // ========== TEST: Escrow Calculation ==========

    @test
    script test_buy_escrow_native() {
        let quantity: u128 = 100000000u128;
        let price: u64 = 15000u64;
        let escrow: u128 = calc_escrow(true, quantity, price);
        assert_eq(escrow, 150000000u128);
    }

    @test
    script test_sell_escrow_native() {
        let quantity: u128 = 100000000u128;
        let price: u64 = 15000u64;
        let escrow: u128 = calc_escrow(false, quantity, price);
        assert_eq(escrow, 100000000u128);
    }

    @test
    script test_escrow_both_types() {
        let qty: u128 = 5000000u128;
        let price: u64 = 20000u64;
        let buy_escrow: u128 = calc_escrow(true, qty, price);
        let sell_escrow: u128 = calc_escrow(false, qty, price);
        assert_eq(buy_escrow, 10000000u128);
        assert_eq(sell_escrow, 5000000u128);
    }

    // ========== TEST: Token Pair Scenarios ==========

    @test
    script test_aleo_usdc_pair() {
        let base: field = NATIVE_CREDITS_ID;
        let quote: field = 123456789field;
        assert(is_native_credits(base));
        assert(!is_native_credits(quote));
    }

    @test
    script test_token_usdc_pair() {
        let base: field = 111111111field;
        let quote: field = 123456789field;
        assert(!is_native_credits(base));
        assert(!is_native_credits(quote));
    }

    @test
    script test_token_aleo_pair() {
        let base: field = 111111111field;
        let quote: field = NATIVE_CREDITS_ID;
        assert(!is_native_credits(base));
        assert(is_native_credits(quote));
    }

    // ========== TEST: Transfer Type Selection ==========

    inline select_transfer_type(base_token: field, quote_token: field) -> u8 {
        let base_native: bool = base_token == NATIVE_CREDITS_ID;
        let quote_native: bool = quote_token == NATIVE_CREDITS_ID;

        if base_native && quote_native {
            return 3u8;
        } else if base_native {
            return 1u8;
        } else if quote_native {
            return 2u8;
        } else {
            return 0u8;
        }
    }

    @test
    script test_tx_type_arc21_both() {
        let base: field = 111field;
        let quote: field = 222field;
        let t: u8 = select_transfer_type(base, quote);
        assert_eq(t, 0u8);
    }

    @test
    script test_tx_type_cred_base() {
        let base: field = NATIVE_CREDITS_ID;
        let quote: field = 222field;
        let t: u8 = select_transfer_type(base, quote);
        assert_eq(t, 1u8);
    }

    @test
    script test_tx_type_cred_quote() {
        let base: field = 111field;
        let quote: field = NATIVE_CREDITS_ID;
        let t: u8 = select_transfer_type(base, quote);
        assert_eq(t, 2u8);
    }

    @test
    script test_tx_type_cred_both() {
        let base: field = NATIVE_CREDITS_ID;
        let quote: field = NATIVE_CREDITS_ID;
        let t: u8 = select_transfer_type(base, quote);
        assert_eq(t, 3u8);
    }

    // Required: test programs must have at least one non-test transition
    transition dummy() -> u32 { return 1u32; }
}
