# Private Tick-Based Order Book on Aleo

## What it does

Our project is a **privacy-preserving decentralized exchange (DEX)** built on the Aleo blockchain that enables truly private trading through a tick-based order book mechanism. Unlike traditional DEXs where all order details are public, our system leverages Aleo's zero-knowledge proofs to keep sensitive trading information completely private while maintaining verifiable execution.

### Key Features:

**Privacy-First Trading:**
- Exact limit prices are encrypted using zero-knowledge proofs - only you know your true price
- Order quantities remain private until settlement
- Trader identities are protected throughout the process
- Only tick ranges (price bands) are publicly visible, preserving price discovery while protecting traders

**Tick-Based Matching:**
- Orders are grouped into price "ticks" (e.g., $15.00-$15.01 range)
- Public tick ranges enable efficient matching without revealing exact prices
- Off-chain matcher nodes scan for profitable overlaps
- Settlement executes at midpoint of crossing orders

**Token Pair Management:**
- Admin-controlled token pair registry
- Support for multiple trading pairs (ALEO/USDC, ALEO/USDT, etc.)
- Configurable tick sizes per pair
- Emergency pair activation/deactivation

**Escrow & Settlement:**
- Optional token escrow for production trading
- Testing mode available without real tokens
- Atomic settlement with automatic token transfers
- Partial fills supported for large orders

## The problem it solves

### 1. **Front-Running and MEV Extraction**
Traditional DEXs suffer from Maximum Extractable Value (MEV) attacks where:
- Bots scan the mempool for pending orders
- Large orders get front-run by sandwich attacks
- Traders lose money to MEV extractors

**Our Solution:** Zero-knowledge proofs hide exact prices and quantities, making front-running impossible. Attackers can't see what they're front-running.

### 2. **Privacy Concerns**
On public blockchains like Ethereum:
- All trading activity is visible
- Whales can't trade without everyone watching
- Trading strategies become public information
- Account balances are exposed

**Our Solution:** Aleo's privacy-by-default architecture encrypts sensitive data. Only participants in a trade see the full details.

### 3. **Capital Inefficiency**
Automated Market Makers (AMMs) like Uniswap require:
- Passive liquidity providers
- Significant capital locked in pools
- Impermanent loss for LPs
- Wide spreads for low-liquidity pairs

**Our Solution:** Order book model allows active price discovery with limit orders. Traders set their own prices and only lock tokens they're actively trading.

### 4. **Lack of Advanced Order Types**
Most DEXs only support simple swaps:
- No limit orders
- No partial fills
- No order cancellation
- No update capabilities

**Our Solution:** Full order book functionality with limit orders, updates, cancellations, and partial fills - all while maintaining privacy.

## Challenges I ran into

### 1. **Aleo's Async Model Limitations**
**Challenge:** Leo's async functions have strict limitations - you can't reassign variables from conditional scopes to outer scopes, making loops extremely difficult.

**Initial Approach:** Tried to update tick registry for all ticks in a range using a loop:
```leo
for i: u32 in 0u32..50u32 {
    if current_tick <= tick_upper {
        // Update tick
        current_tick = current_tick + 1u64; // ❌ Error!
    }
}
```

**Solution:** Simplified to update only the midpoint tick, with the matcher tracking actual ranges off-chain. This maintains functionality while working within Leo's constraints.

### 2. **Token Pair Validation Architecture**
**Challenge:** Initially designed the contract without token pair registry, allowing any arbitrary pair ID. This created security vulnerabilities.

**Problem Identified:** Users could create orders for non-existent pairs, use wrong token IDs, or create incompatible orders that would fail during settlement.

**Solution:** Implemented comprehensive token pair management:
- `TokenPair` struct with base/quote token IDs
- `token_pairs` mapping for on-chain storage
- Admin transitions for registration and management
- Validation in all order submission flows

### 3. **React 19 vs Wallet Adapter Compatibility**
**Challenge:** Aleo Wallet Adapter requires React 18, but we wanted to use Next.js 16 with React 19.

**Solution:** Used `--legacy-peer-deps` flag during installation. The wallet adapter works correctly despite the version mismatch, as the breaking changes in React 19 don't affect the adapter's functionality.

### 4. **Blockchain Data Querying**
**Challenge:** Fetching real-time order book data from Aleo blockchain requires:
- Understanding Leo mapping structures
- Converting on-chain data formats (basis points, field types)
- Handling API rate limits
- Gracefully degrading when blockchain is unavailable

**Solution:** Built a comprehensive data layer:
- `AleoService` class wrapping Aleo Explorer API
- `useOrderBookData` hook with automatic refresh
- Smart fallback to mock data for development
- Clear "Live" vs "Demo Data" indicators in UI

### 5. **Function Name Length Limits**
**Challenge:** Leo has a 31-byte limit on function names. Initial function name `finalize_submit_order_with_escrow` was 33 bytes.

**Error:**
```
Error [EPAR0370044]: Identifier finalize_submit_order_with_escrow is too long (33 bytes; maximum is 31)
```

**Solution:** Shortened to `finalize_submit_escrow` - maintains clarity while fitting within limits.

### 6. **TypeScript Type Inference Issues**
**Challenge:** React's `useState` with literal numbers creates const types, causing type mismatches:
```typescript
const [selectedPairId] = useState(1); // Type: 1 (literal)
setSelectedPairId(2); // ❌ Error: Type '2' not assignable to '1'
```

**Solution:** Explicit type annotation:
```typescript
const [selectedPairId, setSelectedPairId] = useState<number>(1); // ✅
```

## Technologies I used

### Blockchain & Smart Contracts
- **Leo Language** - Aleo's domain-specific language for zero-knowledge programs
- **Aleo Blockchain** - Layer 1 blockchain with native zero-knowledge proof support
- **ARC-21 Token Standard** - Aleo's token registry standard for interoperability

### Frontend
- **Next.js 16** (Turbopack) - React framework for production
- **React 19** - Latest React with improved performance
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality UI components

### Aleo Integration
- **Aleo Wallet Adapter** (@demox-labs):
  - `aleo-wallet-adapter-base` - Core wallet functionality
  - `aleo-wallet-adapter-react` - React hooks integration
  - `aleo-wallet-adapter-reactui` - Pre-built UI components
  - `aleo-wallet-adapter-leo` - Leo wallet support

### Development Tools
- **Leo CLI** - Contract compilation and deployment
- **Aleo Explorer API** - Blockchain data querying
- **lucide-react** - Icon library

### Backend (Matcher Service)
- **Node.js** with TypeScript
- **Aleo SDK** - Blockchain interaction
- **Winston** - Logging
- **Axios** - HTTP client

## How we built it

### Phase 1: Smart Contract Architecture (Leo)

**1. Core Data Structures:**
```leo
// Privacy-preserving order record
record TickOrder {
    owner: address,
    token_pair: u64,        // Public: which pair
    tick_lower: u64,        // Public: price range
    tick_upper: u64,        // Public: price range
    is_buy: bool,           // Private: order side
    quantity: u64,          // Private: amount
    limit_price: u64,       // Private: exact price
    token_id: field,        // Token escrowed
    escrowed_amount: u64,   // Amount locked
    filled: u64,            // Fill status
    timestamp: u32,
}

// Token pair configuration
struct TokenPair {
    pair_id: u64,
    base_token_id: field,
    quote_token_id: field,
    tick_size: u64,
    active: bool,
}
```

**2. Key Transitions:**
- `register_token_pair` - Admin registers trading pairs
- `submit_tick_order` - Create orders (testing mode)
- `submit_tick_order_with_escrow` - Create orders with real tokens
- `settle_match` - Execute trades between matched orders
- `update_order` / `cancel_order` - Order management

**3. On-Chain State:**
```leo
mapping token_pairs: u64 => TokenPair;
mapping tick_registry: field => TickInfo;
mapping order_fills: field => u64;
```

### Phase 2: Off-Chain Matcher Service (TypeScript)

**Architecture:**
```
┌─────────────────┐
│  Tick Registry  │ ← Fetch tick data
│   Monitor       │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Matching       │ ← Find profitable pairs
│   Engine        │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Settlement     │ ← Submit to chain
│   Executor      │
└─────────────────┘
```

**Key Components:**
- **Registry Monitor** - Polls blockchain for tick updates
- **Matching Engine** - Identifies overlapping orders
- **Settlement Executor** - Submits settlement transactions

### Phase 3: Frontend Development (Next.js + React)

**1. Wallet Integration:**
```typescript
// Wallet provider with Aleo adapter
<AleoWalletProvider
  wallets={[new LeoWalletAdapter()]}
  network={WalletAdapterNetwork.TestnetBeta}
  decryptPermission={DecryptPermission.NoDecrypt}
>
  {children}
</AleoWalletProvider>
```

**2. Order Submission Flow:**
```typescript
// Convert user input to contract format
const inputs = [
  `${tokenPairId}u64`,
  `${isBuy}`,
  `${tickLowerId}u64`,
  `${tickUpperId}u64`,
  `${timestamp}u32`,
  `${limitPriceBps}u64`,
  `${quantityRaw}u64`,
];

// Submit transaction
const transaction = Transaction.createTransaction(
  publicKey,
  WalletAdapterNetwork.TestnetBeta,
  'private_orderbook_v1.aleo',
  'submit_tick_order',
  inputs,
  DEFAULT_FEE
);

const txId = await requestTransaction(transaction);
```

**3. Data Fetching Layer:**
```typescript
// Service for blockchain queries
class AleoService {
  async getTickRegistry(pairId: number) {
    const mapping = await this.getMapping('tick_registry');
    // Parse and return tick data
  }

  async getRecentSettlements(pairId: number) {
    const settlements = await this.getMapping('settlements');
    // Return trade history
  }
}

// React hook for components
function useOrderBookData(pairId: number) {
  // Fetch tick data
  // Auto-refresh every 30s
  // Return formatted order book
}
```

**4. UI Components:**
- `OrderPlacementForm` - Submit orders with privacy controls
- `OrderBookDisplay` - Show tick-aggregated liquidity
- `RecentTrades` - Display settlement history
- `UserOrders` - Manage active orders
- `TokenPairSelector` - Choose trading pair

### Phase 4: Integration & Testing

**1. Smart Contract Testing:**
```bash
cd sl
leo build                                    # ✅ Compile
leo execute register_token_pair 1u64 ...    # ✅ Register pair
leo execute submit_tick_order 1u64 ...      # ✅ Submit order
```

**2. Frontend Testing:**
- Connected Leo wallet
- Submitted test orders
- Verified transaction IDs
- Monitored order book updates

**3. End-to-End Flow:**
```
User → Frontend → Wallet → Blockchain → Matcher → Settlement → Frontend
  ↓       ↓         ↓         ↓            ↓          ↓           ↓
Input   Convert   Sign    Execute      Find      Execute    Display
Order   Format    TX      Transition   Match     Trade      Result
```

## What we learned

### 1. **Zero-Knowledge Programming Paradigms**
Traditional smart contracts operate in the open - all data is public. ZK programming requires rethinking:
- What should be public (tick ranges, pair IDs)
- What should be private (exact prices, quantities)
- How to balance privacy with functionality

**Key Insight:** Public tick ranges provide enough information for matching while preserving price privacy.

### 2. **Leo's Strengths and Limitations**
**Strengths:**
- Clean, Rust-like syntax
- Strong type system catches errors early
- Built-in ZK proof generation
- Record-based privacy model is elegant

**Limitations:**
- Async function restrictions are challenging
- No dynamic loops in finalize functions
- Identifier length limits (31 bytes)
- Newer language with evolving ecosystem

### 3. **Privacy-Preserving Order Book Design**
Traditional order books reveal everything. We learned:
- Tick-based aggregation balances privacy and efficiency
- Midpoint pricing prevents information leakage
- Off-chain matching with on-chain settlement works well
- Privacy doesn't have to sacrifice functionality

### 4. **Blockchain Data Patterns**
Effective blockchain data management requires:
- Caching to reduce API calls
- Graceful degradation when chain unavailable
- Clear distinction between on-chain and off-chain data
- Auto-refresh with manual override

### 5. **Type Safety in Full-Stack Blockchain Apps**
TypeScript across frontend, matcher, and contract interfaces:
- Shared types prevent integration bugs
- Compile-time checks catch mismatches
- Better developer experience
- Easier refactoring

### 6. **User Experience in Privacy-First Apps**
Privacy adds complexity for users:
- Clear visual indicators (lock icons, badges)
- "Live" vs "Demo" data states
- Privacy education within UI
- Balance security with usability

## What's next for Private Order Book

### Short-Term (Next 3 Months)

**1. Production Deployment**
- Deploy updated contract with token pair registry
- Register initial trading pairs (ALEO/USDC, ALEO/USDT)
- Run matcher service continuously
- Monitor for issues and optimize

**2. Real Token Integration**
- Deploy ARC-21 compatible USDC token
- Deploy ARC-21 compatible USDT token
- Integrate token escrow in frontend
- Test end-to-end with real token transfers

**3. Enhanced Matching**
- Optimize matcher algorithm for gas efficiency
- Add batch settlement for multiple matches
- Implement matcher incentive mechanism
- Monitor tick ranges more granularly

**4. Admin Features**
- Fee collection mechanism
- Admin dashboard for pair management
- Emergency pause functionality
- Parameter adjustment tools

### Medium-Term (3-6 Months)

**1. Advanced Order Types**
- Stop-loss orders
- Take-profit orders
- Iceberg orders (large orders split into small chunks)
- Time-in-force options (FOK, IOC, GTD)

**2. Analytics & Insights**
- Historical price charts
- Volume analysis
- Liquidity depth visualization
- Trading statistics dashboard

**3. Mobile Support**
- Progressive Web App (PWA)
- Mobile-optimized interface
- Mobile wallet integration
- Push notifications for fills

**4. API for Traders**
- REST API for programmatic trading
- WebSocket for real-time updates
- SDK for bot developers
- Rate limiting and authentication

### Long-Term (6+ Months)

**1. Cross-Chain Integration**
- Bridge to other chains (Ethereum, BSC, Polygon)
- Cross-chain order book
- Unified liquidity
- Multi-chain settlement

**2. Derivatives Trading**
- Futures contracts
- Options trading
- Perpetual swaps
- Leveraged positions

**3. Decentralized Governance**
- Token launch for governance
- DAO for protocol decisions
- Community-driven pair listings
- Fee structure voting

**4. Institutional Features**
- OTC desk for large trades
- Custody integrations
- Compliance tools
- Institutional-grade API

**5. Layer 2 Scaling**
- Optimistic rollup for order updates
- Zero-knowledge rollup for settlement
- State channels for high-frequency trading
- Hybrid on-chain/off-chain architecture

### Research Areas

**1. Privacy Enhancements**
- Ring signatures for further anonymity
- Stealth addresses for recipients
- Zero-knowledge proof batching
- Privacy-preserving oracles for price feeds

**2. MEV Protection**
- Threshold encryption for order submission
- Commit-reveal schemes
- Fair sequencing services
- MEV redistribution to users

**3. Liquidity Mining**
- Privacy-preserving liquidity rewards
- Market maker incentives
- Volume-based rewards
- Staking mechanisms

**4. Interoperability**
- Cross-protocol liquidity aggregation
- Universal order book standard
- Shared liquidity pools
- Protocol-to-protocol bridges

### Community & Ecosystem

**1. Developer Tools**
- Order book SDK
- Testing framework
- Documentation site
- Tutorial series

**2. Community Building**
- Discord server
- Trading competitions
- Bug bounty program
- Ambassador program

**3. Partnerships**
- Wallet integrations (Leo Wallet, Puzzle Wallet)
- DeFi protocol integrations
- Market makers onboarding
- Exchange listings

---

## Impact & Vision

Our private order book represents the **future of decentralized trading** - combining the efficiency of traditional order books with the privacy and security of zero-knowledge proofs. By solving front-running, protecting trader privacy, and enabling advanced order types, we're building infrastructure for the next generation of DeFi.

**The vision:** A world where traders can execute sophisticated strategies without surveillance, whales can trade without moving markets, and everyone benefits from true price discovery - all while maintaining complete privacy and decentralization.

**Join us in building the private financial future.** 🚀
