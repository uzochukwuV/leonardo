# Frontend Integration Plan: Migrate to private_matching_orderbook_v1.aleo

## Context

The new smart contract (`usdcx_sl/src/main.leo` → `private_matching_orderbook_v1.aleo`) replaces the old one (`sl/src/main.leo` → `private_orderbook_v20.aleo`). The frontend currently targets `private_orderbook_v19.aleo`. This plan covers all changes needed to integrate the new contract.

---

## 1. Contract Differences Summary

### Structural
- **Program name**: `private_orderbook_v19.aleo` → `private_matching_orderbook_v1.aleo`
- **Order record**: New `base_token_id: field` field
- **Cancellation**: All cancellation logic REMOVED (`request_cancel`, `cancel_buy_order`, `cancel_sell_order`, `cancel_buy_order_usdcx`, `cancel_sell_order_usdcx`, `CancellationRequest`, `CancellationProof` records)
- **split_order**: REMOVED
- **Cross-pair settlement**: Added `settle_cross_pair` (new)

### Function Signature Changes

| Function | Old Signature | New Signature | Change |
|----------|--------------|---------------|--------|
| `submit_buy_order` | `(pair_id, quote_token_id, price, quantity, escrow_quote, timestamp, expires_at, orchestrator_addr)` | `(pair_id, base_token_id, quote_token_id, price, quantity, escrow_quote, timestamp, expires_at, orchestrator_addr)` | Added `base_token_id` after `pair_id` |
| `submit_buy_order_usdcx` | `(pair_id, price, quantity, escrow_quote, timestamp, expires_at, orchestrator_addr)` | `(pair_id, base_token_id, price, quantity, escrow_quote, timestamp, expires_at, orchestrator_addr)` | Added `base_token_id` after `pair_id` |
| `submit_sell_order` | `(pair_id, quote_token_id, price, quantity, escrow_aleo:u64, timestamp, expires_at, orchestrator_addr)` | `(pair_id, base_token_id, quote_token_id, price, quantity, escrow_base:u128, timestamp, expires_at, orchestrator_addr)` | Added `base_token_id`, changed `escrow_aleo:u64` → `escrow_base:u128` |
| `submit_sell_order_usdcx` | `(pair_id, base_token_id, quote_token_id, price, quantity, escrow_usdcx, timestamp, expires_at, orchestrator_addr)` | `(pair_id, quote_token_id, price, quantity, escrow_usdcx, timestamp, expires_at, orchestrator_addr)` | Removed `base_token_id` (hardcoded as USDCX_TOKEN_ID in contract) |

### Settlement Changes
- `settle_match`: Buyer now receives `sell_order.base_token_id` via `token_registry.aleo/transfer_public` (not ALEO via `credits.aleo`)
- `finalize_settle_match` and `finalize_settle_match_usdcx` merged into single `finalize_settle_match` that validates `base_token_id` and `quote_token_id` against pair

### New Capabilities
- Multi-token base support: ANY ARC20 token can be base (not just ALEO)
- Sell orders with non-native base tokens REQUIRE token approval to `token_registry.aleo`

---

## 2. Files to Modify

### 2.1 `client/lib/config.ts` — Update Program ID

```
Line 3:  Update comment from "private_orderbook_v19.aleo" → "private_matching_orderbook_v1.aleo"
Line 8:  CONTRACT_PROGRAM_ID: 'private_orderbook_v19.aleo' → 'private_matching_orderbook_v1.aleo'
Line 42: Update comment from "private_orderbook_v19.aleo" → "private_matching_orderbook_v1.aleo"
```

### 2.2 `client/hooks/use-submit-order.ts` — Core Order Submission

This is the most critical file. Four contract calls need updating:

**A. `submit_buy_order` (line 223-238)**
- Current inputs: `[pairId, quoteTokenId, priceBps, quantityRaw, escrowAmount, timestamp, expiresAt, orchestratorAddr]`
- New inputs: `[pairId, baseTokenId, quoteTokenId, priceBps, quantityRaw, escrowAmount, timestamp, expiresAt, orchestratorAddr]`
- Add `pair.baseToken.tokenId` as second parameter

**B. `submit_buy_order_usdcx` (line 206-220)**
- Current inputs: `[pairId, priceBps, quantityRaw, escrowAmount, timestamp, expiresAt, orchestratorAddr]`
- New inputs: `[pairId, baseTokenId, priceBps, quantityRaw, escrowAmount, timestamp, expiresAt, orchestratorAddr]`
- Add `pair.baseToken.tokenId` as second parameter

**C. `submit_sell_order` (line 263-279)**
- Current inputs: `[pairId, quoteTokenId, priceBps, quantityRaw, escrowAmount:u64, timestamp, expiresAt, orchestratorAddr]`
- New inputs: `[pairId, baseTokenId, quoteTokenId, priceBps, quantityRaw, escrowAmount:u128, timestamp, expiresAt, orchestratorAddr]`
- Add `pair.baseToken.tokenId` as second parameter
- Change `Number(escrowAmount)}u64` → `${escrowAmount}u128`

**D. `submit_sell_order_usdcx` (line 246-261)**
- Current inputs: `[pairId, quoteTokenId, priceBps, quantityRaw, escrowAmount, timestamp, expiresAt, orchestratorAddr]`
- New inputs: `[pairId, quoteTokenId, priceBps, quantityRaw, escrowAmount, timestamp, expiresAt, orchestratorAddr]`
- Remove `pair.baseToken.tokenId` (was acting as `base_token_id` param which no longer exists)
- No other changes needed (this function's signature only lost the `base_token_id` param)

**E. Approval logic (lines 85-154) — `approveQuoteTokens`**
- Currently only handles buy order quote token approval
- Add sell order support: if `!isBuy` and base token is non-native, approve base token to `token_registry.aleo`
- Add new approval branch before the existing buy-order-only logic:

```typescript
if (!isBuy) {
  const isNativeBase = pair.baseToken.tokenId === '0field';
  if (isNativeBase) {
    return null; // Native ALEO doesn't need approval
  }
  // Non-native base token sell: approve base token to token_registry
  const approvalProgram = config.TOKEN_REGISTRY_PROGRAM;
  const approvalInputs = [
    pair.baseToken.tokenId,
    config.CONTRACT_PROGRAM_ID,
    `${escrowAmount}u128`
  ];
  // ... exec + poll
}
```

**F. Approval detection in order-placement-form.tsx (lines 96-131)**
- Currently: sell orders always skip approval
- Change: sell orders with non-native base token need approval
- Update the check at line 110-114:

```typescript
// Old:
if (!isBuy) {
  setNeedsApproval(false);
  return;
}

// New:
if (!isBuy) {
  const isNativeBase = pair.baseToken.tokenId === '0field';
  if (isNativeBase) {
    setNeedsApproval(false);
    return;
  }
  // Non-native base token needs approval for sell orders
  if (qty <= 0 || price <= 0) {
    setNeedsApproval(false);
    return;
  }
  setNeedsApproval(true);
  return;
}
```

**G. Info text (line 516-517 in order-placement-form.tsx**
- Currently: "Sell orders escrow ALEO directly."
- Update to be generic: "Sell orders escrow the base token. Non-native tokens require approval."

**H. Button text (line 241-243 in order-placement-form.tsx)**
- Currently: `Approve ${pair.quoteToken.symbol} to continue`
- Make dynamic based on side: `Approve ${isBuy ? pair.quoteToken.symbol : pair.baseToken.symbol} to continue`

### 2.3 `client/hooks/use-cancel-order.ts` — Remove Cancellation

The new contract has NO cancellation support. Two options:

**Option A (Recommended)**: Delete the file entirely and remove all imports/usages
**Option B**: Keep the file but add a prominent deprecation notice and make `cancelOrder` throw

Recommended: Option A. Remove the file and clean up any components that import it.

### 2.4 `client/app/page.tsx` — Fix Hardcoded Contract Name

```
Line 15: requestRecords('private_orderbook_v17.aleo') → requestRecords(config.CONTRACT_PROGRAM_ID)
```
Add import for `config` from `@/lib/config`.

### 2.5 `client/components/wallet-provider.tsx` — Update Programs List

Line 34: Already uses `config.CONTRACT_PROGRAM_ID` dynamically (good).
Add `test_usdcx_stablecoin.aleo` to the programs array so the wallet scans for USDCx records:
```
programs={[config.CONTRACT_PROGRAM_ID, 'token_registry.aleo', 'credits.aleo', 'test_usdcx_stablecoin.aleo']}
```

### 2.6 `client/hooks/useUserRecords.ts` — Update Comment + Record Types

- Line 7: Update stale comment referencing `private_orderbook_v17.aleo`
- Ensure record type names match new contract (Order, Receipt, SettlementProof are same names)
- Remove references to `CancellationRequest` and `CancellationProof` if present in record scanning

### 2.7 `client/lib/aleo-service.ts` — Update Contract References

- All mapping queries use `config.CONTRACT_PROGRAM_ID` (already dynamic via config)
- Update any hardcoded contract name references in comments
- Verify `getTokenPairOnChain`, `getOrderCounter`, `getOrchestratorAddress` etc. still work (mapping names are unchanged)

### 2.8 `client/lib/token-pairs.ts` — Update Comments

- Line 11: Update stale comment `private_orderbook_v18.aleo` → `private_matching_orderbook_v1.aleo`
- No functional changes needed (static pair definitions remain valid)

### 2.9 Comment-Only Updates

| File | Line | Change |
|------|------|--------|
| `client/hooks/use-submit-order.ts` | 5 | `private_orderbook_v19.aleo` → `private_matching_orderbook_v1.aleo` |
| `client/lib/token-pairs.ts` | 11 | `private_orderbook_v18.aleo` → `private_matching_orderbook_v1.aleo` |
| `client/hooks/useUserRecords.ts` | 7 | `private_orderbook_v17.aleo` → `private_matching_orderbook_v1.aleo` |
| `client/hooks/use-cancel-order.ts` | 6 | `v17 contract` → deprecated |

---

## 3. Verification Checklist

After all changes:

1. `config.CONTRACT_PROGRAM_ID` = `'private_matching_orderbook_v1.aleo'`
2. `submit_buy_order` inputs include `base_token_id` as 2nd param
3. `submit_buy_order_usdcx` inputs include `base_token_id` as 2nd param
4. `submit_sell_order` inputs include `base_token_id` as 2nd param, escrow is `u128`
5. `submit_sell_order_usdcx` inputs do NOT include `base_token_id`
6. Sell orders with non-native base tokens trigger approval flow
7. No references to `request_cancel` or cancellation functions remain
8. No hardcoded old contract names remain (`private_orderbook_v17/v18/v19/v20`)
9. `app/page.tsx` uses `config.CONTRACT_PROGRAM_ID` instead of hardcoded name

---

## 4. Implementation Order

1. `config.ts` — Update program ID (everything else depends on this)
2. `use-submit-order.ts` — Core contract interaction changes (biggest change)
3. `order-placement-form.tsx` — Approval logic + UI text updates
4. `app/page.tsx` — Fix hardcoded name
5. `use-cancel-order.ts` — Remove or deprecate
6. `wallet-provider.tsx` — Update program references
7. `aleo-service.ts` — Update comments only
8. `token-pairs.ts` — Update comments only
9. `useUserRecords.ts` — Update comments, remove cancellation record types
