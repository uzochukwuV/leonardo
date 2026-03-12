# Private Orderbook Keeper Bot

Automated keeper bot for the Private Orderbook v12 on Aleo. Scans for orders, matches crossing bids/asks, and executes settlements.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Orderbook Keeper Bot                       │
├─────────────────────────────────────────────────────────────┤
│  1. SCAN      │ Provable Scanner → Get Order records        │
│  2. PARSE     │ Decrypt ciphertexts → Extract order data    │
│  3. BOOK      │ Build buy/sell queues (sorted by price)     │
│  4. MATCH     │ Find crossing orders (buy.price >= sell)    │
│  5. SETTLE    │ snarkos execute settle_match with records   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 18+
- **snarkos** CLI installed and in PATH
- **ALEO credits** in the orchestrator wallet for transaction fees
- **Provable API credentials** for record scanning

## Setup

```bash
cd matcher
cp .env.orderbook.example .env
# Edit .env with your keys
npm install
```

## Run

```bash
npm start
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orderbook` | GET | Formatted order book (bids/asks/spread) |
| `/api/orders` | GET | All known orders |
| `/api/trades` | GET | Recent trades |
| `/api/match` | POST | Manually trigger matching |
| `/api/cancel/:orderId` | POST | Cancel an order |
| `/api/bot/pause` | POST | Pause the bot |
| `/api/bot/resume` | POST | Resume the bot |
| `/health` | GET | Bot status |

## How It Works

### Order Scanning (every 30s)
- Uses Provable Scanner API to fetch Order records owned by orchestrator
- Decrypts record ciphertexts using view key
- Parses order data (price, quantity, trader, etc.)
- Builds in-memory order book with buy/sell queues

### Order Matching (every 10s)
- Finds crossing orders where `buy.price >= sell.price`
- Uses midpoint price for settlement: `(buy.price + sell.price) / 2`
- Executes `settle_match` via snarkos with actual record ciphertexts

### Settlement
- Buyer receives base tokens (ALEO) from seller's escrow
- Seller receives quote tokens (USDC) minus fees
- Keeper receives settler fee (0.1%)
- Treasury receives protocol fee (0.05%)

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PRIVATE_KEY | - | Orchestrator/keeper private key (required) |
| VIEW_KEY | - | Orchestrator view key for scanning (required) |
| PROVABLE_CONSUMER_ID | - | Provable API consumer ID |
| PROVABLE_API_KEY | - | Provable API key |
| ORDERBOOK_PROGRAM | private_orderbook_v12.aleo | Orderbook program ID |
| TOKEN_PROGRAM | mock_usdc_orderbook.aleo | Token program ID |
| SCAN_INTERVAL | 30000 | Order scan interval (ms) |
| MATCH_INTERVAL | 10000 | Match check interval (ms) |
| API_PORT | 3002 | HTTP API port |

## Files

```
matcher/
├── orderbook-keeper.mjs    # Main keeper bot
├── provable-client.mjs     # Provable Scanner API client
├── .env.orderbook.example  # Configuration template
├── package.json
└── snarkos                 # snarkos binary (Linux)
```

## Contract Functions

The keeper bot interacts with these orderbook functions:

- `settle_match` - Match buy + sell orders, transfer tokens to both traders
- `cancel_buy_order` - Cancel buy order, refund quote tokens
- `cancel_sell_order` - Cancel sell order, refund base tokens
