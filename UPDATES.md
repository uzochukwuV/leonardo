# Update Notes — Smart Contract v4 & Frontend Order Book Integration

## Overview

This round covered two areas: upgrading the smart contract from v3 to v4 with significant new capabilities, and then connecting the frontend dashboard to real on-chain data from the deployed contract. The order book was showing 0 buys and 0 sells despite orders existing on-chain — we traced, fixed, and refactored the entire data pipeline.

---

## Smart Contract: `private_orderbook_v4.aleo`

### What Changed from v3

The contract was rewritten as a full upgrade. Key improvements:

**Partial Fill Support**
In v3, settlement removed the escrow entry entirely. In v4, `escrow_registry` is updated (not removed) when a fill is partial. Only a full fill removes the entry. This allows an order to be matched multiple times across separate settlement calls until fully consumed.

**Contract-Derived Order Key**
In v3, the `order_key` was supplied by the user — a security risk since a malicious caller could supply a key that maps to another user's escrow. In v4, the key is derived inside the contract:
```leo
let nonce: field = BHP256::hash_to_field(
    self.caller as field + tick_lower as field + tick_upper as field + timestamp as field
);
let order_key: field = derive_order_key(nonce, new_counter);
```
The user cannot predict or forge this key.

**Per-Pair Tick Size**
All price and range validations now use `pair.tick_size` fetched from the `token_pairs` mapping, rather than a global constant. This allows different pairs to have different price granularities.

**Permissionless Settlement with Keeper Fees**
Any caller holding both `TickOrder` records can call `settle_match_public`. The settler earns `settler_fee_bps` (0.1%) from the quote gross as a keeper reward. A separate `protocol_fee_bps` (0.05%) goes to the treasury address set at pair registration. This incentivises external keepers to find and match orders.

**Order Expiry**
`TickOrder` now carries an `expires_at: u32` field (block height). If non-zero, the contract asserts `expires_at > block.height` at submission time. Orders with `expires_at = 0` never expire.

**Ceil Rounding on Escrow**
Quote escrow is computed with ceiling division to prevent dust:
```leo
inline calc_escrow(is_buy: bool, quantity: u128, price: u64) -> u128 {
    if is_buy {
        return (quantity * price as u128 + 9999u128) / 10000u128;
    } else {
        return quantity;
    }
}
```
This ensures the escrowed amount always covers the full quote obligation.

**Two Settlement Variants**
- `settle_match_public` — lightweight, no explicit order keys. Updates `total_escrowed` only.
- `settle_match_public_with_keys` — takes explicit `buy_order_key` and `sell_order_key`, does full `escrow_registry` cleanup and identity verification against the depositor address.

**Batch Settlement**
`batch_settle_public` settles two independent matches (A and B) in a single transaction. Both matches can be from different token pairs. The keeper earns fees from both.

**Idempotent-Safe Pair Registration**
`finalize_register_pair` now asserts `!already_exists` before writing, preventing accidental overwrites.

**`@noupgrade` Constructor**
Added the required `@noupgrade async constructor() {}` for compatibility with Aleo ConsensusVersion::V9, which mandates that all deployed programs include a constructor.

### New Data Structures

- `SettleInfo` — packs all settlement parameters into one struct to stay under the 16-argument limit on `async` functions
- `TickRange` — packs the four tick bounds (buy_lower, buy_upper, sell_lower, sell_upper) for passing to finalize
- `Settlement` — private record minted to buyer and seller on each fill, carrying quantity, exec price, and direction

### Demo Script (`demo.sh`)

The demo script was updated alongside the contract:

- **`registry_tx()` fixed**: `leo execute` cannot call external programs. Replaced with `snarkos developer execute "$REGISTRY" "$func"` using `--network 1` (testnet numeric ID) and `--endpoint https://api.explorer.provable.com` (auto-extends).
- **Token IDs**: Using `7001field` / `7002field` to avoid collision with `1field` / `2field` already registered by a different admin on testnet.
- **Pair ID 2**: Pair 1 is owned by a different admin. The script registers ALEO/USDC as pair 2 with fee params: `settler_fee_bps=10`, `protocol_fee_bps=5`, `treasury=deployer`.
- **On-chain checks before setup**: Steps 5 and 6 now query the Provable v2 API first and auto-skip if admin/pair already exist — so re-running with `--skip-setup` is safe.
- **Record extraction fix**: The settle step was failing with `Found invalid character in: " }"`. The awk+sed pipeline was rewritten to collapse whitespace and strip spaces before `}` in the extracted `TickOrder` record literals.
- **28 Leo tests**: A full test suite was written for `private_orderbook_v4.aleo` using `@test script` blocks (pure computation, no external program calls). All 28 tests pass, covering escrow math, exec price midpoint, fill quantity, tick overlap, tick range validation, price bounds, and full/partial settlement arithmetic.

---

---

## 1. Default Token Pair Fix (`config.ts`)

The first issue was simple: `DEFAULT_TOKEN_PAIR` was set to `1`, but our deployed orders are on pair 2. Pair 1 on testnet was registered by a different admin using `1field`/`2field` token IDs that we don't control.

**Fix:** Changed `DEFAULT_TOKEN_PAIR` from `1` to `2`.

---

## 2. Token Registry Correction (`token-pairs.ts`)

Pair 2 was incorrectly defined as `ALEO/USDT` with a `tokenId` of `'usdt.aleo'` — a placeholder that does not exist on testnet. Our demo script registers two tokens with IDs `7001field` (base/ALEO) and `7002field` (quote/USDC).

**Fixes:**
- `TOKENS.ALEO.tokenId`: `'1field'` → `'7001field'`
- `TOKENS.USDC.tokenId`: `'2field'` → `'7002field'`
- Pair 2: renamed from `ALEO/USDT` to `ALEO/USDC`, switched `quoteToken` from `TOKENS.USDT` to `TOKENS.USDC`
- Pair 1: marked `active: false` — it uses tokens from a different admin and is not tradeable by us

---

## 3. Order Book Data Hook Rewrite (`use-order-book-data.ts`)

The hook had two data paths:

1. **Puzzle SDK `useEvents`** — only surfaces events for the currently connected wallet, not all on-chain orders. This always returned empty arrays for a public order book view.
2. **Block-scan fallback** — correctly queries the Provable v2 API for all transitions.

The bug: `puzzleResult ?? scanResult` always chose the Puzzle SDK path because `puzzleResult` was never `null` — it always returned an object (with empty arrays).

**Fix:** Removed the Puzzle SDK data path entirely. The hook now always uses `fetchProgramTransitions` from `aleo-service.ts`, which queries `GET /transactions/summary/latest` and fetches full transition data for each matching transaction. This surfaces all on-chain orders regardless of which wallet submitted them.

The hook now fetches both `submit_order_with_escrow` and `settle_match_public` transitions in parallel and derives all display state from those results.

---

## 4. Transition Parsing Fix (`aleo-service.ts`)

`fetchOrderBookDepth` was filtering transitions with `tx.function !== 'submit_order_with_escrow'`. This check silently dropped all transitions because the Provable v2 API sometimes populates the function name under a different field name, leaving `tx.function` as `undefined`.

Since `fetchProgramTransitions` already filters by `functionId` at the summary level (before fetching full transactions), the secondary function-name check was redundant and harmful.

**Fix:** Removed the redundant function name check. Added `transitionsToDepth` as a separate exported pure function that takes an already-filtered transition array and extracts tick-level depth. The input parsing was also hardened:

```ts
const rawPair = String(inputs[0] ?? '').replace(/u64$/i, '').trim();
const parsedPair = rawPair ? parseInt(rawPair, 10) : -1;
if (isNaN(parsedPair) || parsedPair !== pairId) continue;
```

This correctly strips the Leo type suffix (`u64`) before parsing, handling the actual format returned by the API: `['2u64', 'true', '1490u64', '1510u64', ...]`.

---

## 5. Single Fetch Architecture (Dashboard → Props)

Previously `useOrderBookData` was called independently by three components — `OrderBookDisplay`, `OrderBookStats`, and `RecentTrades` — each triggering their own parallel chain fetches. This caused race conditions and redundant API calls.

**Fix:** The hook is now called once at the dashboard level. The resulting `OrderBookData` object is passed down as a `data` prop to all three child components. Components no longer fetch independently.

```tsx
// dashboard/page.tsx
const orderBookData = useOrderBookData(selectedPairId);

<OrderBookStats data={orderBookData} ... />
<OrderBookDisplay data={orderBookData} ... />
<RecentTrades data={orderBookData} ... />
```

---

## 6. New `OrderBookStats` Component

Added a live stats bar above the main grid displaying:

- **Last price** — mid of best bid/ask
- **Buys** — count of buy order transitions on-chain
- **Sells** — count of sell order transitions on-chain
- **Total orders** — combined count
- **Settlements** — number of `settle_match_public` transitions found
- **Buy/sell pressure bar** — visual ratio of buys to sells

---

## 7. Order Count vs Tick Count Distinction

After the fix started working, the stats showed `Buys: 42, Sells: 42` — misleading. This happened because 1 buy order spanning ticks 1490–1510 creates 21 tick-level depth entries, each counted separately.

**Fix:** Added `buyOrders` and `sellOrders` to `OrderBookData` — these count actual transition count (number of orders submitted), not the number of ticks covered. The order book rows continue to show tick-level depth (how many orders overlap each tick), which is useful for price-level visualization. The stats bar and footer show the true order count.

---

## 8. Order Book Display Cleanup

Simplified the `OrderBookDisplay` component layout:

- Removed `flex-col-reverse` which was causing visual confusion
- Asks section (sell orders) rendered top to bottom, highest price first
- Mid-price bar separates asks from bids
- Bids section below, highest bid first
- `BookRow` simplified: shows tick price, tick ID, and order count — removed the noisy `↗fill` hover text
- Footer now shows actual order counts (`buyOrders`/`sellOrders`) rather than tick-level sums

---

## Result

The dashboard now correctly displays live on-chain order book data:

- **1 buy order** (tick range 1490–1510, `$14.90–$15.10`)
- **1 sell order** (tick range 1490–1510, `$14.90–$15.10`)
- **21 overlapping ticks** shown in the depth view, each with 1 buy + 1 sell
- Stats bar accurately reads: Buys: 1, Sells: 1, Total: 2
- Auto-refreshes every 30 seconds
