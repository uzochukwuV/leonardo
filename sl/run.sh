#!/bin/bash
# Manual testing script for the order book contract

echo "=== Private Tick-Based Order Book - Manual Tests ==="
echo ""

echo "Test 1: Submit a buy order"
echo "----------------------------"
echo "Token pair: 1 (USDC/ALEO)"
echo "Tick range: 1490-1510 (price $14.90-$15.10)"
echo "Limit price: 150000 ($15.00 in basis points)"
echo "Quantity: 1000 tokens"
echo ""
leo run submit_tick_order \
  1u64 \
  true \
  1490u64 \
  1510u64 \
  100u32 \
  150000u64 \
  1000u64

echo ""
echo "Test 2: Submit a sell order"
echo "----------------------------"
echo "Token pair: 1 (USDC/ALEO)"
echo "Tick range: 1495-1505 (price $14.95-$15.05)"
echo "Limit price: 149500 ($14.95 in basis points)"
echo "Quantity: 500 tokens"
echo ""
leo run submit_tick_order \
  1u64 \
  false \
  1495u64 \
  1505u64 \
  101u32 \
  149500u64 \
  500u64

echo ""
echo "Test 3: Cancel an order (you'll need to provide a valid TickOrder record)"
echo "-------------------------------------------------------------------------"
echo "leo run cancel_order '{owner:..., token_pair:1u64, ...}'"

echo ""
echo "Note: To test settle_match, you need to:"
echo "1. Create two orders using submit_tick_order"
echo "2. Copy the returned TickOrder records"
echo "3. Run: leo run settle_match <buy_order_record> <sell_order_record> 102u32"
