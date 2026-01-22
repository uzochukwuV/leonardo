// Test program for the Private Tick-Based Order Book
import sl.aleo;

program test_sl.aleo {

    // Test 1: Submit a buy order
    @test
    script test_submit_buy_order() {
        // Create a buy order for token pair 1 (USDC/ALEO)
        // Tick range: 1490-1510 (price $14.90-$15.10)
        // Limit price: 15000 ($15.00 in basis points)
        // Quantity: 1000 tokens
        let buy_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,           // token_pair
            true,           // is_buy
            1490u64,        // tick_lower
            1510u64,        // tick_upper
            1u32,           // timestamp
            15000u64,       // limit_price (private)
            1000u64         // quantity (private)
        );

        // Verify order was created correctly
        assert_eq(buy_order.token_pair, 1u64);
        assert_eq(buy_order.tick_lower, 1490u64);
        assert_eq(buy_order.tick_upper, 1510u64);
        assert_eq(buy_order.is_buy, true);
        assert_eq(buy_order.filled, 0u64);
    }

    // Test 2: Submit a sell order
    @test
    script test_submit_sell_order() {
        // Create a sell order
        // Tick range: 1495-1505 (price $14.95-$15.05)
        // Limit price: 14950 ($14.95 in basis points)
        // Quantity: 500 tokens
        let sell_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,           // token_pair
            false,          // is_buy (false = sell)
            1495u64,        // tick_lower
            1505u64,        // tick_upper
            2u32,           // timestamp
            14950u64,       // limit_price (private)
            500u64          // quantity (private)
        );

        assert_eq(sell_order.is_buy, false);
        assert_eq(sell_order.quantity, 500u64);
    }

    // Test 3: Match and settle orders
    @test
    script test_settle_matching_orders() {
        // Create buy order
        let buy_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            true,
            1490u64,
            1510u64,
            1u32,
            15000u64,       // Buy at $15.00
            1000u64
        );

        // Create sell order with overlapping tick range
        let sell_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            false,
            1495u64,
            1505u64,
            2u32,
            14950u64,       // Sell at $14.95
            500u64
        );

        // Settle the match
        let (updated_buy, updated_sell, buyer_settlement, seller_settlement):
            (sl.aleo/TickOrder, sl.aleo/TickOrder, sl.aleo/Settlement, sl.aleo/Settlement) =
            sl.aleo/settle_match(buy_order, sell_order, 3u32);

        // Verify fills - sell order should be fully filled
        assert_eq(updated_sell.filled, 500u64);
        assert_eq(updated_buy.filled, 500u64);

        // Verify settlement quantity
        assert_eq(buyer_settlement.quantity, 500u64);
        assert_eq(seller_settlement.quantity, 500u64);

        // Verify execution price is midpoint: (15000 + 14950) / 2 = 14975
        assert_eq(buyer_settlement.price, 14975u64);
        assert_eq(seller_settlement.price, 14975u64);
    }

    // Test 4: Partial fill scenario
    @test
    script test_partial_fill() {
        // Large buy order
        let buy_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            true,
            1490u64,
            1510u64,
            1u32,
            15000u64,
            2000u64         // Want to buy 2000
        );

        // Smaller sell order
        let sell_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            false,
            1495u64,
            1505u64,
            2u32,
            14950u64,
            800u64          // Only selling 800
        );

        let (updated_buy, updated_sell, buyer_settlement_partial, seller_settlement_partial):
            (sl.aleo/TickOrder, sl.aleo/TickOrder, sl.aleo/Settlement, sl.aleo/Settlement) =
            sl.aleo/settle_match(buy_order, sell_order, 3u32);

        // Sell order fully filled, buy order partially filled
        assert_eq(updated_sell.filled, 800u64);
        assert_eq(updated_buy.filled, 800u64);

        // Buy order still has remaining quantity
        assert(updated_buy.filled < updated_buy.quantity);
    }

    // Test 5: Cancel order
    @test
    script test_cancel_order() {
        let order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            true,
            1490u64,
            1510u64,
            1u32,
            15000u64,
            1000u64
        );

        // Cancel the order
        let cancelled: bool = sl.aleo/cancel_order(order);
        assert_eq(cancelled, true);
    }

    // Test 6: Should fail - tick range too wide
    @test
    @should_fail
    script test_tick_range_too_wide() {
        // Try to create order with range > MAX_TICK_RANGE (50)
        let order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            true,
            1000u64,
            1100u64,        // Range of 100 ticks (exceeds 50)
            1u32,
            10500u64,
            1000u64
        );
    }

    // Test 7: Should fail - limit price outside tick range
    @test
    @should_fail
    script test_limit_price_outside_range() {
        // Tick range 1490-1510 should contain prices 149000-151100
        // But limit price is 152000 (outside range)
        let order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            true,
            1490u64,
            1510u64,
            1u32,
            152000u64,      // Outside the tick range
            1000u64
        );
    }

    // Test 8: Should fail - orders don't cross
    @test
    @should_fail
    script test_orders_dont_cross() {
        // Buy order with low limit
        let buy_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            true,
            1400u64,
            1420u64,
            1u32,
            14100u64,       // Willing to buy at $14.10
            1000u64
        );

        // Sell order with higher limit
        let sell_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,
            false,
            1500u64,
            1520u64,
            2u32,
            15100u64,       // Wants to sell at $15.10
            500u64
        );

        // Should fail because buy_limit < sell_limit
        let (ub1, us1, bs1, ss1): (sl.aleo/TickOrder, sl.aleo/TickOrder, sl.aleo/Settlement, sl.aleo/Settlement) =
            sl.aleo/settle_match(buy_order, sell_order, 3u32);
    }

    // Test 9: Should fail - different token pairs
    @test
    @should_fail
    script test_different_token_pairs() {
        let buy_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            1u64,           // Token pair 1
            true,
            1490u64,
            1510u64,
            1u32,
            15000u64,
            1000u64
        );

        let sell_order: sl.aleo/TickOrder = sl.aleo/submit_tick_order(
            2u64,           // Token pair 2 (different!)
            false,
            1495u64,
            1505u64,
            2u32,
            14950u64,
            500u64
        );

        // Should fail - token pairs don't match
        let (ub2, us2, bs2, ss2): (sl.aleo/TickOrder, sl.aleo/TickOrder, sl.aleo/Settlement, sl.aleo/Settlement) =
            sl.aleo/settle_match(buy_order, sell_order, 3u32);
    }

    // Dummy transition required by Leo
    transition dummy() -> u32 {
        return 1u32;
    }

    @noupgrade
    async constructor() {}
}
