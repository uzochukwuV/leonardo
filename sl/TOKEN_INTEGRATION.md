# Token Integration Guide

Complete guide to using token escrow and ARC-21 Token Registry integration in the Private Tick-Based Order Book.

## 🎯 Overview

The order book now supports **full token integration** with:
- ✅ Token escrow for secure trading
- ✅ Atomic token swaps
- ✅ Automatic refunds on cancellation
- ✅ ARC-21 Token Registry compatibility

## 📋 New Features

### 1. Token Escrow

Orders can now escrow actual tokens to guarantee settlement:

```leo
// Submit order WITH token escrow
transition submit_tick_order_with_escrow(
    public token_pair: u64,
    public is_buy: bool,
    public tick_lower: u64,
    public tick_upper: u64,
    public timestamp: u32,
    limit_price: u64,
    quantity: u64,
    escrow_token: Token  // ← NEW: Token to escrow
) -> (TickOrder, Token)
```

**How it works:**

**For BUY orders:**
- Escrow: Quote currency (e.g., USDC)
- Amount: `(quantity × limit_price) / 10000`
- Example: Buy 1000 ALEO @ $15.00 → Escrow 1,500,000 USDC

**For SELL orders:**
- Escrow: Base currency (e.g., ALEO)
- Amount: `quantity`
- Example: Sell 1000 ALEO → Escrow 1000 ALEO

### 2. Order Updates

Modify existing orders without canceling:

```leo
transition update_order(
    old_order: TickOrder,
    public new_tick_lower: u64,
    public new_tick_upper: u64,
    new_limit_price: u64,
    new_quantity: u64
) -> TickOrder
```

**Features:**
- ✅ Change price/tick range
- ✅ Increase/decrease quantity
- ✅ Preserves filled amount
- ✅ Keeps escrow intact

**Constraints:**
- New quantity ≥ filled amount
- Tick range ≤ MAX_TICK_RANGE (50)
- Price within new tick range

### 3. Atomic Token Swaps

Settlement with direct token transfer:

```leo
transition settle_match_with_transfer(
    buy_order: TickOrder,
    sell_order: TickOrder,
    base_token: Token,   // Seller's ALEO
    quote_token: Token,  // Buyer's USDC
    public timestamp: u32
) -> (TickOrder, TickOrder, Token, Token, Settlement, Settlement)
```

**Returns:**
1. Updated buy order
2. Updated sell order
3. Token for buyer (base currency)
4. Token for seller (quote currency)
5. Buyer's settlement record
6. Seller's settlement record

### 4. Cancel with Refund

Get escrowed tokens back:

```leo
transition cancel_order_with_refund(order: TickOrder) -> (bool, Token)
```

**Refund calculation:**

**Unfilled order:**
```
Refund = full escrow amount
```

**Partially filled order:**
```
For buy orders:
  filled_value = (filled × limit_price) / 10000
  refund = escrowed_amount - filled_value

For sell orders:
  refund = escrowed_amount - filled
```

## 🔧 Token Record Structure

```leo
record Token {
    owner: address,
    amount: u64,
    token_id: field,
    external_authorization_required: bool,
    authorized_until: u32,
}
```

**Fields:**
- `owner` - Token holder
- `amount` - Token quantity
- `token_id` - Unique identifier (from ARC-21 registry)
- `external_authorization_required` - Compliance flag
- `authorized_until` - Expiry timestamp

## 💡 Usage Examples

### Example 1: Submit Order with Escrow

```bash
# Step 1: Get your USDC token record
# (From wallet or previous transaction)
USDC_TOKEN='{
  owner: aleo1...,
  amount: 2000000u64,
  token_id: 1234field,
  external_authorization_required: false,
  authorized_until: 0u32
}'

# Step 2: Submit buy order
# Want: 1000 ALEO @ $15.00
# Need to escrow: 1000 × 15.00 = 15,000 USDC
leo run submit_tick_order_with_escrow \
  1u64 \              # token_pair
  true \              # is_buy
  1490u64 \           # tick_lower
  1510u64 \           # tick_upper
  100u32 \            # timestamp
  150000u64 \         # limit_price ($15.00)
  1000u64 \           # quantity
  "$USDC_TOKEN"       # escrow token

# Returns:
# - TickOrder with 15,000 USDC escrowed
# - Change token with 1,985,000 USDC
```

### Example 2: Update Order

```bash
# Original order: Buy 1000 @ $15.00 in range 1490-1510
# Update to: Buy 1200 @ $14.98 in range 1495-1505

OLD_ORDER='{...}'  # From previous transaction

leo run update_order \
  "$OLD_ORDER" \
  1495u64 \          # new_tick_lower
  1505u64 \          # new_tick_upper
  149800u64 \        # new_limit_price ($14.98)
  1200u64            # new_quantity

# Returns:
# - Updated TickOrder with new parameters
# - Filled amount preserved
```

### Example 3: Settle with Token Transfer

```bash
# Buy order: 1000 ALEO @ $15.00 (has USDC escrowed)
# Sell order: 500 ALEO @ $14.95 (has ALEO escrowed)

BUY_ORDER='{...}'
SELL_ORDER='{...}'

# Seller's ALEO token
BASE_TOKEN='{
  owner: aleo1seller...,
  amount: 500u64,
  token_id: 5678field,
  ...
}'

# Buyer's USDC token
QUOTE_TOKEN='{
  owner: aleo1buyer...,
  amount: 7500u64,
  token_id: 1234field,
  ...
}'

leo run settle_match_with_transfer \
  "$BUY_ORDER" \
  "$SELL_ORDER" \
  "$BASE_TOKEN" \
  "$QUOTE_TOKEN" \
  102u32

# Returns:
# 1. Updated buy order (filled: 500/1000)
# 2. Updated sell order (filled: 500/500)
# 3. Buyer receives: 500 ALEO
# 4. Seller receives: 7,487.50 USDC
# 5. Buyer settlement record
# 6. Seller settlement record
```

### Example 4: Cancel with Refund

```bash
# Cancel partially filled order and get refund

ORDER='{
  owner: aleo1...,
  quantity: 1000u64,
  filled: 300u64,
  limit_price: 150000u64,
  escrowed_amount: 1500000u64,
  is_buy: true,
  ...
}'

leo run cancel_order_with_refund "$ORDER"

# Calculation:
# filled_value = (300 × 150000) / 10000 = 450,000 USDC
# refund = 1,500,000 - 450,000 = 1,050,000 USDC

# Returns:
# 1. true (cancellation successful)
# 2. Token with 1,050,000 USDC
```

## 🔐 Security Features

### Escrow Validation

```leo
// Contract verifies:
assert(escrow_token.amount >= required_escrow);  ✓
assert(escrow_token.owner == self.caller);       ✓
```

### Double-Spend Prevention

```leo
// Escrowed tokens locked in order record
// Cannot be used elsewhere until:
// - Order fully filled (via settlement)
// - Order canceled (via refund)
```

### Atomic Swaps

```leo
// Settlement is all-or-nothing:
// - Both tokens transferred, OR
// - Transaction reverts
```

### Price Verification

```leo
// Prices verified in zero-knowledge:
assert(buy_limit >= sell_limit);           // Prices cross
assert(base_token.amount >= base_amount);  // Sufficient tokens
assert(quote_token.amount >= quote_amount); // Sufficient tokens
```

## 📊 Escrow Calculation Examples

| Order Type | Quantity | Price | Escrow Calculation | Escrow Amount |
|-----------|----------|-------|--------------------|---------------|
| **Buy** | 1000 ALEO | $15.00 | `(1000 × 150000) / 10000` | 1,500,000 USDC |
| **Buy** | 500 ALEO | $10.50 | `(500 × 105000) / 10000` | 525,000 USDC |
| **Sell** | 1000 ALEO | $15.00 | `1000` | 1000 ALEO |
| **Sell** | 2500 ALEO | $20.00 | `2500` | 2500 ALEO |

## 🔄 Complete Trading Flow

```
1. ALICE (Buyer)
   └─> Submits order with 1,500,000 USDC escrow
       └─> Gets TickOrder + 500,000 USDC change

2. BOB (Seller)
   └─> Submits order with 500 ALEO escrow
       └─> Gets TickOrder + 0 ALEO change (all escrowed)

3. MATCHER
   └─> Detects tick overlap
       └─> Proposes settlement with token transfer

4. SMART CONTRACT
   └─> Verifies in ZK:
       ├─> Prices cross ✓
       ├─> Tokens valid ✓
       └─> Escrows sufficient ✓
   └─> Executes atomic swap:
       ├─> Alice gets 500 ALEO
       ├─> Bob gets 747,500 USDC
       └─> Matcher gets 373.75 USDC fee

5. ALICE
   └─> Can cancel remaining order
       └─> Gets 752,500 USDC refund
```

## ⚠️ Important Notes

### Gas Costs

Token operations increase gas costs:

| Operation | Approx. Gates | Relative Cost |
|-----------|--------------|---------------|
| `submit_tick_order` | ~5,000 | 1x |
| `submit_tick_order_with_escrow` | ~8,000 | 1.6x |
| `settle_match` | ~15,000 | 3x |
| `settle_match_with_transfer` | ~25,000 | 5x |
| `cancel_order_with_refund` | ~6,000 | 1.2x |

### Token Registry Dependency

```leo
import token_registry.aleo;
```

**Requirements:**
- Token Registry must be deployed
- Tokens must be registered in ARC-21
- Valid `token_id` required

### Escrow vs No-Escrow

**Use escrow when:**
- ✅ Real money trading
- ✅ Production environment
- ✅ Preventing fake liquidity
- ✅ Need trustless settlement

**Skip escrow when:**
- ✅ Testing/demo
- ✅ Gas optimization
- ✅ Off-chain settlement
- ✅ Centralized matching

## 🚀 Integration Checklist

- [ ] Deploy token_registry.aleo
- [ ] Register trading pair tokens
- [ ] Test token escrow on testnet
- [ ] Test order updates
- [ ] Test atomic settlements
- [ ] Test cancellation refunds
- [ ] Verify gas costs
- [ ] Security audit
- [ ] Mainnet deployment

## 📚 Related Documentation

- [README.md](./README.md) - Full project overview
- [QUICKSTART.md](./QUICKSTART.md) - Getting started
- [TESTING.md](./TESTING.md) - Testing guide
- [Aleo Token Standard](https://developer.aleo.org/guides/solidity-to-leo/token-standard-difference) - ARC-21 docs

---

**Built with ARC-21 Token Registry for secure, private trading** 🔒

