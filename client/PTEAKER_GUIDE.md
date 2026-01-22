# Pteaker - Private Tick-Based Order Book on Aleo

## Overview

Pteaker is a zero-knowledge trading platform built on the Aleo blockchain that demonstrates privacy-preserving order matching using tick-based aggregation. Unlike traditional order books where all order details are publicly visible, Pteaker encrypts individual order information while maintaining fair price discovery at the tick level.

## Architecture

### 1. **Smart Contract Layer** (`sl.aleo`)

The Leo program defines the core trading logic with these key transitions:

#### `submit_tick_order`
- **Public Inputs**: Token pair, order side, tick range (lower/upper)
- **Private Inputs**: Exact limit price, quantity
- **Constraints**:
  - Tick range must be within MAX_TICK_RANGE (50 ticks)
  - Limit price must fall within declared tick range
  - Quantity must be positive

#### `settle_match`
- Matches buy and sell orders with overlapping tick ranges
- Verifies limit prices cross (buy >= sell)
- Executes at midpoint price: `(buyLimit + sellLimit) / 2`
- Creates Settlement records for both parties
- Updates order fill amounts

#### `cancel_order`
- Only order owner can cancel
- Only possible if order not fully filled

### 2. **Frontend Layer**

#### Components:
- **Header** (`header.tsx`): Wallet connection, market info display
- **OrderBookDisplay** (`order-book-display.tsx`): Public tick-aggregated view
- **OrderPlacementForm** (`order-placement-form.tsx`): Order submission with privacy settings
- **UserOrders** (`user-orders.tsx`): Your active orders (private to you)
- **RecentTrades** (`recent-trades.tsx`): Settlement events (public)

#### Hooks:
- **useAleo** (`hooks/use-aleo.ts`): Wallet connection and transaction execution
- **useOrderBook** (`hooks/use-order-book.ts`): Order book state management

### 3. **Contract Integration** (`lib/aleo-contract.ts`)

Provides TypeScript interface to the Leo program with helper functions for:
- Price-to-tick conversions
- Tick overlap verification
- Midpoint price calculation
- Order validation

## How It Works

### Order Placement Flow

```
1. User clicks "Place Order"
   ├─ Selects side (Buy/Sell)
   ├─ Sets public tick range ($14.95 - $15.05)
   ├─ Sets private limit price ($15.00)
   └─ Sets private quantity (1000 ALEO)

2. Frontend validates constraints
   └─ Limit price must be within tick range

3. Transaction submitted to Aleo
   ├─ Public: token_pair, side, tick_lower, tick_upper
   └─ Private: limit_price, quantity (encrypted)

4. Aleo network creates TickOrder record
   └─ Owner: caller address
   └─ Status: Active, filled=0

5. Order appears in public order book
   └─ Tick range shows +1 order count
   └─ Aggregate volume updated
```

### Order Matching Flow

```
1. Off-chain matcher identifies compatible orders
   ├─ Buy order tick range overlaps with sell order
   └─ Buy limit >= Sell limit (crossing)

2. Matcher submits settle_match transition
   ├─ Both encrypted orders provided
   └─ Validates all constraints on-chain

3. Aleo verifies:
   ├─ Same token pair
   ├─ Tick ranges overlap
   ├─ Prices cross
   ├─ Prices within declared ranges
   └─ Remaining quantities > 0

4. Settlement occurs:
   ├─ Execution price = (buyLimit + sellLimit) / 2
   ├─ Fill amount = min(buyRemaining, sellRemaining)
   └─ Settlement records created for both parties

5. Results:
   ├─ Updated order records (filled amounts)
   ├─ Settlement visibility: only to matching parties
   └─ Public recent trades show tick ranges only
```

## Privacy Guarantees

### What's Encrypted (Private)
- ✅ Your exact order price
- ✅ Your order quantity
- ✅ Buy vs. sell side (only visible to counterparty)
- ✅ Your identity (address is private in records)
- ✅ Settlement prices (except to parties involved)

### What's Public (Visible)
- ❌ Tick range where orders exist
- ❌ Count of orders in each tick
- ❌ Aggregate volume settled in each tick
- ❌ Settlement timestamps
- ❌ Estimated midpoint prices (for price discovery)

### Why This Design?

1. **Fair Price Discovery**: Tick-level data reveals supply/demand without leaking individual orders
2. **Front-Running Protection**: Exact order details hidden until settlement
3. **MEV Resistance**: Matcher cannot see order details before execution
4. **Regulatory Compliance**: Audit trail without compromising user privacy

## Key Technical Concepts

### Tick System
- **Tick Size**: 100 basis points (0.01 for prices around $15)
- **Tick Range**: Slider allows 0.01 to 0.50 range
- **Purpose**: Balance privacy (wider ranges) vs. precision (narrower ranges)

### Zero-Knowledge Proofs
The Aleo network uses SNARKs to:
- Verify order constraints without revealing private values
- Prove prices cross without exposing limit prices
- Confirm ownership via viewing key without public signature
- Validate fill amounts without revealing individual quantities

### Settlement Model
- **Midpoint Pricing**: Fair execution at average of crossing prices
- **Private-Only Visibility**: Only order owners see their exact execution prices
- **Deterministic**: Same match always settles at same price (no slippage)

## Configuration

### Current Constants (from `sl.aleo`)

```leo
const TICK_SIZE: u64 = 100u64;                    // 100 basis points
const MAX_TICK_RANGE: u64 = 50u64;               // 0.50 range
const MATCHER_FEE_BPS: u64 = 5u64;               // 0.05% fee
const TRADING_FEE_BPS: u64 = 10u64;              // 0.10% fee
```

### Frontend Configuration (`hooks/use-order-book.ts`)

```typescript
const TICK_SIZE = 100;              // basis points
const BASE_PRICE = 1500;            // $15.00
const TOKEN_PAIR = 'ALEO/USDC';    // Current market
```

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Aleo SDK (for production deployment)

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

### Aleo Network Integration

In production, connect to Aleo by:

1. Install Aleo SDK:
```bash
npm install @provable-hq/sdk
```

2. Update `hooks/use-aleo.ts` to use actual SDK
3. Compile Leo program: `aleo build`
4. Deploy to Aleo Devnet or Mainnet

### Contract Deployment

```bash
# Compile the Leo program
aleo build

# Deploy to testnet
aleo deploy --network testnet3

# View deployment
aleo info --network testnet3 sl.aleo
```

## Testing the Interface

The app includes mock data for demonstration:

- **Order Book**: Pre-populated with 11 tick levels
- **Recent Trades**: 5 mock settlement events
- **User Orders**: 3 sample orders (active, partially-filled, cancelled)
- **Wallet**: Simulated connection (use real Aleo wallet in production)

All functionality works with mock data for testing UX without Aleo network access.

## API Reference

### `useAleo()` Hook

```typescript
const {
  account,              // Current account or null
  connected,           // Connection status
  loading,            // Transaction loading state
  error,              // Error message or null
  connectWallet,      // () => Promise<void>
  disconnectWallet,   // () => void
  executeTransaction, // (name: string, inputs: any) => Promise<any>
} = useAleo();
```

### `useOrderBook()` Hook

```typescript
const {
  orderBook,            // TickOrderBook (tick_id => TickInfo)
  recentTrades,         // RecentTrade[]
  loading,             // Refresh loading state
  lastPrice,           // Current market price
  volume24h,          // 24h traded volume
  refreshOrderBook,   // () => Promise<void>
  addTrade,          // (trade: RecentTrade) => void
  updateTickOrderCount, // (tickId: number) => void
  tokenPair,          // Market identifier
} = useOrderBook();
```

## Future Enhancements

1. **Multiple Markets**: Support ALEO/USDC, BTC/USDC, ETH/USDC
2. **Advanced Orders**: Stop-loss, take-profit, iceberg orders
3. **Fee Distribution**: Matcher incentives, protocol treasury
4. **Governance**: Tick size and range adjustments via DAO
5. **Oracle Integration**: Price feeds for settlement validation
6. **Cross-Chain**: Bridge orders to other blockchains
7. **Analytics**: Privacy-preserving order flow analytics
8. **Mobile**: Native apps for iOS/Android

## References

- **Aleo Docs**: https://docs.aleo.org
- **Leo Language**: https://developer.aleo.org
- **zk-Auction Example**: https://github.com/ProvableHQ/zk-auction-example
- **Zero-Knowledge Proofs**: https://en.wikipedia.org/wiki/Zero-knowledge_proof

## License

MIT

## Support

For issues or questions:
- Check docs at https://docs.aleo.org
- Aleo Discord: https://discord.gg/aleo
- Report bugs on GitHub
