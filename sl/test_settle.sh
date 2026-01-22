#!/bin/bash
# Test settlement of matching orders

echo "=== Testing Order Settlement ==="
echo ""

# These are the exact records from your previous run
# You can copy-paste the actual output records here

BUY_ORDER='{
  owner: aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px.private,
  token_pair: 1u64.private,
  tick_lower: 1490u64.private,
  tick_upper: 1510u64.private,
  is_buy: true.private,
  quantity: 1000u64.private,
  limit_price: 150000u64.private,
  filled: 0u64.private,
  timestamp: 100u32.private,
  _nonce: 5240819648006513800067655951410625539100297579245624579830390422253260133643group.public
}'

SELL_ORDER='{
  owner: aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px.private,
  token_pair: 1u64.private,
  tick_lower: 1495u64.private,
  tick_upper: 1505u64.private,
  is_buy: false.private,
  quantity: 500u64.private,
  limit_price: 149500u64.private,
  filled: 0u64.private,
  timestamp: 101u32.private,
  _nonce: 639536160334149714208514160156127220091606887790037192766053968890825957315group.public
}'

echo "Settling match between:"
echo "  Buy:  1000 ALEO @ $15.00 (ticks 1490-1510)"
echo "  Sell: 500 ALEO @ $14.95 (ticks 1495-1505)"
echo ""
echo "Expected execution:"
echo "  Quantity: 500 ALEO (limited by sell order)"
echo "  Price: 149750 basis points = $14.975 (midpoint)"
echo ""

leo run settle_match "$BUY_ORDER" "$SELL_ORDER" 102u32

echo ""
echo "✅ If successful, you should see:"
echo "   - updated_buy.filled = 500u64"
echo "   - updated_sell.filled = 500u64"
echo "   - buyer_settlement.quantity = 500u64"
echo "   - buyer_settlement.price = 149750u64"
echo "   - seller_settlement.quantity = 500u64"
echo "   - seller_settlement.price = 149750u64"
