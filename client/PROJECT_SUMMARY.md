# Pteaker - Project Summary

A privacy-preserving tick-based order book built on the Aleo blockchain. This project demonstrates how zero-knowledge proofs enable fair price discovery while protecting order details through encryption.

## What You're Building

**Pteaker** = **P**rivate + **T**icker order book

An order book where traders submit orders with **public tick ranges** but **private exact prices and quantities**. The Aleo network matches orders privately and settles them at transparent, fair prices while keeping individual order details encrypted.

## Project Structure

```
├── app/
│   ├── page.tsx              # Main trading interface
│   ├── layout.tsx            # App layout with metadata
│   └── globals.css           # Aleo-inspired design theme
├── components/
│   ├── header.tsx            # Wallet connection + market info
│   ├── order-book-display.tsx # Public tick-aggregated view
│   ├── order-placement-form.tsx # Order submission UI
│   ├── user-orders.tsx       # Your active orders dashboard
│   ├── recent-trades.tsx     # Settlement events display
│   └── ui/                   # shadcn/ui components
├── hooks/
│   ├── use-aleo.ts           # Wallet + transaction hook
│   └── use-order-book.ts     # Order book state management
├── lib/
│   ├── aleo-contract.ts      # Smart contract interface
│   ├── transaction-utils.ts  # Transaction encoding helpers
│   └── utils.ts              # Utility functions
├── contracts/
│   └── sl.aleo.example       # Leo smart contract reference
├── PTEAKER_GUIDE.md          # Full technical documentation
└── PROJECT_SUMMARY.md        # This file
```

## Key Features Implemented

### 1. Wallet Integration (`hooks/use-aleo.ts`)
- Connect/disconnect Aleo wallet
- Store account (address, view key) in localStorage
- Execute smart contract transitions
- Handle transaction loading states

### 2. Order Book Display (`components/order-book-display.tsx`)
- Show tick-aggregated liquidity in real-time
- Buy and sell side separation
- Order count and volume depth indicators
- Spread visualization
- Privacy notice explaining encrypted data

### 3. Order Placement Form (`components/order-placement-form.tsx`)
- Side selection (Buy/Sell)
- Public tick range slider (0.01 to 0.50 width)
- Private limit price input
- Private quantity input
- Estimated value calculation
- Form validation and error handling
- Privacy explanation

### 4. User Orders Dashboard (`components/user-orders.tsx`)
- View active orders (only when connected)
- Fill percentage progress bars
- Cancel order button
- Order status badges (active, partially-filled, filled, cancelled)
- Summary stats (count, value, filled amount)

### 5. Recent Trades Display (`components/recent-trades.tsx`)
- Public settlement events
- Estimated prices and tick ranges
- Trade timestamps
- Buy/sell side indication

### 6. Smart Contract Utilities (`lib/aleo-contract.ts`)
- Type-safe contract interface
- Input validation mirroring Leo constraints
- Helper functions for tick calculations
- Encrypted order decryption (requires view key)

## Design System

### Colors (Aleo-Inspired)
- **Primary (Cyan/Teal)**: `oklch(0.62 0.22 190)` - Main accent
- **Accent (Purple)**: `oklch(0.58 0.25 270)` - Secondary accent
- **Background (Dark)**: `oklch(0.11 0 0)` - Deep tech aesthetic
- **Foreground (Light)**: `oklch(0.95 0 0)` - High contrast text
- **Cards**: `oklch(0.15 0 0)` - Elevated surfaces

### Typography
- **Headings**: Geist (default sans-serif)
- **Body**: Geist (default sans-serif)
- **Monospace**: Geist Mono (numbers, prices)

### Layout
- Mobile-first responsive design
- Flexbox for primary layouts
- Grid for multi-column sections
- Max-width container (7xl) for desktop

## How Privacy Works

### Public Data (Visible to All)
```
Order Submitted:
├─ Token pair: ALEO/USDC
├─ Side: Buy/Sell
├─ Tick range: $14.95 - $15.05
└─ Order exists in this range ✓

Order Book:
├─ 3 orders in $14.95-$15.05 range
├─ 2500 ALEO settled volume
└─ Aggregate depth visualization

Settlement:
├─ Timestamp: 2024-01-20 15:30:45
├─ Tick range: $14.95-$15.05
└─ Estimated price: $15.00
```

### Private Data (Encrypted)
```
Your Order (Only You See):
├─ Exact limit price: $15.002
├─ Quantity: 1000 ALEO
├─ Your identity
├─ Exact fill amount
└─ Exact settlement price (to counterparty only)
```

## Smart Contract Logic (Leo Program)

### Key Transitions

**`submit_tick_order`**
- Input: public (token_pair, side, tick_lower, tick_upper) + private (limit_price, quantity)
- Validates: tick range width ≤ 50, price in range, quantity > 0
- Output: TickOrder record (owner private, tick data public)

**`settle_match`**
- Input: two encrypted TickOrder records + timestamp
- Validates: same pair, tick overlap, prices cross, within ranges, unfilled
- Output: updated orders + settlement records for both parties
- Price: (buyLimit + sellLimit) / 2 (midpoint)

**`cancel_order`**
- Input: private order record
- Validates: caller is owner, not fully filled
- Output: boolean success

## Integration with Aleo Network

### Development (Current)
Uses mock data and simulated transactions for UI testing without network access.

### Production (Next Steps)

1. **Compile Leo Program**
   ```bash
   leo build
   ```

2. **Deploy to Aleo**
   ```bash
   aleo deploy --network testnet3
   ```

3. **Update Frontend**
   - Replace mock contract address in `lib/aleo-contract.ts`
   - Update `hooks/use-aleo.ts` to use real Aleo SDK
   - Connect to actual Aleo node/API endpoint

4. **Use Real Wallet**
   - Implement actual Aleo wallet connection
   - Use viewing keys for private order retrieval
   - Handle signature verification

## Mock Data Included

The app works without Aleo network access using:
- **11 tick levels** in order book (±5 from $15.00)
- **3 user orders** (active, partially-filled, cancelled)
- **5 recent trades** with realistic timestamps
- **Simulated wallet** (press "Connect Wallet")
- **All UI is fully interactive**

Perfect for testing UX and workflows before mainnet deployment.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + custom design tokens
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **Blockchain**: Aleo (Leo smart contracts)
- **State**: React hooks + localStorage

## File-by-File Guide

### Frontend Entry
- **`app/page.tsx`**: Main UI - ties all components together
- **`app/layout.tsx`**: Metadata, fonts, theme setup
- **`app/globals.css`**: Design tokens and Tailwind config

### Components
- **`header.tsx`**: Navigation + wallet button
- **`order-book-display.tsx`**: 300 lines - central trading view
- **`order-placement-form.tsx`**: 300 lines - order creation
- **`user-orders.tsx`**: 250 lines - order management
- **`recent-trades.tsx`**: 100 lines - trade history

### Hooks (State Management)
- **`use-aleo.ts`**: 90 lines - wallet connection logic
- **`use-order-book.ts`**: 130 lines - order book state

### Libraries
- **`aleo-contract.ts`**: 240 lines - contract interface
- **`transaction-utils.ts`**: 300 lines - transaction helpers

### Documentation
- **`PTEAKER_GUIDE.md`**: Complete technical guide
- **`contracts/sl.aleo.example`**: Full Leo program with comments
- **`PROJECT_SUMMARY.md`**: This overview

## Next Steps for Production

1. **Smart Contract Deployment**
   - Deploy `sl.aleo` to Aleo Devnet
   - Test all transitions with real transactions
   - Audit for security

2. **Wallet Integration**
   - Connect to Aleo extension wallet
   - Implement viewing key management
   - Add transaction signing

3. **Price Feeds**
   - Add oracle integration for tick size adjustment
   - Implement dynamic fee structure
   - Add slippage protection

4. **Scalability**
   - Off-chain order matching engine
   - WebSocket for real-time updates
   - Database for order history

5. **Compliance**
   - KYC/AML integration
   - Regulatory reporting
   - Audit trail

6. **Multiple Markets**
   - Support multiple trading pairs
   - Cross-market price feeds
   - Portfolio tracking

## Security Considerations

- **Order Privacy**: All sensitive data encrypted at protocol level
- **Front-Running Prevention**: Exact orders unknown until settlement
- **Price Slippage**: Midpoint execution prevents price manipulation
- **Double-Spend**: Fill amounts tracked to prevent duplicate settlement
- **Ownership Verification**: Viewing keys prove order ownership

## Support & Resources

- **Aleo Docs**: https://docs.aleo.org
- **Leo Language**: https://developer.aleo.org
- **zk-Auction Example**: https://github.com/ProvableHQ/zk-auction-example
- **Discord**: https://discord.gg/aleo

## License

MIT

---

**Built with ❤️ for privacy on Aleo**
