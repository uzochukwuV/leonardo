#!/usr/bin/env node

/**
 * Test Scenario: Private Orderbook v17 with Keeper Bot
 * =====================================================
 *
 * This guide walks through testing the complete flow:
 *   1. User submits buy order
 *   2. User submits sell order
 *   3. Keeper scans and matches orders
 *   4. Settlement executes
 *   5. User requests cancellation
 *   6. Keeper processes cancellation
 *
 * Prerequisites:
 *   - private_orderbook_v17.aleo deployed
 *   - Keeper bot running (node orderbook-keeper.mjs)
 *   - Test user with ALEO credits
 */

// ═══════════════════════════════════════════════════════════════
// SCENARIO 1: SUBMIT BUY ORDER
// ═══════════════════════════════════════════════════════════════

/*
User submits a buy order:
  - Pair: ALEO/USDC (pair_id = 1)
  - Price: 100 (basis points, so 1 USDC per ALEO)
  - Quantity: 1000 ALEO
  - Escrow: 100 USDC (1000 * 100 / 10000)

Command:
  snarkos developer execute \
    --private-key $PRIVATE_KEY \
    --query https://api.explorer.provable.com/v1 \
    --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
    --network 1 \
    private_orderbook_v17.aleo \
    submit_buy_order \
    1u64 \
    7002field \
    100u64 \
    1000u128 \
    100u128 \
    15020990u32 \
    15028090u32 \
    aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf

Returns:
  - Order record (owned by keeper)
  - Receipt record (owned by user) ← User keeps this as proof
  - Future (for escrow transfer)

Expected output:
  ✅ Order created with order_id = BHP256_hash(...)
  ✅ Receipt created for user
  ✅ 100 USDC escrowed to keeper
*/

// ═══════════════════════════════════════════════════════════════
// SCENARIO 2: SUBMIT SELL ORDER
// ═══════════════════════════════════════════════════════════════

/*
Another user submits a sell order:
  - Pair: ALEO/USDC (pair_id = 1)
  - Price: 95 (basis points, so 0.95 USDC per ALEO)
  - Quantity: 1000 ALEO
  - Escrow: 1000 ALEO

Command:
  snarkos developer execute \
    --private-key <SELLER_PRIVATE_KEY> \
    --query https://api.explorer.provable.com/v1 \
    --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
    --network 1 \
    private_orderbook_v17.aleo \
    submit_sell_order \
    1u64 \
    7002field \
    95u64 \
    1000u128 \
    1000u64 \
    <TIMESTAMP>u32 \
    <EXPIRES_AT>u32 \
    <KEEPER_ADDRESS>

Returns:
  - Order record (owned by keeper)
  - Receipt record (owned by seller)
  - Future (for escrow transfer)

Expected output:
  ✅ Order created with order_id = BHP256_hash(...)
  ✅ Receipt created for seller
  ✅ 1000 ALEO escrowed to keeper
*/

// ═══════════════════════════════════════════════════════════════
// SCENARIO 3: KEEPER SCANS AND MATCHES
// ═══════════════════════════════════════════════════════════════

/*
Keeper bot runs scanTick():
  1. Queries /transactions/summary/latest
  2. Filters for private_orderbook_v17.aleo transactions
  3. Fetches full transactions to get Order record outputs
  4. Parses Order records from plaintext
  5. Updates in-memory orderbook

Expected output:
  [SCAN] Fetching Order records from chain...
  [SCAN] Found 2 Order record(s)
  [SCAN] Parsed 2 valid order(s)
  [BOOK] Order book: 1 bids, 1 asks
  [BOOK]   Best bid: 100 (qty: 1000)
  [BOOK]   Best ask: 95 (qty: 1000)

Keeper bot runs matchTick():
  1. Finds crossing orders (buy.price >= sell.price: 100 >= 95 ✓)
  2. Checks same pair_id and quote_token_id
  3. Calculates fill_quantity = min(1000, 1000) = 1000
  4. Calculates fill_price = (100 + 95) / 2 = 97

Expected output:
  [MATCH] Found 1 potential match(es)
  [SETTLE] Settling match:
  [SETTLE]   Buy:  <order_id>... @ 100
  [SETTLE]   Sell: <order_id>... @ 95
  [SETTLE]   Fill: 1000 @ 97
*/

// ═══════════════════════════════════════════════════════════════
// SCENARIO 4: SETTLEMENT EXECUTION
// ═══════════════════════════════════════════════════════════════

/*
Keeper executes settle_match:
  - fill_quantity: 1000u128
  - fill_price: 97u64
  - timestamp: <CURRENT_TIMESTAMP>u32
  - treasury_addr: <TREASURY_ADDRESS>

Calculations:
  - quote_amount = (1000 * 97) / 10000 = 9700 (USDC)
  - settler_fee = (9700 * 10) / 10000 = 97 (USDC to keeper)
  - protocol_fee = (9700 * 5) / 10000 = 48.5 → 48 (USDC to treasury)
  - seller_receives = 9700 - 97 - 48 = 9555 (USDC)

Transfers:
  1. 1000 ALEO → buyer (from seller's escrow)
  2. 9555 USDC → seller
  3. 97 USDC → keeper (settler fee)
  4. 48 USDC → treasury (protocol fee)

Returns:
  - Updated buy Order (filled: 1000, escrow_amount: 0)
  - Updated sell Order (filled: 1000, escrow_amount: 0)
  - SettlementProof for buyer (owned by buyer)
  - SettlementProof for seller (owned by seller)
  - Future (for all transfers)

Expected output:
  [SETTLE] Executing settle_match via snarkos...
  [SETTLE] ✅ Settlement successful!
  [SETTLE] Buy:  <order_id>... @ 100
  [SETTLE] Sell: <order_id>... @ 95
  [SETTLE] Fill: 1000 @ 97
*/

// ═══════════════════════════════════════════════════════════════
// SCENARIO 5: USER REQUESTS CANCELLATION
// ═══════════════════════════════════════════════════════════════

/*
User requests cancellation using their Receipt:

Command:
  snarkos developer execute \
    --private-key <USER_PRIVATE_KEY> \
    --query https://api.explorer.provable.com/v1 \
    --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
    --network 1 \
    private_orderbook_v17.aleo \
    request_cancel \
    <RECEIPT_RECORD> \
    <KEEPER_ADDRESS> \
    <TIMESTAMP>u32

Returns:
  - CancellationRequest record (owned by keeper)
  - Future (for finalization)

Expected output:
  ✅ CancellationRequest created
  ✅ Keeper can now see and process the cancellation
*/

// ═══════════════════════════════════════════════════════════════
// SCENARIO 6: KEEPER PROCESSES CANCELLATION
// ═══════════════════════════════════════════════════════════════

/*
Keeper bot runs scanTick():
  1. Queries for CancellationRequest records
  2. Stores them in cancellationRequests map

Expected output:
  [SCAN] Checking for cancellation requests...
  [SCAN] Found 1 CancellationRequest record(s)
  [SCAN] Parsed 1 valid cancellation request(s)
  [SCAN] Cancellation request found: <order_id>... from <trader>...

Keeper bot runs matchTick():
  1. Processes pending cancellations
  2. Executes cancel_buy_order or cancel_sell_order
  3. Refunds remaining escrow to trader

Command (for buy order):
  snarkos developer execute \
    --private-key <KEEPER_PRIVATE_KEY> \
    --query https://api.explorer.provable.com/v1 \
    --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
    --network 1 \
    private_orderbook_v17.aleo \
    cancel_buy_order \
    <ORDER_RECORD> \
    <CANCELLATION_REQUEST_RECORD> \
    <TIMESTAMP>u32

Returns:
  - CancellationProof record (owned by trader)
  - Future (for refund transfer)

Expected output:
  [CANCEL] Processing cancellation for buy order: <order_id>...
  [CANCEL]   Trader: <trader_address>
  [CANCEL]   Remaining escrow: <amount>
  [CANCEL] ✅ Order cancelled, tokens refunded to <trader>
*/

// ═══════════════════════════════════════════════════════════════
// PARTIAL FILL SCENARIO
// ═══════════════════════════════════════════════════════════════

/*
If orders are partially filled:

Example:
  - Buy order: 1000 ALEO @ 100
  - Sell order: 600 ALEO @ 95
  - First settlement: fill 600 ALEO

After first settlement:
  - Buy order: filled=600, escrow_amount=40 (100 - 60)
  - Sell order: filled=600, escrow_amount=0 (fully filled)

Keeper holds updated Order records and can match again:
  - Buy order still has 400 ALEO remaining
  - Can match with new sell orders

Expected output:
  [SETTLE] Fill: 600 @ 97
  [SETTLE] ✅ Settlement successful!
  [BOOK] Order book: 1 bids, 0 asks
  [BOOK]   Best bid: 100 (qty: 400)  ← Updated remaining quantity
*/

// ═══════════════════════════════════════════════════════════════
// TESTING CHECKLIST
// ═══════════════════════════════════════════════════════════════

/*
✓ Order Submission
  - User can submit buy order with Receipt
  - User can submit sell order with Receipt
  - Orders appear in keeper's orderbook

✓ Order Matching
  - Keeper scans for Order records
  - Keeper finds crossing orders
  - Keeper validates same pair_id and quote_token_id
  - Keeper validates price within bid-ask spread

✓ Settlement
  - Keeper executes settle_match
  - Buyer receives ALEO
  - Seller receives quote tokens (minus fees)
  - Keeper receives settler fee
  - Treasury receives protocol fee
  - Updated Order records returned

✓ Partial Fills
  - Orders can be partially filled
  - Remaining escrow is updated
  - Keeper can match remaining quantity

✓ Cancellation
  - User can request cancellation with Receipt
  - Keeper scans for CancellationRequest
  - Keeper executes cancel function
  - Trader receives CancellationProof
  - Remaining escrow is refunded

✓ Expiration
  - Settlement fails if orders expired
  - Cancellation works for expired orders

✓ Edge Cases
  - Cannot settle with mismatched pairs
  - Cannot settle with mismatched quote tokens
  - Cannot settle with price outside bid-ask spread
  - Cannot refund more than remaining escrow
  - Cannot cancel fully filled orders
*/

console.log('Test Scenario: Private Orderbook v17');
console.log('=====================================');
console.log('');
console.log('See comments in this file for detailed test scenarios.');
console.log('');
console.log('Quick start:');
console.log('  1. Start keeper bot: node orderbook-keeper.mjs');
console.log('  2. Submit buy order (see SCENARIO 1)');
console.log('  3. Submit sell order (see SCENARIO 2)');
console.log('  4. Wait for keeper to scan and match');
console.log('  5. Check settlement in logs');
console.log('');
