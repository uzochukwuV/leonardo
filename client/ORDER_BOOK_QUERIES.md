# Order Book Data Queries - Implementation Guide

This document explains how the frontend queries and displays order book data from the Aleo blockchain.

## Architecture Overview

```
┌─────────────────────┐
│   UI Components     │
│  - OrderBookDisplay │
│  - RecentTrades     │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  React Hooks        │
│  useOrderBookData() │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  AleoService        │
│  Blockchain API     │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  Aleo Testnet       │
│  Explorer API       │
└─────────────────────┘
```

## Key Files

### 1. Aleo Service (`lib/aleo-service.ts`)

The core service that interfaces with the Aleo blockchain through the Explorer API.

**API Endpoint**: `https://api.explorer.aleo.org/v1/testnet`

**Key Methods**:

```typescript
// Get program mapping data
async getMapping(mappingName: string): Promise<any>

// Get tick registry for a token pair
async getTickRegistry(tokenPairId: number): Promise<Map<number, OnChainTickInfo>>

// Get recent settlements (trade history)
async getRecentSettlements(tokenPairId: number, limit: number): Promise<Settlement[]>

// Get user's orders
async getUserOrders(userAddress: string): Promise<OnChainOrder[]>

// Get transaction status
async getTransactionStatus(transactionId: string): Promise<'pending' | 'confirmed' | 'failed'>
```

### 2. Order Book Data Hook (`hooks/use-order-book-data.ts`)

React hook that fetches and manages order book state.

**Features**:
- Fetches tick registry from blockchain
- Converts on-chain data to display format
- Auto-refreshes every 30 seconds
- Provides loading and error states

**Usage**:
```typescript
const {
  orderBook,        // Tick-aggregated order data
  recentTrades,     // Recent settlements
  lastPrice,        // Latest trade price
  volume24h,        // 24h volume estimate
  loading,          // Loading state
  error,            // Error message if any
  refreshOrderBook  // Manual refresh function
} = useOrderBookData(tokenPairId);
```

### 3. UI Components

**OrderBookDisplay** ([components/order-book-display.tsx](components/order-book-display.tsx))
- Displays buy/sell orders grouped by tick
- Shows real blockchain data when available
- Falls back to mock data for development/demo
- Indicates data source with "Live" or "Demo Data" badge

**RecentTrades** ([components/recent-trades.tsx](components/recent-trades.tsx))
- Shows recent settlement history
- Displays execution prices and timestamps
- Auto-updates with new on-chain settlements

## Smart Contract Data Structure

The order book smart contract stores data in several mappings:

### `tick_registry` Mapping

**Key Format**: `{token_pair_id}_{tick_id}`

**Value Structure**:
```leo
struct TickInfo {
    buy_order_count: u32,
    sell_order_count: u32,
    last_update_height: u32,
}
```

**Purpose**: Tracks the number of buy and sell orders at each tick level.

### `orders` Mapping

**Key**: Order ID (field)

**Value Structure**:
```leo
struct Order {
    owner: address,
    token_pair_id: u64,
    is_buy: bool,
    tick_lower: u64,
    tick_upper: u64,
    quantity: u64,        // May be encrypted
    status: u8,           // 0=active, 1=filled, 2=cancelled
    created_at: u64,
}
```

**Purpose**: Stores individual order details (private data is encrypted).

### `settlements` Mapping

**Key**: Settlement ID (field)

**Value Structure**:
```leo
struct Settlement {
    buy_order_id: field,
    sell_order_id: field,
    token_pair_id: u64,
    execution_price: u64,  // In basis points
    timestamp: u64,
    block_height: u32,
}
```

**Purpose**: Records completed trades with execution prices.

## Query Flow

### 1. Fetching Order Book Data

```typescript
// 1. Component renders
<OrderBookDisplay />

// 2. Hook initializes
useOrderBookData(tokenPairId)

// 3. Service fetches tick registry
aleoService.getTickRegistry(tokenPairId)
  → GET /program/private_orderbook_v1.aleo/mapping/tick_registry

// 4. Parse response and group by tick
{
  "1_1500": { buy_order_count: 5, sell_order_count: 0 },
  "1_1501": { buy_order_count: 3, sell_order_count: 2 },
  "1_1502": { buy_order_count: 0, sell_order_count: 7 },
}

// 5. Convert to display format
{
  tickId: 1500,
  tickRange: { min: 15.00, max: 15.01 },
  buyOrderCount: 5,
  sellOrderCount: 0,
  volume: 2500,  // Estimated
  orderCount: 5,
}

// 6. Component displays the data
```

### 2. Fetching Recent Trades

```typescript
// Service fetches settlements
aleoService.getRecentSettlements(tokenPairId, 20)
  → GET /program/private_orderbook_v1.aleo/mapping/settlements

// Convert execution prices to dollar amounts
executionPrice: 150000 (basis points)
  → price: $15.00

// Display in UI with timestamps
```

### 3. Fetching User Orders

```typescript
// When user connects wallet
const { publicKey } = useWallet();

// Fetch user's orders
const orders = await aleoService.getUserOrders(publicKey);

// Display in user dashboard
<UserOrders orders={orders} />
```

## Data Flow After Order Submission

```
User submits order
     ↓
Transaction sent to blockchain
     ↓
Transaction confirmed (2-5 minutes)
     ↓
Contract updates tick_registry mapping
     ↓
Frontend polls tick_registry (every 30s)
     ↓
New order count appears in order book
     ↓
UI updates automatically
```

## Privacy Considerations

**What's Public**:
- Number of orders at each tick
- Tick ranges (e.g., $15.00-$15.01)
- Settlement prices (after execution)
- Order counts

**What's Private** (encrypted on-chain):
- Exact limit prices within tick range
- Order quantities (until settlement)
- Order owner identities
- Specific order IDs

## API Rate Limits & Caching

The Aleo Explorer API has rate limits. The implementation includes:

1. **Auto-refresh interval**: 30 seconds (configurable)
2. **Manual refresh**: User can click refresh button
3. **Fallback to mock data**: If API is unavailable
4. **Error handling**: Graceful degradation

## Development vs Production

### Development Mode (No On-Chain Data)
- Shows "Demo Data" badge
- Uses mock data from `use-order-book.ts`
- Helpful for UI development and testing

### Production Mode (With On-Chain Data)
- Shows "Live" badge with green indicator
- Fetches real data from blockchain
- Updates every 30 seconds
- Falls back to demo if fetch fails

## Testing the Integration

### 1. Submit a Test Order

```typescript
// Use the OrderPlacementForm component
// Fill in: quantity, price, tick range
// Click "Place Buy Order" or "Place Sell Order"
```

### 2. Wait for Confirmation

```typescript
// Transaction typically takes 2-5 minutes
// Check transaction status:
await aleoService.getTransactionStatus(txId);
```

### 3. Verify Order Book Updates

```typescript
// After confirmation, tick_registry should update
// Refresh order book to see your order
// Check that order count increased at your tick
```

## Troubleshooting

### No data showing in order book

**Possible causes**:
1. No orders submitted yet → Shows demo data
2. API rate limit reached → Check console for errors
3. Network connectivity issues → Check error message

**Solutions**:
- Submit test orders to populate the order book
- Wait 30 seconds for auto-refresh
- Click manual refresh button
- Check browser console for API errors

### Orders not appearing after submission

**Possible causes**:
1. Transaction still pending
2. Transaction failed
3. Cache not refreshed

**Solutions**:
- Check transaction status in Explorer
- Wait for block confirmation (2-5 mins)
- Manually refresh order book
- Verify transaction ID is correct

## Future Enhancements

1. **WebSocket Integration**: Real-time updates instead of polling
2. **Order Depth Chart**: Visual representation of liquidity
3. **Historical Price Data**: Candlestick charts
4. **Order Book Snapshots**: Save and compare states
5. **Advanced Filtering**: Filter by price range, size, etc.

## API Reference

### Aleo Explorer API Endpoints

```
Base URL: https://api.explorer.aleo.org/v1/testnet

GET /program/{programId}/mapping/{mappingName}
  → Fetch program mapping data

GET /program/{programId}/transitions?limit={n}
  → Get recent program transitions

GET /transaction/{txId}
  → Get transaction details and status

GET /latest/height
  → Get latest block height
```

### Contract Program ID

```
private_orderbook_v1.aleo
```

### Mappings

- `tick_registry`: Order counts by tick
- `orders`: Individual order details
- `settlements`: Trade execution records

## Code Examples

### Basic Query

```typescript
import { aleoService } from '@/lib/aleo-service';

// Get tick registry for ALEO/USDC (pair ID 1)
const ticks = await aleoService.getTickRegistry(1);

// Get recent trades
const trades = await aleoService.getRecentSettlements(1, 10);

// Get user orders
const myOrders = await aleoService.getUserOrders(userAddress);
```

### In a Component

```typescript
import { useOrderBookData } from '@/hooks/use-order-book-data';

function MyOrderBook() {
  const { orderBook, loading, refreshOrderBook } = useOrderBookData(1);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {Object.values(orderBook).map(tick => (
        <div key={tick.tickId}>
          ${tick.tickRange.min} - ${tick.tickRange.max}: {tick.orderCount} orders
        </div>
      ))}
      <button onClick={refreshOrderBook}>Refresh</button>
    </div>
  );
}
```

## Summary

The order book query system provides a seamless way to display on-chain order data while maintaining privacy. It automatically fetches data from the Aleo blockchain, converts it to a user-friendly format, and gracefully handles errors with fallback mock data for development.
