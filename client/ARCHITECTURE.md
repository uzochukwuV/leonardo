# Pteaker Architecture

Visual guide to how Pteaker's components interact.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Header     │  │ Order Book   │  │ Order Form   │          │
│  │ (Wallet UI)  │  │ Display      │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐│
│  │     User Orders Dashboard    │  │    Recent Trades         ││
│  │  (Your private orders)       │  │  (Public settlements)    ││
│  └──────────────────────────────┘  └──────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Uses
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     REACT HOOKS LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  useAleo()                      useOrderBook()                 │
│  ├─ account (address)           ├─ orderBook (ticks)          │
│  ├─ connected (bool)            ├─ recentTrades              │
│  ├─ connectWallet()             ├─ refreshOrderBook()        │
│  ├─ executeTransaction()        ├─ addTrade()               │
│  └─ disconnectWallet()          └─ updateTickOrderCount()   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LIBRARY / UTILITY LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AleoContract              TransactionUtils    LocalStorage   │
│  ├─ submitTickOrder()      ├─ encodeValue()    ├─ Account   │
│  ├─ settleMatch()          ├─ createPayload()  ├─ Orders   │
│  ├─ cancelOrder()          ├─ monitorTx()      └─ History  │
│  └─ validateTickOrder()    └─ estimateFee()                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Submits
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ALEO BLOCKCHAIN NETWORK                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Leo Smart Contract (sl.aleo)                  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  submit_tick_order()                                   │   │
│  │  ├─ Public: token_pair, side, tick_lower, tick_upper  │   │
│  │  └─ Private: limit_price, quantity (encrypted)        │   │
│  │     └─ Creates: TickOrder record                       │   │
│  │                                                         │   │
│  │  settle_match()                                         │   │
│  │  ├─ Inputs: Two TickOrder records (encrypted)          │   │
│  │  ├─ Verifies: Tick overlap, price cross (ZK proof)    │   │
│  │  └─ Outputs: Updated orders + Settlement records      │   │
│  │                                                         │   │
│  │  cancel_order()                                         │   │
│  │  └─ Cancels unfilled orders                            │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  State Mappings:                                                │
│  ├─ tick_registry: tick_id => TickInfo                         │
│  ├─ order_fills: order_id => filled_amount                    │
│  └─ tick_volumes: tick_id => total_volume                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Order Placement Flow

```
User Interface
    │
    ├─→ selectSide(buy/sell)
    ├─→ setTickRange($0.10)
    ├─→ setLimitPrice($15.00)
    ├─→ setQuantity(1000)
    │
    ▼
OrderPlacementForm Component
    │
    ├─→ validateInputs()
    │   ├─ Check quantity > 0
    │   ├─ Check price in range
    │   └─ Check wallet connected
    │
    ├─→ useAleo.executeTransaction()
    │   └─ Calls: submit_tick_order
    │
    ▼
AleoContract.submitTickOrder()
    │
    ├─→ validateTickOrder()
    │   ├─ range_width ≤ 50
    │   ├─ price in [min, max]
    │   └─ quantity > 0
    │
    ├─→ createTickOrder record
    │
    ▼
Aleo Blockchain (Leo Program)
    │
    ├─→ Generate TickOrder record
    │   ├─ owner: your_address
    │   ├─ token_pair: 1 (ALEO/USDC)
    │   ├─ tick_lower: 1490 (public)
    │   ├─ tick_upper: 1510 (public)
    │   ├─ is_buy: true (private)
    │   ├─ quantity: 1000 (private)
    │   ├─ limit_price: 1500 (private)
    │   ├─ filled: 0
    │   └─ timestamp: block_height
    │
    ├─→ Update tick_registry
    │   └─ order_count++ for tick
    │
    ▼
Frontend Updates
    │
    ├─→ useOrderBook.updateTickOrderCount()
    ├─→ Increment tick 1500's order count
    ├─→ Update UI
    │
    ▼
User Sees
    │
    ├─ "Order placed successfully"
    ├─ Tick range shows +1 orders
    ├─ Order appears in "My Active Orders"
    └─ All private data encrypted ✓
```

### Order Matching & Settlement Flow

```
Matcher System (Off-chain)
    │
    ├─→ scanOrderBook()
    │   ├─ Find buy orders with is_buy=true
    │   ├─ Find sell orders with is_buy=false
    │   └─ Check tick ranges overlap
    │
    ▼
Compatible Orders Found
    │
    Buy Order                    Sell Order
    ├─ tick: 1490-1510          ├─ tick: 1500-1520
    ├─ limit: $15.00 (private)  ├─ limit: $15.05 (private)
    ├─ qty: 1000 (private)      ├─ qty: 2000 (private)
    └─ owner: Alice             └─ owner: Bob
    │
    ▼ Both have overlapping ranges & prices cross
    │
Matcher Submits settle_match()
    │
    ▼
Aleo Smart Contract Verification
    │
    ├─→ Verify same token_pair ✓
    ├─→ Verify is_buy: true & is_buy: false ✓
    ├─→ Verify tick overlap ✓
    │   └─ overlap: 1500-1510
    ├─→ Verify prices cross ✓
    │   └─ $15.00 >= $15.05? 
    │       Wait, NO! Prices don't cross!
    │       Transaction fails ✗
    │
    (Different example with valid match)
    │
    ├─→ Verify is_buy: true & is_buy: false ✓
    ├─→ Verify tick overlap: 1500-1510 ✓
    ├─→ Verify prices cross ✓
    │   └─ Buy $15.05 >= Sell $15.00? YES! ✓
    ├─→ Calculate execution price
    │   └─ midpoint = ($15.05 + $15.00) / 2 = $15.025
    ├─→ Calculate fill amount
    │   └─ min(1000, 2000) = 1000
    │
    ▼
Create Settlement
    │
    ├─→ Alice gets:
    │   ├─ 1000 ALEO (paid by Bob)
    │   └─ Settlement record (only Alice & Bob see price)
    │
    ├─→ Bob gets:
    │   ├─ $15,025 USDC (from Alice)
    │   └─ Settlement record (only Alice & Bob see price)
    │
    ├─→ Update order records:
    │   ├─ Alice's order: filled = 1000 (now complete)
    │   └─ Bob's order: filled = 1000 (out of 2000, still active)
    │
    ▼
Public Visibility
    │
    ├─ Recent trade shows:
    │   ├─ Timestamp ✓
    │   ├─ Tick range: 1500-1510 ✓
    │   ├─ Estimated price: ~$15.025 ✓
    │   ├─ Exact quantity: ✗ (hidden)
    │   ├─ Trader identities: ✗ (hidden)
    │   └─ Exact prices: ✗ (hidden)
    │
    └─ All constraints verified with ZK proofs ✓
```

## Privacy Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    DATA VISIBILITY LAYERS                    │
└──────────────────────────────────────────────────────────────┘

User submits order:
┌─────────────────────────────────────────────────────────────┐
│ PUBLIC (visible in transaction)                             │
├─────────────────────────────────────────────────────────────┤
│ - token_pair: 1 (ALEO/USDC)                                 │
│ - is_buy: true                                              │
│ - tick_lower: 1490                                          │
│ - tick_upper: 1510                                          │
│ - timestamp: 12345678                                       │
│                                                              │
│ => "Someone placed order in range $14.90-$15.10"           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PRIVATE (encrypted with ZK)                                 │
├─────────────────────────────────────────────────────────────┤
│ - limit_price: 1500 (encrypted)                             │
│ - quantity: 1000 (encrypted)                                │
│                                                              │
│ => Verifiable without revealing values                      │
└─────────────────────────────────────────────────────────────┘

Order Book Aggregation:
┌─────────────────────────────────────────────────────────────┐
│ PUBLIC (everyone sees)                                      │
├─────────────────────────────────────────────────────────────┤
│ Tick: 1490-1510                                             │
│ ├─ Order count: 5                                           │
│ ├─ Total volume settled: 50,000 ALEO                        │
│ └─ Liquidity depth: [████░░░░░░]                            │
│                                                              │
│ => Fair price discovery at tick-level                       │
└─────────────────────────────────────────────────────────────┘

Settlement Event:
┌─────────────────────────────────────────────────────────────┐
│ PUBLIC (everyone sees)                                      │
├─────────────────────────────────────────────────────────────┤
│ - timestamp: 12345900                                       │
│ - tick_range: 1490-1510                                     │
│ - side: buy/sell                                            │
│ => "Trade settled in this range"                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PRIVATE TO SETTLEMENT PARTIES                               │
├─────────────────────────────────────────────────────────────┤
│ - exact quantity: 1000                                      │
│ - exact price: $15.025                                      │
│ - counterparty address                                      │
│                                                              │
│ => Viewable only by Alice & Bob (via viewing key)          │
└─────────────────────────────────────────────────────────────┘
```

## Component Tree

```
App (page.tsx)
├── Header
│   ├── Logo + Title
│   ├── Market Info
│   │   ├─ Last Price
│   │   └─ 24h Volume
│   └── Wallet Button (useAleo)
│       ├─ Connect Wallet
│       └─ Account Menu (when connected)
│
├── Main Content
│   ├── Hero Section
│   ├── Feature Cards
│   │
│   ├── Trading Area (3-col grid)
│   │   ├── OrderBookDisplay (2 cols)
│   │   │   ├── Buy Side (Reversed ticks)
│   │   │   ├── Spread Indicator
│   │   │   ├── Sell Side (Ticks)
│   │   │   └── Privacy Notice
│   │   │
│   │   └── OrderPlacementForm (1 col)
│   │       ├── Side Selection
│   │       ├── Tick Range Slider
│   │       ├── Limit Price Input
│   │       ├── Quantity Input
│   │       ├── Form Validation
│   │       └── Submit Button
│   │
│   ├── Bottom Area (2-col grid)
│   │   ├── UserOrders
│   │   │   ├── Summary Stats
│   │   │   ├── OrderRow (repeating)
│   │   │   │   ├─ Order Info
│   │   │   │   ├─ Status Badge
│   │   │   │   ├─ Fill Progress
│   │   │   │   └─ Cancel Button
│   │   │   └── Privacy Notice
│   │   │
│   │   └── RecentTrades
│   │       ├── TradeRow (repeating)
│   │       │   ├─ Timestamp
│   │       │   ├─ Tick Range
│   │       │   ├─ Estimated Price
│   │       │   └─ Side Indicator
│   │       └── Settlement Info
│   │
│   └── Footer Section
│       ├── How Pteaker Works
│       ├── Privacy Benefits
│       └── Dev Info
│
└── Footer
    ├── Aleo Link
    └── Navigation Links

State Management:
├── useAleo()
│   ├─ account (localStorage)
│   ├─ connected
│   ├─ loading
│   └─ error
│
└── useOrderBook()
    ├─ orderBook (mock data)
    ├─ recentTrades (mock data)
    ├─ loading
    └─ market metrics
```

## Smart Contract State

```
TickOrder Record (Private)
┌─────────────────────────────────┐
│ owner: address                  │ ← Private (stored in record)
│ token_pair: u64                 │ ← Public
│ tick_lower: u64                 │ ← Public
│ tick_upper: u64                 │ ← Public
│ is_buy: bool                    │ ← Private
│ quantity: u64                   │ ← Private
│ limit_price: u64                │ ← Private
│ filled: u64                     │ ← Private
│ timestamp: u32                  │ ← Public
└─────────────────────────────────┘

TickInfo Struct (Public State)
┌─────────────────────────────────┐
│ token_pair: u64                 │
│ tick_id: u64                    │
│ order_count: u32                │ ← Updates on new order
│ total_volume_settled: u64       │ ← Updates on settlement
│ last_updated: u32               │
└─────────────────────────────────┘

Settlement Record (Private)
┌─────────────────────────────────┐
│ owner: address                  │ ← Recipient (private)
│ token_pair: u64                 │
│ quantity: u64                   │ ← Settlement size
│ price: u64                      │ ← Execution price
│ is_buy: bool                    │
│ timestamp: u32                  │
└─────────────────────────────────┘
```

---

For more details, see `PTEAKER_GUIDE.md` and `PROJECT_SUMMARY.md`
