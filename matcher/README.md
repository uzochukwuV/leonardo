# Aleo Order Book Matcher Service

Off-chain matcher service for the Private Tick-Based Order Book on Aleo blockchain.

## 🎯 Overview

The matcher service continuously monitors the on-chain tick registry for overlapping buy and sell orders, identifies profitable matches, and submits settlement transactions to the blockchain.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    MATCHER SERVICE FLOW                      │
└─────────────────────────────────────────────────────────────┘

1. MONITOR
   ├─> Fetch tick_registry from blockchain
   ├─> Find ticks with both buy and sell orders
   └─> Load order details from off-chain database

2. MATCH
   ├─> Find overlapping tick ranges
   ├─> Verify prices cross (buy ≥ sell)
   ├─> Calculate execution price (midpoint)
   └─> Filter by minimum profitability

3. EXECUTE
   ├─> Submit settle_match transaction
   ├─> Wait for blockchain confirmation
   └─> Earn matcher fee (0.05%)

4. REPEAT
   └─> Scan every 5 seconds (configurable)
```

## 📦 Installation

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Aleo testnet account with credits

### Setup

```bash
cd matcher

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## ⚙️ Configuration

Edit `.env` file:

```bash
# Your matcher account credentials
MATCHER_PRIVATE_KEY=APrivateKey1zkp...
MATCHER_ADDRESS=aleo1...

# Network settings
ALEO_NETWORK=testnet3
ALEO_API_URL=https://api.explorer.aleo.org/v1

# Matching parameters
SCAN_INTERVAL_MS=5000              # Scan every 5 seconds
MIN_PROFIT_BASIS_POINTS=10         # Minimum 10 bps profit
MAX_TICK_RANGE=50                  # Maximum tick range to match

# Performance
MAX_CONCURRENT_MATCHES=5           # Execute max 5 matches per cycle
BATCH_SIZE=100                     # Batch size for tick fetching
```

## 🚀 Usage

### Development Mode

```bash
# Run with hot reload
npm run dev
```

### Production Mode

```bash
# Build TypeScript
npm run build

# Start service
npm start
```

### Running as Background Service

```bash
# Using PM2
npm install -g pm2
pm2 start dist/index.js --name orderbook-matcher
pm2 logs orderbook-matcher
pm2 stop orderbook-matcher
```

## 📊 Monitoring

### Logs

Logs are written to:
- Console (development)
- `./logs/matcher.log` (all logs)
- `./logs/error.log` (errors only)

### Log Levels

```bash
# In .env
LOG_LEVEL=debug  # debug | info | warn | error
```

### Statistics

The service logs statistics every scan cycle:

```json
{
  "registry": {
    "activeTicks": 142,
    "buyOrders": 45,
    "sellOrders": 38
  },
  "matcher": {
    "tickSize": "100",
    "matcherFeeBps": "5",
    "minProfitBps": 10
  },
  "executor": {
    "totalSettlements": 23,
    "pendingSettlements": 2,
    "totalVolume": "125000",
    "totalFeesEarned": "62"
  }
}
```

## 🏗️ Architecture

### Components

#### 1. Registry Monitor ([registry.ts](src/registry.ts))
- Fetches tick_registry from blockchain
- Maintains off-chain order book
- Finds overlapping ticks

#### 2. Matching Engine ([matcher.ts](src/matcher.ts))
- Evaluates order pairs for matches
- Calculates execution price/quantity
- Filters by profitability

#### 3. Settlement Executor ([executor.ts](src/executor.ts))
- Submits settle_match transactions
- Tracks pending settlements
- Records completed trades

#### 4. Main Service ([index.ts](src/index.ts))
- Orchestrates all components
- Manages scan loop
- Handles graceful shutdown

### File Structure

```
matcher/
├── src/
│   ├── index.ts          # Main service entry point
│   ├── config.ts         # Configuration loader
│   ├── logger.ts         # Winston logging setup
│   ├── types.ts          # TypeScript type definitions
│   ├── registry.ts       # Tick registry monitor
│   ├── matcher.ts        # Matching engine
│   └── executor.ts       # Settlement executor
├── logs/                 # Log files (generated)
├── dist/                 # Compiled JavaScript (generated)
├── .env                  # Configuration (create from .env.example)
├── .env.example          # Configuration template
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── README.md            # This file
```

## 💰 Economics

### Matcher Fee

- **Fee Rate**: 0.05% (5 basis points)
- **Calculation**: `(quantity × price / 10000) × 0.0005`
- **Example**: Match 1000 ALEO @ $15.00 → Fee = 0.75 USDC

### Profitability

```
Total Profit = Price Spread + Matcher Fee

Price Spread = Buy Limit Price - Sell Limit Price
Matcher Fee = (Execution Value) × 0.05%

Example:
Buy:  1000 ALEO @ $15.00
Sell: 1000 ALEO @ $14.95
→ Spread: $0.05 × 1000 = $50
→ Fee: $15,000 × 0.0005 = $7.50
→ Total Profit: $57.50
```

## 🔧 Advanced Configuration

### Order Book Integration

The matcher needs access to order details (which are private on-chain). You must:

1. **Run an Order Submission API** where users submit their orders
2. **Maintain Off-Chain Database** of active orders
3. **Update Registry Monitor** to query your database

Example integration in [registry.ts](src/registry.ts):

```typescript
async fetchOrdersForTick(tickId: bigint): Promise<TickOrder[]> {
  // Connect to your database
  const orders = await db.query(
    'SELECT * FROM orders WHERE tick_lower <= ? AND tick_upper >= ?',
    [tickId, tickId]
  );
  return orders;
}
```

### Custom Matching Strategy

Modify [matcher.ts](src/matcher.ts) to implement custom strategies:

```typescript
private evaluateMatch(buyOrder: TickOrder, sellOrder: TickOrder): MatchCandidate | null {
  // Add your custom logic here
  // Examples:
  // - Prioritize certain token pairs
  // - Adjust execution price calculation
  // - Add volume-based profitability

  // ...existing code...
}
```

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Manual Testing

1. Start local Aleo devnet
2. Deploy order book contract
3. Submit test orders
4. Start matcher service
5. Observe logs for matches

## 🔒 Security Considerations

### Private Key Management

- **Never commit** `.env` to version control
- Use environment variables in production
- Consider hardware wallet integration
- Rotate keys regularly

### Transaction Safety

- Matcher validates orders before submission
- All settlements are atomic (all-or-nothing)
- Failed transactions don't lose funds

### Rate Limiting

- Configurable scan interval prevents spam
- Max concurrent matches prevents resource exhaustion
- Built-in retry logic for network failures

## 🐛 Troubleshooting

### No Matches Found

```
Check:
- Are there active orders in the order book?
- Do tick ranges overlap?
- Do prices cross (buy >= sell)?
- Is MIN_PROFIT_BASIS_POINTS too high?
```

### Settlement Failures

```
Check:
- Does matcher account have sufficient credits?
- Is the contract program ID correct?
- Are orders still valid (not cancelled)?
- Is the API URL accessible?
```

### High Memory Usage

```
Reduce:
- MAX_CONCURRENT_MATCHES
- BATCH_SIZE
- Increase scan interval
```

## 📈 Performance Tips

1. **Optimize Scan Interval**
   - Too fast: Wastes resources
   - Too slow: Misses opportunities
   - Recommended: 3-10 seconds

2. **Batch Processing**
   - Fetch ticks in batches
   - Execute multiple matches in parallel
   - Clear old data periodically

3. **Database Indexing**
   - Index tick_lower, tick_upper columns
   - Index token_pair for filtering
   - Use connection pooling

## 🤝 Integration with Frontend

Your frontend can:

1. **Submit orders to your API** (which the matcher monitors)
2. **Query matcher stats** via REST endpoint
3. **Subscribe to match events** via WebSocket

Example API server (not included):

```typescript
import express from 'express';
import { MatcherService } from './matcher';

const app = express();
const matcher = new MatcherService();

app.get('/health', (req, res) => {
  res.json(matcher.getHealth());
});

app.listen(3000);
```

## 📄 License

Apache-2.0

## 🆘 Support

- GitHub Issues: [Report bugs](https://github.com/your-repo/issues)
- Documentation: [Order Book Docs](../sl/README.md)
- Aleo Discord: [Get help](https://discord.gg/aleo)

---

**Built for Aleo's Private DeFi Ecosystem** 🚀
