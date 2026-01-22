# Quick Start Guide

Get up and running with the Private Tick-Based Order Book in 5 minutes.

## 1. Prerequisites

```bash
# Check if Leo is installed
leo --version

# If not installed
cargo install leo-lang
```

## 2. Build the Contract

```bash
cd sl
leo build
```

Expected output:
```
✅ Compiled 'sl.aleo' into Aleo instructions.
```

## 3. Understanding the Contract

### Core Concept: Tick Ranges

Instead of exposing exact prices, traders specify **price ranges** (ticks):

```
Traditional: "I want to buy at exactly $15.00"
→ Everyone sees your exact price

Tick-Based: "I want to buy between $14.90-$15.10"
→ Only tick range is public
→ Your exact limit price ($15.00) stays private
```

## 4. Example: Creating a Buy Order

```leo
// Import the contract
import sl.aleo;

// Create a buy order
let buy_order = sl.aleo/submit_tick_order(
    1u64,           // token_pair: 1 = USDC/ALEO
    true,           // is_buy: true = buying ALEO
    1490u64,        // tick_lower: $14.90
    1510u64,        // tick_upper: $15.10
    100u32,         // timestamp: block height
    15000u64,       // limit_price: $15.00 (PRIVATE!)
    1000u64         // quantity: 1000 ALEO (PRIVATE!)
);
```

### What's Public vs Private?

**PUBLIC (visible to matchers):**
- Token pair: USDC/ALEO
- Tick range: $14.90 - $15.10
- Timestamp: Block 100

**PRIVATE (encrypted in ZK proof):**
- Exact limit: $15.00
- Quantity: 1000 ALEO
- Your address

## 5. Example: Matching Orders

### Step 1: Create matching orders

```leo
// Buyer: willing to pay up to $15.00
let buy_order = sl.aleo/submit_tick_order(
    1u64, true, 1490u64, 1510u64, 100u32,
    15000u64,  // Buy limit: $15.00
    1000u64
);

// Seller: willing to accept $14.95
let sell_order = sl.aleo/submit_tick_order(
    1u64, false, 1495u64, 1505u64, 101u32,
    14950u64,  // Sell limit: $14.95
    500u64
);
```

### Step 2: Settle the match

```leo
let (updated_buy, updated_sell, buyer_settlement, seller_settlement) =
    sl.aleo/settle_match(buy_order, sell_order, 102u32);

// Execution price: (15000 + 14950) / 2 = 14975 ($14.975)
// Quantity: 500 ALEO (limited by smaller order)
```

## 6. Price Encoding

**IMPORTANT:** Understand the relationship between ticks and prices!

### Tick Size Configuration
```leo
const TICK_SIZE: u64 = 100u64;  // Each tick = 100 basis points = $0.01
```

### Conversion Formulas
```
price_in_basis_points = tick_id × TICK_SIZE
price_in_dollars = tick_id × 0.01
```

### Examples

| Tick ID | Calculation | Basis Points | Dollar Price |
|---------|-------------|--------------|--------------|
| 0 | 0 × 100 | 0 | $0.00 |
| 1 | 1 × 100 | 100 | $0.01 |
| 100 | 100 × 100 | 10,000 | $1.00 |
| 1000 | 1000 × 100 | 100,000 | $10.00 |
| 1490 | 1490 × 100 | 149,000 | $14.90 |
| 1500 | 1500 × 100 | 150,000 | $15.00 |
| 1510 | 1510 × 100 | 151,000 | $15.10 |

### Common Mistake ⚠️

```leo
// ❌ WRONG - Using dollar amount instead of basis points
tick_lower: 1490u64,   // Tick 1490 = $14.90 range
limit_price: 15000u64  // This is $1.50, NOT $15.00!

// ✅ CORRECT - Using basis points
tick_lower: 1490u64,    // Tick 1490 = $14.90 range
limit_price: 150000u64  // 150,000 basis points = $15.00
```

### Quick Reference

**To convert dollars to basis points for limit_price:**
```
basis_points = dollars × 10,000

Examples:
$1.00 → 10,000
$10.00 → 100,000
$14.95 → 149,500
$15.00 → 150,000
```

**To create tick ranges:**
```
tick_id = dollars × 100

Examples:
$14.90-$15.10 range → ticks 1490-1510
$0.95-$1.05 range → ticks 95-105
```

## 7. Common Scenarios

### Scenario A: Full Fill

```
Buy: 1000 ALEO @ $15.00
Sell: 1000 ALEO @ $14.95
→ Execute: 1000 ALEO @ $14.975
→ Both orders fully filled
```

### Scenario B: Partial Fill

```
Buy: 2000 ALEO @ $15.00
Sell: 800 ALEO @ $14.95
→ Execute: 800 ALEO @ $14.975
→ Sell order fully filled
→ Buy order: 1200 ALEO remaining (can be matched later)
```

### Scenario C: No Match

```
Buy: limit $14.50
Sell: limit $15.00
→ No execution (prices don't cross)
```

## 8. Testing

Run the test suite:

```bash
leo test
```

Tests cover:
- ✅ Order submission
- ✅ Price validation
- ✅ Tick range enforcement
- ✅ Matching logic
- ✅ Partial fills
- ✅ Order cancellation

## 9. Next Steps

### For Traders
1. Build a UI to submit orders
2. Deploy to testnet
3. Add wallet integration

### For Market Makers
1. Build off-chain matcher bot
2. Monitor tick overlaps
3. Earn matcher fees (0.05%)

### For Developers
1. Add token escrow
2. Implement fee distribution
3. Create liquidity dashboard

## 10. Tick Size Configuration

Adjust for different token price ranges:

```leo
// For tokens < $1
const TICK_SIZE: u64 = 10u64;  // $0.001 per tick

// For tokens $1-10 (default)
const TICK_SIZE: u64 = 100u64; // $0.01 per tick

// For tokens $10-100
const TICK_SIZE: u64 = 1000u64; // $0.10 per tick
```

## 11. Privacy Guarantees

### ❌ Attackers CANNOT see:
- Your exact limit price
- Your order size
- Your wallet address
- Your trading strategy

### ✅ Matchers CAN see:
- Tick ranges (e.g., $14.90-$15.10)
- Token pair (e.g., USDC/ALEO)
- Order timestamps

This balance enables efficient matching while preserving privacy.

## 12. Fee Structure (Future)

```
Total Trading Fee: 0.10%
├── Maker: -0.02% (rebate)
├── Taker: +0.12%
└── Matcher: 0.05%

Example $10,000 trade:
- Maker earns: $2 rebate
- Taker pays: $12 fee
- Matcher earns: $5 fee
```

## 13. Troubleshooting

### "Tick range too wide"
```
Error: range_width > MAX_TICK_RANGE
Solution: Keep tick range ≤ 50 ticks
Example: Instead of 1000-1100, use 1490-1510
```

### "Limit price outside tick range"
```
Error: limit_price not in [tick_min, tick_max]
Solution: Ensure limit price falls within your ticks
Example: For ticks 1490-1510, limit must be 149000-151100
```

### "Orders don't cross"
```
Error: buy_limit < sell_limit
Solution: Ensure buy price ≥ sell price
Example: Buy $15.00, Sell $14.95 ✅
         Buy $14.00, Sell $15.00 ❌
```

## 14. Advanced Features (Coming Soon)

- [ ] Stop-loss orders
- [ ] Iceberg orders (hidden quantity)
- [ ] Time-in-force (GTT, IOC, FOK)
- [ ] Dutch auction pricing
- [ ] Multi-hop routing

## 15. Useful Commands

```bash
# Build contract
leo build

# Run tests
leo test

# Deploy to testnet
leo deploy --network testnet

# Execute transition (interactive)
leo run submit_tick_order 1u64 true 1490u64 1510u64 100u32 15000u64 1000u64

# Check program info
leo info
```

## 16. Architecture Diagram

```
┌─────────────────────────────────────────┐
│            User Submits Order            │
│  "Buy 1000 ALEO between $14.90-$15.10"  │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│        Smart Contract (sl.aleo)         │
│  - Validates tick range                 │
│  - Encrypts exact price & quantity      │
│  - Returns TickOrder record             │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│        Off-Chain Matcher (Future)        │
│  - Scans tick overlaps                  │
│  - Finds: "Buy 1490-1510 ∩ Sell 1495-1505"
│  - Proposes match to contract           │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      Smart Contract settle_match()      │
│  - Verifies prices cross (in ZK)        │
│  - Calculates midpoint: $14.975         │
│  - Atomic swap                          │
│  - Pays matcher fee                     │
└─────────────────────────────────────────┘
```

## Resources

- [README.md](./README.md) - Full documentation
- [Docs.md](./Docs.md) - Technical specification
- [Leo Docs](https://docs.leo-lang.org) - Language reference

---

**Ready to trade privately? Start building!** 🚀
