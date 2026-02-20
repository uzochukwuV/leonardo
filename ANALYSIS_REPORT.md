# Aleo Private Tick-Based Order Book: Smart Contract Analysis & Frontend Integration Research

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Smart Contract Analysis](#2-smart-contract-analysis)
3. [Identified Issues & Gaps](#3-identified-issues--gaps)
4. [Frontend Integration Research](#4-frontend-integration-research)
5. [Current Frontend State & Gaps](#5-current-frontend-state--gaps)
6. [Recommendations for Frontend Completion](#6-recommendations-for-frontend-completion)
7. [Architecture Recommendations](#7-architecture-recommendations)

---

## 1. Executive Summary

**Verdict: The smart contract is a solid foundation for a private tick-based order book, but has several areas that need attention before production use.**

### Strengths
- Well-designed privacy model using Aleo's record system
- Tick-range abstraction effectively hides exact prices while enabling matching
- ARC-21 token registry integration for real token escrow
- Midpoint execution pricing is fair and standard
- Partial fill support is implemented
- Token pair validation has been added (recent fix)

### Key Concerns
- No access control on admin functions (anyone can register/deactivate pairs)
- Missing on-chain double-fill prevention in `settle_match`
- The `settle_match_with_transfer` function has a token accounting issue
- Tick key hash collision risk in `get_tick_key`
- No fee collection mechanism despite defined fee constants
- Frontend is largely simulation/mock-based and needs real SDK integration

---

## 2. Smart Contract Analysis

### 2.1 Privacy Model Assessment

**Rating: Strong**

The contract leverages Aleo's privacy primitives effectively:

| Data | Visibility | Implementation |
|------|-----------|----------------|
| Order existence | Public (via tick registry) | Tick ranges are public |
| Exact price | Private (record field) | `limit_price` is a private record field |
| Quantity | Private (record field) | `quantity` is a private record field |
| Owner identity | Private (record field) | `owner` is inherently private in records |
| Fill status | Private (record field) | `filled` tracked in record |
| Tick ranges | Public (transition params) | `tick_lower`/`tick_upper` are public |

The tick-range design is the core privacy innovation: traders reveal a *range* of acceptable prices (e.g., $14.90-$15.10) while their exact limit price (e.g., $15.03) remains encrypted. This provides:
- **Sufficient information for matching**: Overlapping tick ranges indicate potential matches
- **Price privacy**: Exact willingness-to-pay is hidden
- **Configurable privacy**: Wider tick ranges = more privacy, narrower = more precise

**Concern**: The `tick_lower` and `tick_upper` are public transition parameters, so an observer can see the range for every order submission. Combined with volume analysis on the tick registry, this could leak information about price concentrations.

### 2.2 Order Lifecycle

```
register_token_pair -> submit_tick_order[_with_escrow] -> settle_match[_with_transfer] -> cancel_order[_with_refund]
                                                    \-> update_order
```

The lifecycle is complete and covers:
- Order creation (with/without escrow)
- Order modification (price, quantity)
- Settlement (with/without token transfer)
- Cancellation (with/without refund)

### 2.3 Matching Mechanism

The contract uses **midpoint pricing**: `exec_price = (buy_limit + sell_limit) / 2`

This is a well-established fair pricing mechanism used in dark pools and institutional trading. It splits the surplus between buyer and seller equally.

**Important**: Matching is done off-chain by the matcher service. The contract only *validates* and *settles* matches. This is the correct architecture for Aleo because:
- On-chain computation is expensive (proof generation)
- The matcher can efficiently scan the tick registry
- Settlement atomically validates all constraints via ZK proof

### 2.4 Token Integration

The contract integrates with `token_registry.aleo` (ARC-21 standard):
- **Escrow**: Tokens are locked in the order record on submission
- **Settlement**: Tokens are transferred atomically between parties
- **Refund**: Escrowed tokens are returned on cancellation (prorated for partial fills)

### 2.5 Constants & Parameters

| Constant | Value | Meaning |
|----------|-------|---------|
| `TICK_SIZE` | 100 | Price increment of 0.01 (1 cent) |
| `MAX_TICK_RANGE` | 50 | Max $0.50 range per order |
| `MATCHER_FEE_BPS` | 5 | 0.05% matcher fee |
| `TRADING_FEE_BPS` | 10 | 0.10% trading fee |

---

## 3. Identified Issues & Gaps

### 3.1 Critical Issues

#### Issue 1: No Access Control on Admin Functions

**File**: `sl/src/main.leo:154-231`

```leo
async transition register_token_pair(
    public pair_id: u64,
    public base_token_id: field,
    public quote_token_id: field,
    public tick_size: u64
) -> Future {
    // No caller check - ANYONE can register pairs
    assert(pair_id > 0u64);
    ...
```

**Risk**: Any address can call `register_token_pair`, `deactivate_token_pair`, or `reactivate_token_pair`. A malicious actor could:
- Register fake token pairs
- Deactivate legitimate trading pairs, halting trading
- Reactivate deactivated pairs

**Fix**: Add an admin address constant and check `self.caller == ADMIN_ADDRESS`.

#### Issue 2: No On-Chain Double-Fill Prevention in `settle_match`

**File**: `sl/src/main.leo:440-531`

The `settle_match` transition takes order records as inputs (consuming them) and returns updated records. However, the `order_fills` mapping defined at line 97 is **never written to or read from** in any transition.

**Risk**: While Aleo's record model inherently prevents double-spending of records (a consumed record cannot be used again), the `order_fills` mapping was presumably intended as an additional safeguard. Its non-use means:
- No public auditability of fill status
- No way to query fill progress from the frontend without decrypting records

#### Issue 3: Token Accounting in `settle_match_with_transfer`

**File**: `sl/src/main.leo:535-640`

The function takes `base_token` and `quote_token` as inputs but creates new token records without properly consuming the input tokens' full amounts. The change (remaining balance) is not returned to the original owners:

```leo
// Creates buyer_receives with base_amount, but what happens to
// base_token.amount - base_amount? It's consumed but the change is lost.
let buyer_receives: Token = Token {
    owner: buy_order.owner,
    amount: base_amount,
    ...
};
```

**Risk**: Token loss. The surplus from input tokens (if `base_token.amount > base_amount`) is effectively burned.

**Fix**: Return change tokens to the respective owners.

### 3.2 Moderate Issues

#### Issue 4: Tick Key Hash Collision Risk

**File**: `sl/src/main.leo:120-122`

```leo
inline get_tick_key(token_pair: u64, tick_id: u64) -> field {
    return BHP256::hash_to_field(token_pair + (tick_id * 1000000u64));
}
```

If `token_pair = 1000001` and `tick_id = 0`, the input is `1000001`.
If `token_pair = 1` and `tick_id = 1`, the input is also `1000001`.

**Risk**: Different (token_pair, tick_id) combinations produce the same hash input.

**Fix**: Use a struct or tuple hashing approach, e.g., `BHP256::hash_to_field(TokenPairTick { pair: token_pair, tick: tick_id })`.

#### Issue 5: Fee Constants Defined but Never Used

**File**: `sl/src/main.leo:17-20`

`MATCHER_FEE_BPS` and `TRADING_FEE_BPS` are defined but never deducted during settlement. The matcher service documentation describes fee economics, but no fees are actually collected on-chain.

**Impact**: Matchers have no economic incentive from the contract itself. The spread between buy/sell prices is the only profit mechanism.

#### Issue 6: `cancel_order` Does Not Update Tick Registry

**File**: `sl/src/main.leo:643-651`

The `cancel_order` transition is a pure transition (no finalize) that doesn't decrement the tick registry's `order_count`. Over time, the public tick registry will show inflated order counts.

#### Issue 7: `update_order` Does Not Recalculate Escrow

**File**: `sl/src/main.leo:391-437`

When updating an order, the `escrowed_amount` is preserved from the old order even if quantity or price changes. If the new order requires more escrow, it's underfunded; if less, funds are locked unnecessarily.

### 3.3 Minor Issues

- **No `@noupgrade` on transitions**: Only the constructor is marked `@noupgrade`. With ARC-6 (program upgradability, since Aleo Stack v4.3.0), consider marking critical transitions.
- **Timestamp is a parameter, not block height**: `timestamp` is passed as a public parameter rather than using `block.height`, making it spoofable.
- **No event emission**: Aleo doesn't have events like Ethereum, but the public finalize functions could log more data to mappings for frontend consumption.

---

## 4. Frontend Integration Research

### 4.1 Current Aleo SDK Ecosystem

| Package | Status | Version | Notes |
|---------|--------|---------|-------|
| `@provablehq/sdk` | **Active** | v0.9.15 | The canonical SDK. Replaces deprecated `@aleohq/sdk`. |
| `@provablehq/wasm` | **Active** | Latest | WASM bindings for in-browser proof generation |
| `@demox-labs/aleo-wallet-adapter-base` | Stable | 0.0.22 | Core wallet adapter infrastructure |
| `@demox-labs/aleo-wallet-adapter-react` | Stable | 0.0.21 | React hooks (`useWallet`) |
| `@demox-labs/aleo-wallet-adapter-reactui` | Stable | 0.0.36 | Modal UI components |
| `@demox-labs/aleo-wallet-adapter-leo` | Stable | 0.0.25 | Leo Wallet specific adapter |
| `aleo-adapters` | Community | Latest | Multi-wallet support (Leo, Fox, Puzzle, Soter) |
| `create-leo-app` | Active | 0.9.8 | Project scaffolding tool |

**Key Migration**: `@aleohq/sdk` is **deprecated**. All new code should use `@provablehq/sdk`.

### 4.2 Supported Wallets

| Wallet | Type | Users | Key Feature |
|--------|------|-------|-------------|
| **Leo Wallet** | Extension + Mobile | 200K+ | Most established, by Demox Labs |
| **Puzzle Wallet** | Extension + Mobile | 150K+ | Account abstraction, WalletConnect V2 |
| **Fox Wallet** | Extension + Mobile | - | Multi-chain (Aleo + EVM) |
| **Soter Wallet** | Extension | - | Basic Aleo support |
| **Avail Wallet** | Native App | - | Local (non-WASM) proving, 3x faster. In development. |

### 4.3 Key API Endpoints

| Endpoint | URL |
|----------|-----|
| Mainnet API | `https://api.explorer.provable.com/v1/mainnet` |
| Testnet API | `https://api.explorer.provable.com/v1/testnet` |
| Mapping query | `GET /{network}/program/{programID}/mapping/{mappingName}/{mappingKey}` |
| Transaction broadcast | `POST /{network}/transaction/broadcast` |
| Block height | `GET /{network}/block/height/latest` |

**Rate limits**: 5 req/s, 100K req/day.

### 4.4 WASM & Performance Considerations

1. **Cross-Origin Isolation Required**: Multi-threaded WASM needs `SharedArrayBuffer`, which requires:
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```

2. **Web Worker Pattern**: All proof generation must run in Web Workers to avoid blocking the UI.

3. **Delegated Proving**: For complex proofs, Provable offers a server-side proving service at `https://api.provable.com/prove`. Trades some privacy for performance.

4. **Key Caching**: Proving/verifying keys are expensive to synthesize. Use `AleoKeyProvider.useCache(true)`.

5. **Webpack over Vite**: Known Vite bug with nested workers. The official `create-leo-app` uses Webpack.

---

## 5. Current Frontend State & Gaps

### 5.1 What Exists

The frontend (`/client/`) is built with Next.js 16 + React 19 + TypeScript and includes:

- **Wallet integration** via `@demox-labs/aleo-wallet-adapter-*` (Leo Wallet only)
- **Order placement form** with privacy UX (shows tick range publicly, price privately)
- **Order book display** component
- **Token pair selector** with multiple pairs defined
- **User orders** component
- **Recent trades** component
- **Dashboard** pages

### 5.2 Critical Gaps

#### Gap 1: Contract Interaction is Mostly Simulated

The `aleo-contract.ts` (`AleoContract` class) is entirely simulation-based. All methods use `setTimeout` to simulate network calls and return mock data:

```typescript
// From client/lib/aleo-contract.ts:56-63
return new Promise((resolve) => {
    setTimeout(() => {
        resolve({
            orderId: `order_${Date.now()}`,
            txId: `tx_${Date.now()}`,
        });
    }, 1000);
});
```

**This needs to be replaced with real `@provablehq/sdk` calls.**

#### Gap 2: Dual Wallet Integration Patterns

The codebase has two conflicting wallet integration approaches:
1. `use-aleo.ts` - Custom hook using `window.aleo` directly (raw browser API)
2. `use-wallet-operations.ts` + `wallet-provider.tsx` - Uses `@demox-labs/aleo-wallet-adapter-react` (the proper approach)

These should be unified to use only the wallet adapter approach.

#### Gap 3: Program ID Mismatch

- `wallet-provider.tsx` connects with `appName: 'Aleo Order Book'`
- `use-aleo.ts` references program `sl.aleo`
- `use-wallet-operations.ts` references program `sl.aleo`
- `config.ts` and `order-placement-form.tsx` use `config.CONTRACT_PROGRAM_ID` which is `private_orderbook_v1.aleo`

The program ID should be consistently `private_orderbook_v1.aleo` everywhere.

#### Gap 4: No Real Blockchain Data Fetching

The `aleo-service.ts` (`AleoService` class) has the correct API structure but:
- Uses the old `https://api.explorer.aleo.org` URL (should be `https://api.explorer.provable.com`)
- Mapping queries assume a key format (`token_pair_id_tick_id`) that doesn't match the contract's BHP256 hashing
- No actual parsing of Aleo's mapping value format (Aleo returns values as strings like `"{ token_pair: 1u64, tick_id: 150u64, ... }"`)

#### Gap 5: No Record Decryption

Users can't view their own orders because there's no real record decryption implemented. The wallet adapter provides `requestRecords` and `decrypt` methods, but they're not wired up to the UI.

#### Gap 6: No Transaction Monitoring

The `monitorTransaction` function in `transaction-utils.ts` is entirely simulated. Real implementation needs to poll the Aleo API for transaction confirmation.

#### Gap 7: Only Leo Wallet Supported

The `wallet-provider.tsx` only initializes `LeoWalletAdapter`. The `aleo-adapters` package should be used to support Fox, Puzzle, and Soter wallets.

#### Gap 8: Wallet Provider Bug

In `wallet-provider.tsx:35`:
```typescript
wallets[0].connect(DecryptPermission.NoDecrypt, WalletAdapterNetwork.TestnetBeta)
```
This calls `connect()` during render, which is a side effect that should not happen during component rendering. It will cause issues with React strict mode and SSR.

#### Gap 9: No Web Worker for Proof Generation

If local proof generation is needed (e.g., for the matcher service or power users), there's no Web Worker setup. All heavy computation would block the main thread.

---

## 6. Recommendations for Frontend Completion

### Phase 1: Fix Foundation (Critical)

1. **Unify wallet integration** - Remove `use-aleo.ts`, use only the `@demox-labs` wallet adapter via `use-wallet-operations.ts`

2. **Fix program ID** - Standardize on `private_orderbook_v1.aleo` across all files

3. **Fix wallet provider** - Remove the render-time `connect()` call, add multi-wallet support:
   ```typescript
   import { LeoWalletAdapter, FoxWalletAdapter, PuzzleWalletAdapter } from 'aleo-adapters';

   const wallets = useMemo(() => [
     new LeoWalletAdapter({ appName: 'Aleo Order Book' }),
     new FoxWalletAdapter({ appName: 'Aleo Order Book' }),
     new PuzzleWalletAdapter({ ... }),
   ], []);
   ```

4. **Update API base URL** - Change from `https://api.explorer.aleo.org/v1/testnet` to `https://api.explorer.provable.com/v1/testnet`

### Phase 2: Real Blockchain Integration

5. **Replace `AleoContract` with real SDK calls** using `@provablehq/sdk`:
   ```typescript
   import { AleoNetworkClient } from '@provablehq/sdk';

   const client = new AleoNetworkClient('https://api.explorer.provable.com/v1');

   // Query tick registry
   const tickInfo = await client.getProgramMappingValue(
     'private_orderbook_v1.aleo',
     'tick_registry',
     tickKey  // The BHP256 hash as a field element string
   );
   ```

6. **Implement real mapping queries** - The tick registry uses BHP256 hashing. To query it from the frontend, you need to compute the same hash. This requires using the `@provablehq/wasm` module to compute `BHP256::hash_to_field`.

7. **Implement record decryption** - Wire up `requestRecords('private_orderbook_v1.aleo')` to fetch and display user's orders:
   ```typescript
   const records = await requestRecords('private_orderbook_v1.aleo');
   // Filter for TickOrder records, parse fields
   ```

8. **Implement transaction monitoring**:
   ```typescript
   const checkStatus = async (txId: string) => {
     const response = await fetch(
       `https://api.explorer.provable.com/v1/testnet/transaction/${txId}`
     );
     if (response.ok) {
       const data = await response.json();
       return data.type === 'execute' ? 'confirmed' : 'pending';
     }
     return 'pending';
   };
   ```

### Phase 3: Enhanced UX

9. **Add Web Worker for proof-heavy operations**:
   ```typescript
   // workers/aleo-worker.ts
   import { initThreadPool, ProgramManager } from '@provablehq/sdk';

   self.onmessage = async (event) => {
     await initThreadPool();
     // Handle proof generation requests
   };
   ```

10. **Add Cross-Origin Isolation headers** in `next.config.ts`:
    ```typescript
    const nextConfig = {
      async headers() {
        return [{
          source: '/(.*)',
          headers: [
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          ],
        }];
      },
    };
    ```

11. **Add real-time order book updates** - Poll the tick registry mapping periodically or use WebSocket connections to a node.

12. **Add transaction history** - Use the Provable API to fetch program transitions and display settlement history.

13. **Implement proper loading states** - Proof generation can take 30+ seconds. Show progress indicators.

### Phase 4: Production Hardening

14. **Consider delegated proving** for faster UX:
    ```typescript
    const provingRequest = await programManager.provingRequest({
      programName: 'private_orderbook_v1.aleo',
      functionName: 'submit_tick_order',
      inputs: [...],
      broadcast: true,
    });
    ```

15. **Add error recovery** - Transaction failures, network timeouts, wallet disconnections

16. **Rate limit management** - Cache API responses, batch requests, implement exponential backoff

17. **Add Webpack build** if Vite issues arise with nested workers (known Vite bug)

---

## 7. Architecture Recommendations

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                         │
├──────────┬──────────┬──────────────┬────────────────────────┤
│  Wallet  │  Order   │  Order Book  │   User Dashboard       │
│  Connect │  Form    │  Display     │   (Records)            │
├──────────┴──────────┴──────────────┴────────────────────────┤
│              Unified Service Layer                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ WalletAdapter   │  │ AleoNetwork  │  │ WebWorker     │  │
│  │ (Multi-wallet)  │  │ Client       │  │ (Proof Gen)   │  │
│  └────────┬────────┘  └──────┬───────┘  └───────┬───────┘  │
├───────────┼──────────────────┼───────────────────┼──────────┤
│           │                  │                   │          │
│  Leo/Fox/Puzzle      Provable API         @provablehq/wasm │
│  Wallet Extensions   (REST)               (SharedArrayBuf) │
└───────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Aleo Blockchain   │
                    │  (private_order-   │
                    │   book_v1.aleo)    │
                    └───────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Matcher Service   │
                    │  (Off-chain)       │
                    └───────────────────┘
```

### Key Dependencies to Install/Update

```bash
# Remove (deprecated)
# @aleohq/sdk

# Install/update
npm install @provablehq/sdk@latest
npm install aleo-adapters  # Multi-wallet support

# Keep
@demox-labs/aleo-wallet-adapter-base
@demox-labs/aleo-wallet-adapter-react
@demox-labs/aleo-wallet-adapter-reactui
```

### Priority Order for Frontend Work

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Fix wallet provider (remove render connect, fix program ID) | Low | Unblocks all wallet operations |
| P0 | Update API URL to Provable | Low | Enables real data fetching |
| P1 | Replace mock contract class with real SDK | Medium | Enables real order submission |
| P1 | Implement record decryption for user orders | Medium | Core user feature |
| P1 | Implement real mapping queries | Medium | Enables real order book display |
| P2 | Add multi-wallet support | Low | Better UX |
| P2 | Add transaction monitoring | Medium | User can track orders |
| P2 | Add Web Worker for proof generation | Medium | Performance |
| P3 | Add delegated proving option | Medium | Faster UX for complex operations |
| P3 | Cross-Origin Isolation headers | Low | Required for multi-threaded WASM |

---

*Report generated: January 2026*
*Contract analyzed: `private_orderbook_v1.aleo` (695 lines of Leo)*
*Frontend analyzed: Next.js 16 + React 19 client application*
