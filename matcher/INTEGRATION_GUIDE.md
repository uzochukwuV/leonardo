# Private Orderbook v17 - Keeper Bot Integration Guide

## Overview

The keeper bot is now fully integrated with the v17 contract and uses the Provable v2 API to scan the blockchain for orders and cancellation requests.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Aleo Blockchain                          │
│  (private_orderbook_v17.aleo deployed)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Provable v2 API (testnet)                       │
│  - /transactions/summary/latest                             │
│  - /transaction/{id}                                        │
│  - /program/{id}/mapping/{name}/{key}                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           Chain Scanner (chain-scanner.mjs)                 │
│  - scanOrderRecords()                                       │
│  - scanCancellationRequestRecords()                         │
│  - getLatestBlockHeight()                                   │
│  - getMapping()                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         Keeper Bot (orderbook-keeper.mjs)                   │
│  - scanTick() - Scans for orders & cancellations            │
│  - matchTick() - Matches & settles orders                   │
│  - HTTP API - Provides orderbook data                       │
└─────────────────────────────────────────────────────────────┘
```

## Files

### 1. `chain-scanner.mjs`
Queries Provable v2 API to fetch records from the blockchain.

**Key Functions:**
- `scanOrderRecords(programId, limit)` - Fetch Order records
- `scanCancellationRequestRecords(programId, limit)` - Fetch CancellationRequest records
- `getLatestBlockHeight()` - Get current block height
- `getMapping(programId, mappingName, key)` - Get mapping values

**How it works:**
1. Queries `/transactions/summary/latest` to get recent transactions
2. Filters for transactions from the orderbook program
3. Fetches full transaction details to extract record outputs
4. Parses record ciphertexts and plaintexts

### 2. `orderbook-keeper.mjs`
Main keeper bot that orchestrates scanning, matching, and settlement.

**Key Functions:**
- `scanTick()` - Runs every 30s, scans for orders and cancellations
- `matchTick()` - Runs every 10s, matches orders and processes cancellations
- `settleMatch(match)` - Executes settle_match on-chain
- `processCancellation(req)` - Executes cancel function on-chain
- HTTP API - Provides `/api/orderbook`, `/api/orders`, `/api/trades`

**State Management:**
- `orderStore` - Map of all known orders
- `buyOrders` - Sorted buy orders (price DESC)
- `sellOrders` - Sorted sell orders (price ASC)
- `cancellationRequests` - Pending cancellation requests
- `recentTrades` - Last 100 trades

### 3. `TEST_SCENARIO.mjs`
Comprehensive guide for testing the complete flow.

## Setup

### 1. Environment Variables

Create `.env` in `matcher/` directory:

```bash
# Required
PRIVATE_KEY=<keeper_private_key>

# Optional (defaults shown)
ORDERBOOK_PROGRAM=private_orderbook_v17.aleo
NETWORK=testnet
NETWORK_ID=1
QUERY_ENDPOINT=https://api.explorer.provable.com/v1
BROADCAST_ENDPOINT=https://api.explorer.provable.com/v1/testnet/transaction/broadcast
SCAN_INTERVAL=30000
MATCH_INTERVAL=10000
API_PORT=3002
FRONTEND_ORIGIN=*
ORCHESTRATOR_ADDR=<optional>
TREASURY_ADDR=<optional>
```

### 2. Install Dependencies

```bash
cd matcher
npm install
```

### 3. Start Keeper Bot

```bash
node orderbook-keeper.mjs
```

Expected output:
```
╔════════════════════════════════════════════════════════════╗
║        Private Orderbook Keeper Bot v1 (v17)               ║
╚════════════════════════════════════════════════════════════╝

[HH:MM:SS] [BOT] Program: private_orderbook_v17.aleo
[HH:MM:SS] [BOT] Network: testnet
[HH:MM:SS] [BOT] Scan interval:  30s
[HH:MM:SS] [BOT] Match interval: 10s
[HH:MM:SS] [BOT] API port: 3002

[HH:MM:SS] [API] ✅ HTTP server listening on port 3002
[HH:MM:SS] [BOT] Initial order scan...
[HH:MM:SS] [SCAN] Fetching Order records from chain...
[HH:MM:SS] [SCAN] Found 0 Order record(s)
[HH:MM:SS] [BOT] Initial match check...
[HH:MM:SS] [MATCH] No crossing orders found
[HH:MM:SS] [BOT] ✅ Running. Ctrl+C to stop.
```

## API Endpoints

### GET /health
Bot status and statistics.

```bash
curl http://localhost:3002/health
```

Response:
```json
{
  "status": "ok",
  "paused": false,
  "programId": "private_orderbook_v17.aleo",
  "orderCount": 2,
  "buyOrders": 1,
  "sellOrders": 1,
  "pendingCancellations": 0,
  "lastScanAt": "2024-01-15T10:30:45.123Z",
  "lastMatchAt": "2024-01-15T10:30:50.456Z",
  "upSince": "2024-01-15T10:00:00.000Z"
}
```

### GET /api/orderbook
Current order book with bids and asks.

```bash
curl http://localhost:3002/api/orderbook
```

Response:
```json
{
  "bids": [
    {
      "price": "100",
      "quantity": "1000",
      "trader": "aleo1...",
      "orderId": "123field"
    }
  ],
  "asks": [
    {
      "price": "95",
      "quantity": "600",
      "trader": "aleo1...",
      "orderId": "456field"
    }
  ],
  "spread": "5",
  "bestBid": "100",
  "bestAsk": "95",
  "lastScanAt": "2024-01-15T10:30:45.123Z"
}
```

### GET /api/orders
All known orders.

```bash
curl http://localhost:3002/api/orders
```

### GET /api/trades
Recent trades (last 100).

```bash
curl http://localhost:3002/api/trades
```

### POST /api/match
Manually trigger matching.

```bash
curl -X POST http://localhost:3002/api/match
```

### POST /api/bot/pause
Pause the bot.

```bash
curl -X POST http://localhost:3002/api/bot/pause
```

### POST /api/bot/resume
Resume the bot.

```bash
curl -X POST http://localhost:3002/api/bot/resume
```

## Testing Flow

### 1. Submit Buy Order

```bash
snarkos developer execute \
  --private-key <USER_PRIVATE_KEY> \
  --query https://api.explorer.provable.com/v1 \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --network 1 \
  private_orderbook_v17.aleo \
  submit_buy_order \
  1u64 \
  <USDC_TOKEN_ID>field \
  100u64 \
  1000u128 \
  100u128 \
  <TIMESTAMP>u32 \
  <EXPIRES_AT>u32 \
  <KEEPER_ADDRESS>
```

### 2. Submit Sell Order

```bash
snarkos developer execute \
  --private-key <SELLER_PRIVATE_KEY> \
  --query https://api.explorer.provable.com/v1 \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --network 1 \
  private_orderbook_v17.aleo \
  submit_sell_order \
  1u64 \
  <USDC_TOKEN_ID>field \
  95u64 \
  1000u128 \
  1000u64 \
  <TIMESTAMP>u32 \
  <EXPIRES_AT>u32 \
  <KEEPER_ADDRESS>
```

### 3. Check Orderbook

```bash
curl http://localhost:3002/api/orderbook
```

### 4. Wait for Keeper to Match

The keeper bot will:
1. Scan for orders every 30s
2. Match crossing orders every 10s
3. Execute settlement on-chain
4. Update order state with partial fills

### 5. Request Cancellation

```bash
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
```

### 6. Keeper Processes Cancellation

The keeper bot will:
1. Scan for CancellationRequest records
2. Execute cancel_buy_order or cancel_sell_order
3. Refund remaining escrow to trader

## Key Features

### ✅ Two-Step Cancellation
- Users request cancellation using Receipt (which they own)
- Keeper processes cancellation and creates CancellationProof
- No race conditions or double-spending

### ✅ Partial Fill Support
- Orders can be partially filled
- Keeper holds updated Order records
- Remaining quantity can be matched again
- Escrow amount is reduced by amount paid out

### ✅ Edge Case Handling
- Expiration checks (contract validates)
- Escrow safety checks (contract validates)
- Price validation (contract validates)
- Refund validation (contract validates)

### ✅ Automatic Matching
- Keeper scans every 30s
- Matches every 10s
- Processes cancellations during match tick
- Handles multiple matches in sequence

### ✅ HTTP API
- Real-time orderbook data
- Trade history
- Bot status and statistics
- Manual match trigger
- Pause/resume controls

## Monitoring

### Check Bot Logs

```bash
# Watch logs in real-time
tail -f keeper.log

# Or run with output
node orderbook-keeper.mjs 2>&1 | tee keeper.log
```

### Monitor Orderbook

```bash
# Check orderbook every 5 seconds
watch -n 5 'curl -s http://localhost:3002/api/orderbook | jq'
```

### Check Recent Trades

```bash
curl http://localhost:3002/api/trades | jq
```

## Troubleshooting

### Bot not finding orders

1. Check that orders were submitted to the correct program
2. Verify program ID in `.env` matches deployed program
3. Check that orders are on-chain (use explorer)
4. Verify keeper has correct private key

### Settlement failing

1. Check that keeper has enough credits for fees
2. Verify treasury address is set correctly
3. Check that orders haven't expired
4. Verify quote token is registered in token_registry

### Cancellation not processing

1. Check that CancellationRequest was created
2. Verify keeper scanned for cancellation requests
3. Check that order still exists (not fully filled)
4. Verify keeper has enough credits for refund

## Performance Considerations

- **Scan Interval**: 30s (configurable via `SCAN_INTERVAL`)
- **Match Interval**: 10s (configurable via `MATCH_INTERVAL`)
- **API Calls**: ~1-2 per scan (transaction summaries + full transactions)
- **Memory**: ~10MB for 1000 orders
- **CPU**: Minimal (mostly I/O bound)

## Security Notes

- ✅ Private keys never leave the keeper bot
- ✅ Orders are encrypted on-chain
- ✅ Only keeper can settle/cancel orders
- ✅ Users receive Receipt records as proof
- ✅ Settlement creates SettlementProof records
- ✅ Cancellation creates CancellationProof records

## Next Steps

1. Deploy contract to mainnet
2. Update API endpoints in `.env`
3. Set up monitoring and alerting
4. Configure keeper bot for production
5. Test with real users and tokens
