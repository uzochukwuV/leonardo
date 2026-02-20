// Tests for private_orderbook_v4.aleo
//
// Strategy: Use `script` tests for pure ZK logic that doesn't cross into
// token_registry.aleo (which can't be deployed locally in the test ledger).
//
// Tests cover:
//   - Escrow calculation (calc_escrow equivalent)
//   - Exec price midpoint formula
//   - Fill quantity (min) formula
//   - quote_gross ceil rounding
//   - Tick overlap / price cross validation logic
//   - Tick range width validation
//   - Limit price vs tick range validation

program test_sl.aleo {

    @noupgrade
    async constructor() {}

    // ─── Inline helpers (mirrors private_orderbook_v4.aleo internals) ─────────

    inline calc_escrow_buy(quantity: u128, price: u64) -> u128 {
        return (quantity * price as u128 + 9999u128) / 10000u128;
    }

    inline calc_escrow_sell(quantity: u128) -> u128 {
        return quantity;
    }

    inline exec_price(buy_price: u64, sell_price: u64) -> u64 {
        return (buy_price + sell_price) / 2u64;
    }

    inline fill_qty(buy_remaining: u128, sell_remaining: u128) -> u128 {
        return buy_remaining < sell_remaining ? buy_remaining : sell_remaining;
    }

    inline quote_gross(qty: u128, price: u64) -> u128 {
        return (qty * price as u128 + 9999u128) / 10000u128;
    }

    inline tick_overlap_valid(bl: u64, bu: u64, sl: u64, su: u64) -> bool {
        let low: u64  = bl > sl ? bl : sl;   // max(buy_lower, sell_lower)
        let high: u64 = bu < su ? bu : su;   // min(buy_upper, sell_upper)
        return low <= high;
    }

    inline price_cross(buy_price: u64, sell_price: u64) -> bool {
        return buy_price >= sell_price;
    }

    inline tick_range_valid(tick_lower: u64, tick_upper: u64, tick_size: u64) -> bool {
        let max_range: u64 = 50u64 * tick_size;
        return tick_upper - tick_lower <= max_range;
    }

    inline price_in_tick_range(price: u64, tick_lower: u64, tick_upper: u64, tick_size: u64) -> bool {
        return price >= tick_lower * tick_size && price <= (tick_upper + 1u64) * tick_size;
    }

    // ─── Test 1: Buy escrow = ceil(qty * price / 10000) ──────────────────────
    @test
    script test_buy_escrow_exact() {
        // 1000000000 * 150000 / 10000 = 15000000000 exactly (no rounding needed)
        let e: u128 = calc_escrow_buy(1000000000u128, 150000u64);
        assert_eq(e, 15000000000u128);
    }

    // ─── Test 2: Buy escrow ceil rounding ────────────────────────────────────
    // qty=3, price=3333: 3*3333=9999; (9999+9999)/10000 = 19998/10000 = 1
    @test
    script test_buy_escrow_ceil() {
        let e: u128 = calc_escrow_buy(3u128, 3333u64);
        assert_eq(e, 1u128);
    }

    // ─── Test 3: Buy escrow ceil — fractional case ────────────────────────────
    // qty=1, price=1: (1+9999)/10000 = 10000/10000 = 1
    @test
    script test_buy_escrow_ceil_tiny() {
        let e: u128 = calc_escrow_buy(1u128, 1u64);
        assert_eq(e, 1u128);
    }

    // ─── Test 4: Sell escrow = quantity (no price scaling) ───────────────────
    @test
    script test_sell_escrow_eq_quantity() {
        let e: u128 = calc_escrow_sell(1000000000u128);
        assert_eq(e, 1000000000u128);
    }

    // ─── Test 5: Exec price = midpoint ───────────────────────────────────────
    @test
    script test_exec_price_midpoint() {
        let p: u64 = exec_price(150000u64, 149000u64);
        assert_eq(p, 149500u64);
    }

    // ─── Test 6: Exec price — equal prices ───────────────────────────────────
    @test
    script test_exec_price_equal() {
        let p: u64 = exec_price(150000u64, 150000u64);
        assert_eq(p, 150000u64);
    }

    // ─── Test 7: Fill qty — buy side smaller ─────────────────────────────────
    @test
    script test_fill_qty_buy_smaller() {
        let f: u128 = fill_qty(500000000u128, 1000000000u128);
        assert_eq(f, 500000000u128);
    }

    // ─── Test 8: Fill qty — sell side smaller ────────────────────────────────
    @test
    script test_fill_qty_sell_smaller() {
        let f: u128 = fill_qty(1000000000u128, 800000000u128);
        assert_eq(f, 800000000u128);
    }

    // ─── Test 9: Fill qty — equal sizes ──────────────────────────────────────
    @test
    script test_fill_qty_equal() {
        let f: u128 = fill_qty(1000000000u128, 1000000000u128);
        assert_eq(f, 1000000000u128);
    }

    // ─── Test 10: quote_gross ceil rounding ──────────────────────────────────
    // qty=1000000000, price=149500: 1000000000*149500=149500000000000; /10000=14950000000 exact
    @test
    script test_quote_gross_exact() {
        let q: u128 = quote_gross(1000000000u128, 149500u64);
        assert_eq(q, 14950000000u128);
    }

    // ─── Test 11: quote_gross — ceil case ────────────────────────────────────
    // qty=1, price=1: (1+9999)/10000=1
    @test
    script test_quote_gross_ceil() {
        let q: u128 = quote_gross(1u128, 1u64);
        assert_eq(q, 1u128);
    }

    // ─── Test 12: Tick overlap — overlapping ranges ───────────────────────────
    @test
    script test_tick_overlap_yes() {
        // buy [1490,1510], sell [1495,1520] → overlap [1495,1510] ✓
        let ok: bool = tick_overlap_valid(1490u64, 1510u64, 1495u64, 1520u64);
        assert(ok);
    }

    // ─── Test 13: Tick overlap — exact touch ─────────────────────────────────
    @test
    script test_tick_overlap_touch() {
        // buy [1490,1500], sell [1500,1520] → overlap exactly at 1500 ✓
        let ok: bool = tick_overlap_valid(1490u64, 1500u64, 1500u64, 1520u64);
        assert(ok);
    }

    // ─── Test 14: Tick overlap — no overlap ──────────────────────────────────
    @test
    script test_tick_no_overlap() {
        // buy [1400,1420], sell [1500,1520] → overlap_low=1500 > overlap_high=1420 ✗
        let ok: bool = tick_overlap_valid(1400u64, 1420u64, 1500u64, 1520u64);
        assert(!ok);
    }

    // ─── Test 15: Price cross — buy > sell ───────────────────────────────────
    @test
    script test_price_cross_yes() {
        let ok: bool = price_cross(150000u64, 149000u64);
        assert(ok);
    }

    // ─── Test 16: Price cross — equal prices ─────────────────────────────────
    @test
    script test_price_cross_equal() {
        let ok: bool = price_cross(150000u64, 150000u64);
        assert(ok);
    }

    // ─── Test 17: Price cross — buy < sell (no cross) ────────────────────────
    @test
    script test_price_no_cross() {
        let ok: bool = price_cross(140000u64, 150000u64);
        assert(!ok);
    }

    // ─── Test 18: Tick range width — within 50 ticks ─────────────────────────
    @test
    script test_tick_range_valid() {
        // [1490, 1510] = 20 ticks, tick_size=100 → max_range=5000; 20<=50 ✓
        let ok: bool = tick_range_valid(1490u64, 1510u64, 100u64);
        assert(ok);
    }

    // ─── Test 19: Tick range width — exactly 50 ticks ────────────────────────
    @test
    script test_tick_range_exactly_50() {
        // [1000, 1050] = 50 ticks ✓
        let ok: bool = tick_range_valid(1000u64, 1050u64, 100u64);
        assert(ok);
    }

    // ─── Test 20: Tick range width — exceeds 50*tick_size ───────────────────
    // max_range = 50 * tick_size = 50 * 100 = 5000
    // [1000, 6001]: 6001-1000=5001 > 5000 ✗
    @test
    script test_tick_range_too_wide() {
        let ok: bool = tick_range_valid(1000u64, 6001u64, 100u64);
        assert(!ok);
    }

    // ─── Test 21: Price within tick range ────────────────────────────────────
    @test
    script test_price_in_range_yes() {
        // price=150000, ticks [1490,1510], tick_size=100
        // >= 1490*100=149000 ✓ and <= 1511*100=151100 ✓
        let ok: bool = price_in_tick_range(150000u64, 1490u64, 1510u64, 100u64);
        assert(ok);
    }

    // ─── Test 22: Price at lower bound ───────────────────────────────────────
    @test
    script test_price_at_lower_bound() {
        let ok: bool = price_in_tick_range(149000u64, 1490u64, 1510u64, 100u64);
        assert(ok);
    }

    // ─── Test 23: Price at upper bound ───────────────────────────────────────
    @test
    script test_price_at_upper_bound() {
        // (1510+1)*100 = 151100
        let ok: bool = price_in_tick_range(151100u64, 1490u64, 1510u64, 100u64);
        assert(ok);
    }

    // ─── Test 24: Price below range ──────────────────────────────────────────
    @test
    script test_price_below_range() {
        // 148999 < 1490*100=149000
        let ok: bool = price_in_tick_range(148999u64, 1490u64, 1510u64, 100u64);
        assert(!ok);
    }

    // ─── Test 25: Price above range ──────────────────────────────────────────
    @test
    script test_price_above_range() {
        // 151101 > 1511*100=151100
        let ok: bool = price_in_tick_range(151101u64, 1490u64, 1510u64, 100u64);
        assert(!ok);
    }

    // ─── Test 26: Full match settlement math ─────────────────────────────────
    // Mirrors the exact arithmetic in settle_match_public for a full fill.
    @test
    script test_full_settlement_math() {
        let buy_qty:   u128 = 1000000000u128;
        let sell_qty:  u128 = 1000000000u128;
        let buy_price: u64  = 150000u64;
        let sell_price: u64 = 149000u64;

        let ep:  u64  = exec_price(buy_price, sell_price);
        let fq:  u128 = fill_qty(buy_qty, sell_qty);
        let qg:  u128 = quote_gross(fq, ep);

        assert_eq(ep,  149500u64);
        assert_eq(fq,  1000000000u128);
        assert_eq(qg,  14950000000u128);

        // Updated escrowed amounts after settlement
        let buy_escrow:  u128 = calc_escrow_buy(buy_qty, buy_price);  // 15000000000
        let sell_escrow: u128 = calc_escrow_sell(sell_qty);           // 1000000000

        let buy_remaining_escrow:  u128 = buy_escrow  - qg;  // 50000000
        let sell_remaining_escrow: u128 = sell_escrow - fq;  // 0

        assert_eq(buy_remaining_escrow,  50000000u128);
        assert_eq(sell_remaining_escrow, 0u128);
    }

    // ─── Test 27: Partial fill settlement math ───────────────────────────────
    @test
    script test_partial_settlement_math() {
        let buy_qty:   u128 = 2000000000u128;
        let sell_qty:  u128 =  800000000u128;
        let buy_price: u64  = 150000u64;
        let sell_price: u64 = 149000u64;

        let ep: u64  = exec_price(buy_price, sell_price);
        let fq: u128 = fill_qty(buy_qty, sell_qty);    // min(2000000000, 800000000) = 800000000
        let qg: u128 = quote_gross(fq, ep);             // ceil(800000000 * 149500 / 10000) = 11960000000

        assert_eq(ep, 149500u64);
        assert_eq(fq, 800000000u128);
        assert_eq(qg, 11960000000u128);

        // Buy only partially filled — still has remaining
        assert(fq < buy_qty);
        // Sell fully filled
        assert_eq(fq, sell_qty);
    }

    // ─── Test 28: Fee calculation ─────────────────────────────────────────────
    // settler_fee = (quote_gross * settler_fee_bps) / 10000
    // protocol_fee = (quote_gross * protocol_fee_bps) / 10000
    @test
    script test_fee_calculation() {
        let qg: u128 = 14950000000u128;
        let settler_fee_bps: u64 = 10u64;   // 0.1%
        let protocol_fee_bps: u64 = 5u64;   // 0.05%

        let settler_fee:  u128 = (qg * settler_fee_bps as u128)  / 10000u128;
        let protocol_fee: u128 = (qg * protocol_fee_bps as u128) / 10000u128;

        assert_eq(settler_fee,  14950000u128);   // 0.1% of 14950000000
        assert_eq(protocol_fee,  7475000u128);   // 0.05% of 14950000000
    }

    // Required: test programs must have at least one non-test transition
    transition dummy() -> u32 { return 1u32; }
}
