# Pteaker - Quick Start Guide

Get up and running with Pteaker in 5 minutes.

## Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000 in your browser
```

## Features to Try

### 1. Connect Wallet (Testing Mode)
- Click **"Connect Wallet"** in the top right
- Uses mock Aleo account (doesn't require real funds)
- Address shown: `aleo1qqqq...5ev2m9`

### 2. View Order Book
- **Order Book Display** shows tick-aggregated liquidity
- Buy side: green/blue tints
- Sell side: red/destructive tints
- Each tick shows: range, order count, estimated depth
- Click **"Refresh"** to update data

### 3. Place an Order
- **Order Placement Form** on the right side
- Select **Buy** or **Sell**
- **Tick Range Width**: Slider controls privacy/precision tradeoff
  - Wider = more private, less precise
  - Narrower = less private, more precise
- **Limit Price**: Exact price (encrypted, only you see it)
- **Quantity**: Order size (encrypted, only you see it)
- Click **"Place Buy/Sell Order"** to submit

### 4. View Your Orders
- **My Active Orders** dashboard shows your submitted orders
- Status badges: Active, Partially-Filled, Filled, Cancelled
- Fill progress bar for each order
- Click **X** to cancel an order (if not fully filled)

### 5. Check Recent Trades
- **Recent Trades** shows public settlement events
- Displays: time, tick range, estimated price
- Buy/sell indicators
- No exact quantities shown (privacy preserved)

## Mock Data

The app comes with realistic sample data:

```
Order Book:
├─ 11 tick levels (±5 from $15.00)
├─ 1-8 orders per tick
├─ 500-5,500 ALEO volume per tick

Your Orders:
├─ 1x Active buy order (1000 ALEO @ $15.00)
├─ 1x Partially-filled sell (500/2500 filled)
└─ 1x Active buy (5000 ALEO @ $14.90)

Recent Trades:
└─ 5 settlement events with timestamps
```

## Understanding Privacy

### What's Hidden (Private)
- ✅ Your exact order price
- ✅ Your order quantity
- ✅ Your wallet address (in orders)
- ✅ Settlement prices to others

### What's Visible (Public)
- ❌ Price range where orders exist
- ❌ Count of orders in each range
- ❌ Aggregate volume settled
- ❌ Settlement timestamps

**Why?** 
- Fair price discovery at tick-level
- Prevents front-running
- Stops MEV extraction
- All verified with zero-knowledge proofs

## Key Concepts

### Ticks
Orders are grouped into **tick ranges** (price buckets).

Example: If you set tick range to $0.10:
```
Public: "Order exists in $14.95-$15.05"
Private: "Exact price: $15.002"
```

Others see only the range. Your exact price is encrypted.

### Settlement
When orders match:
1. System finds overlapping buy/sell tick ranges
2. Verifies limit prices cross (can't see actual prices)
3. Executes at **midpoint**: (buyPrice + sellPrice) / 2
4. Creates settlement records for both parties only
5. Recent trade shows tick range only

### Privacy Trade-off
```
Wide range ($1.00)      Narrow range ($0.01)
├─ More private          ├─ Less private
├─ Less precise orders   ├─ More precise orders
└─ Harder to DOS         └─ Easier to DOS
```

## Smart Contract (Leo Program)

The smart contract (`sl.aleo`) does:

1. **submit_tick_order**: Create encrypted order
2. **settle_match**: Match and settle two orders
3. **cancel_order**: Withdraw unfilled order

All encrypted with zero-knowledge proofs. No one can see order details except:
- Order owner (via viewing key)
- Matched counterparty (settlement only)

## Workflow Example

```
1. Alice: "I'll buy in range $14.95-$15.05, exact price $15.00, 1000 ALEO" 🔒
   Public: Order in $14.95-$15.05 range

2. Bob: "I'll sell in range $15.00-$15.10, exact price $15.05, 1000 ALEO" 🔒
   Public: Order in $15.00-$15.10 range

3. Matcher: "Ranges overlap, prices cross, match!"
   System: Verifies all constraints privately ✓

4. Settlement:
   - Execution price: ($15.00 + $15.05) / 2 = $15.025
   - Alice gets: 1000 ALEO, pays $15025 USDC
   - Bob gets: $15025 USDC, delivers 1000 ALEO
   - Public sees: Trade happened in $15.00-$15.05 range
   - Only Alice & Bob see exact settlement details

5. Public Recent Trades:
   ├─ Timestamp: 15:30:45
   ├─ Tick range: $14.95-$15.10
   └─ No one knows exact quantities or prices 🔒
```

## UI Navigation

### Header (Top)
- **Logo**: Pteaker identity
- **Market Info**: Last price ($15.02), 24h volume (125K)
- **Connect Wallet**: Blue button, shows address when connected

### Main Area (3 Columns on Desktop)
- **Left** (2 cols): Order book display
- **Right** (1 col): Order placement form

### Bottom Area (2 Columns)
- **Left**: Your active orders
- **Right**: Recent trades

### Mobile
- Single column layout
- All sections stack vertically
- Same functionality, responsive design

## Troubleshooting

### "Connect Wallet" doesn't work
- Click **"Connect Wallet"** button
- Simulated connection (no real wallet needed yet)
- Address stored in localStorage

### Orders not updating
- Click **"Refresh"** button on order book
- Page reload (`Ctrl+R`) resets state

### Can't place order
- Ensure wallet is connected
- Check form validation (non-zero quantity, valid price)
- Price must be within tick range

### Want to see real data?
- Currently uses mock data for testing
- For real Aleo network:
  - Deploy smart contract to Devnet
  - Update contract address in code
  - Requires real Aleo wallet
  - See `PTEAKER_GUIDE.md` for deployment

## Next Steps

### Learn More
- Read `PTEAKER_GUIDE.md` for complete documentation
- Check `contracts/sl.aleo.example` for smart contract code
- View `PROJECT_SUMMARY.md` for architecture overview

### Deploy to Production
1. Compile Leo program: `leo build`
2. Deploy to Aleo: `aleo deploy --network testnet3`
3. Update contract address in frontend
4. Connect real Aleo wallet
5. Add price feeds and fee system

### Extend Features
- Multiple trading pairs (ALEO/USDC, BTC/USDC, etc.)
- Stop-loss and take-profit orders
- Order history and analytics
- Advanced UI features (charts, depth, etc.)
- Mobile app

## Tips

1. **Wider tick ranges = More privacy** but less precise orders
2. **Private fields are encrypted on-chain** - no one can see them
3. **Settlements are final** - use low-amount test orders first
4. **View key grants access** to your order details
5. **All data is verifiable** with zero-knowledge proofs

## Support

- Aleo Docs: https://docs.aleo.org
- Discord: https://discord.gg/aleo
- GitHub: Report issues or ask questions

---

**Ready to trade privately?** Open http://localhost:3000 and click "Connect Wallet"!
