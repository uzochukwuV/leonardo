# Order Book Setup Guide

## ⚠️ IMPORTANT UPDATE: Contract Fixed!

**The smart contract has been updated to fix the token pair validation issue.**

### What Was Fixed ✅
- ✅ Added `TokenPair` struct and `token_pairs` mapping
- ✅ Added `register_token_pair()` transition for admin
- ✅ Added validation in `submit_tick_order()` and `submit_tick_order_with_escrow()`
- ✅ Orders now verify token pair exists and is active
- ✅ Escrow orders verify correct token IDs match pair configuration
- ✅ Tick registry automatically updates on order submission

**See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for full deployment instructions.**

## Current Situation Analysis

### What We Have ✅
1. **Smart contract built and fixed**: Updated `private_orderbook_v1.aleo` with proper validation
2. **Frontend integrated**: Wallet adapter, order form, and order book display ready
3. **Two transition functions**:
   - `submit_tick_order()` - For testing WITHOUT token escrow (**NOW WITH VALIDATION**)
   - `submit_tick_order_with_escrow()` - For production WITH real tokens (**NOW WITH VALIDATION**)

### What We Need 🔧

## The Token Situation

Your contract imports `token_registry.aleo`, which is the **ARC-21 standard token registry** already deployed on Aleo testnet. However:

### Current Status:
- ❌ **No custom tokens deployed yet** (USDC, USDT, etc.)
- ✅ **ALEO (credits.aleo) exists** - Native Aleo token
- ❌ **No token pair initialization needed** - The contract is **permissionless**!

## Good News: No Token Pair Registration Required! 🎉

Looking at your smart contract, there is **NO** token pair initialization function. This means:

✅ **Token pairs are created implicitly** when the first order is submitted
✅ **No admin setup required**
✅ **Fully permissionless** - anyone can trade any token pair by using the pair ID

The contract uses a simple `u64` for `token_pair` (e.g., `1` for ALEO/USDC), and tick data is stored using:
```leo
inline get_tick_key(token_pair: u64, tick_id: u64) -> field {
    return BHP256::hash_to_field(token_pair + (tick_id * 1000000u64));
}
```

This means **submitting an order automatically creates the pair**!

## Two Paths Forward

### Path 1: Testing Mode (Immediate - No Tokens Needed) 🚀

**Use the `submit_tick_order()` transition** - This is already what the frontend does!

**How it works**:
```leo
transition submit_tick_order(
    public token_pair: u64,      // 1 = ALEO/USDC (conceptual)
    public is_buy: bool,
    public tick_lower: u64,
    public tick_upper: u64,
    public timestamp: u32,
    limit_price: u64,            // Private
    quantity: u64                // Private
) -> TickOrder
```

**Advantages**:
- ✅ Works RIGHT NOW without deploying tokens
- ✅ No escrow needed - just creates order records
- ✅ Perfect for testing the order book UI
- ✅ Can test matching algorithm
- ✅ Frontend is already configured for this!

**Limitations**:
- ⚠️ No real token transfers
- ⚠️ Orders are "paper orders" (not backed by real assets)
- ⚠️ Settlements won't move actual tokens

**How to use**:
1. Connect your Leo wallet
2. Fill out the order form
3. Click "Place Order"
4. Transaction will create a `TickOrder` record
5. Order appears in order book after ~2-5 minutes

**Current frontend transaction format**:
```typescript
const inputs = [
  `${tokenPairId}u64`,        // 1
  `${isBuy}`,                 // true or false
  `${tickLowerId}u64`,        // e.g., 1495
  `${tickUpperId}u64`,        // e.g., 1505
  `${limitPriceBps}u64`,      // e.g., 150000 (=$15.00)
  `${quantityRaw}u64`,        // e.g., 100000000 (100 ALEO)
];
```

⚠️ **ISSUE**: The frontend is missing the `timestamp` parameter!

### Path 2: Production Mode (Future - Requires Tokens) 🏗️

**Use the `submit_tick_order_with_escrow()` transition**

**Requirements**:
1. Deploy custom tokens (USDC, USDT) compatible with ARC-21
2. Mint tokens to users
3. Users must have token records in their wallet
4. Update frontend to pass `Token` record as input

**Contract signature**:
```leo
transition submit_tick_order_with_escrow(
    public token_pair: u64,
    public is_buy: bool,
    public tick_lower: u64,
    public tick_upper: u64,
    public timestamp: u32,
    limit_price: u64,
    quantity: u64,
    escrow_token: Token        // Token record from wallet!
) -> (TickOrder, Token)        // Returns order + change
```

**How escrow works**:
- **Buy orders**: Escrow quote token (e.g., USDC)
  - Amount = `(quantity * limit_price) / 10000`
- **Sell orders**: Escrow base token (e.g., ALEO)
  - Amount = `quantity`

**Deploying tokens** (later):
1. Create ARC-21 compatible token program
2. Deploy to testnet
3. Mint initial supply
4. Distribute to testers

## Immediate Action: Fix Frontend Bug 🐛

The frontend is calling `submit_tick_order` but missing the `timestamp` parameter!

**Current code sends 6 inputs**:
```typescript
const inputs = [
  `${tokenPairId}u64`,
  `${isBuy}`,
  `${tickLowerId}u64`,
  `${tickUpperId}u64`,
  `${limitPriceBps}u64`,
  `${quantityRaw}u64`,
];
```

**Contract expects 7 inputs**:
```leo
transition submit_tick_order(
    public token_pair: u64,      // ✅ Input 0
    public is_buy: bool,         // ✅ Input 1
    public tick_lower: u64,      // ✅ Input 2
    public tick_upper: u64,      // ✅ Input 3
    public timestamp: u32,       // ❌ MISSING!
    limit_price: u64,            // Input 5
    quantity: u64                // Input 6
)
```

**Fix needed**:
```typescript
const inputs = [
  `${tokenPairId}u64`,
  `${isBuy}`,
  `${tickLowerId}u64`,
  `${tickUpperId}u64`,
  `${Date.now()}u32`,          // ← ADD THIS (or use block height)
  `${limitPriceBps}u64`,
  `${quantityRaw}u64`,
];
```

## Recommended Next Steps

### Step 1: Fix Frontend (5 minutes)
- [ ] Add `timestamp` parameter to order submission
- [ ] Test order submission
- [ ] Verify transaction succeeds

### Step 2: Test Order Book (30 minutes)
- [ ] Submit a buy order
- [ ] Submit a sell order
- [ ] Wait for confirmation (~2-5 mins each)
- [ ] Verify orders appear in tick registry
- [ ] Check order book display updates

### Step 3: Test Matching (Later)
- [ ] Run matcher service
- [ ] Verify it finds overlapping orders
- [ ] Test settlement execution

### Step 4: Deploy Tokens (Future)
- [ ] Create USDC token program (ARC-21)
- [ ] Deploy to testnet
- [ ] Mint test tokens
- [ ] Update frontend for escrow version
- [ ] Test real token transfers

## Understanding Token Pairs

The contract doesn't require pre-registration of pairs. You define pairs by convention:

**In your frontend** ([lib/token-pairs.ts](client/lib/token-pairs.ts)):
```typescript
export const TOKEN_PAIRS: Record<number, TokenPair> = {
  1: { id: 1, name: 'ALEO/USDC', ... },  // Pair ID 1
  2: { id: 2, name: 'ALEO/USDT', ... },  // Pair ID 2
  // etc.
}
```

**On-chain**: The contract just uses the number:
```leo
token_pair: u64  // 1, 2, 3, etc.
```

This means:
- ✅ No need to "create" or "register" pairs on-chain
- ✅ Just use a consistent numbering system
- ✅ Frontend and contract agree on what each number means
- ⚠️ Make sure everyone uses the same pair IDs!

## Testing Without Real Tokens

You can test the ENTIRE order book system right now:

1. **Order Submission** ✅
   - Users submit orders with `submit_tick_order()`
   - No tokens needed, just creates records

2. **Order Book Display** ✅
   - Tick registry updates when orders submitted
   - Frontend queries and displays orders
   - Privacy preserved (only tick ranges public)

3. **Matching** ✅
   - Matcher service finds overlapping orders
   - Can identify profitable matches

4. **Settlement** ⚠️ (Limited)
   - Can execute settlement transition
   - But no real tokens move (placeholder values)
   - Good for testing logic, not token transfers

## When Do You Need Real Tokens?

You ONLY need real tokens when you want:
- ✅ Actual token transfers during settlement
- ✅ Real escrow (preventing users from double-spending)
- ✅ Production trading with economic value

For **development, testing, and demonstration**, the current `submit_tick_order()` function works perfectly!

## Summary

**Current State**:
- ✅ Contract deployed and working
- ✅ Frontend integrated (with one bug to fix)
- ✅ Order book queries ready
- ⚠️ Missing `timestamp` parameter in order submission

**Immediate Next Steps**:
1. Fix the `timestamp` bug in order-placement-form.tsx
2. Test submitting orders
3. Verify order book updates

**Future Work** (when ready for production):
1. Deploy ARC-21 tokens (USDC, USDT, etc.)
2. Switch to `submit_tick_order_with_escrow()`
3. Update frontend to handle token records
4. Test real token escrow and settlement

**The good news**: You can start testing the order book RIGHT NOW without deploying any tokens! 🎉
