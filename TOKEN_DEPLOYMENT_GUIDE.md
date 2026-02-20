# Token Deployment Guide for Testing

## Quick Decision: Which Path to Take?

### Path A: Testing Mode (5 minutes) ✅ RECOMMENDED
- ✅ No tokens needed
- ✅ Start testing immediately
- ✅ Test all order book functionality
- ⚠️ No real token transfers

**Use this if:** You want to test order matching, UI, and order book logic quickly

### Path B: Deploy Test Token (30 minutes + 100M credits)
- ✅ Full end-to-end testing with real tokens
- ✅ Test escrow functionality
- ⚠️ Requires deploying token contract (~100M credits)
- ⚠️ More complex setup

**Use this if:** You want to test the complete flow including token escrow

---

## Path A: Testing Mode (No Tokens) - Quick Start

### Step 1: Deploy Order Book Contract

```bash
cd sl

# Build
leo build

# Deploy
leo deploy
```

**Cost:** ~100M credits (for namespace) + fees

### Step 2: Register Token Pair with Placeholder IDs

```bash
# Register ALEO/USDC as pair 1 with placeholder token IDs
leo execute register_token_pair \
    1u64 \
    1field \
    2field \
    100u64
```

**Explanation:**
- `1u64` - Pair ID (ALEO/USDC)
- `1field` - Base token ID (placeholder for ALEO)
- `2field` - Quote token ID (placeholder for USDC)
- `100u64` - Tick size (0.01 = 1 cent)

**Cost:** ~5,000 credits

### Step 3: Submit Test Orders

```bash
# Submit a buy order
leo execute submit_tick_order \
    1u64 \
    true \
    1495u64 \
    1505u64 \
    $(date +%s)u32 \
    150000u64 \
    100000000u64
```

**Parameters:**
- `1u64` - Token pair ID (ALEO/USDC)
- `true` - Is buy order
- `1495u64` - Tick lower ($14.95)
- `1505u64` - Tick upper ($15.05)
- `$(date +%s)u32` - Current timestamp
- `150000u64` - Limit price ($15.00 in basis points)
- `100000000u64` - Quantity (100 ALEO with 6 decimals)

**Cost:** ~5,000-10,000 credits per order

### Step 4: Test with Frontend

Update `client/lib/config.ts` with your deployed contract ID:
```typescript
export const config = {
  CONTRACT_PROGRAM_ID: 'private_orderbook_v1.aleo', // Your deployed ID
  // ...
}
```

Then submit orders through the UI!

---

## Path B: Deploy Test Token - Full Setup

I've created a simple test token for you in `test_token/` directory.

### Step 1: Build the Test Token

```bash
cd test_token

# Build
leo build
```

Expected output:
```
✅ Compiled 'test_usdc.aleo' into Aleo instructions.
```

### Step 2: Deploy Test Token

```bash
leo deploy
```

**Cost:** ~100M credits (namespace) + fees

After deployment, note the **transaction ID** and **program ID**.

### Step 3: Get the Token ID

The token ID is a `field` type derived from the program address.

**Option A: Calculate from program address**
```bash
# Query the deployed program
snarkos developer execute --query test_usdc.aleo
```

**Option B: Use placeholder for testing**
```
test_usdc.aleo token ID ≈ 2field (for testing)
```

### Step 4: Mint Test Tokens to Yourself

```bash
# Mint 1 million USDC to your address
leo execute mint \
    <YOUR_ADDRESS> \
    1000000000000u64
```

**Parameters:**
- `<YOUR_ADDRESS>` - Your Aleo address (from wallet)
- `1000000000000u64` - Amount (1M USDC with 6 decimals)

This creates a `Token` record in your wallet!

### Step 5: Deploy Order Book Contract

```bash
cd ../sl

# Build and deploy
leo build
leo deploy
```

### Step 6: Register Token Pair with Real Token ID

```bash
# Register ALEO/USDC with actual token ID
leo execute register_token_pair \
    1u64 \
    1field \
    2field \
    100u64
```

**Note:** Replace `2field` with actual USDC token ID if needed

### Step 7: Submit Order with Escrow

Now you can use `submit_tick_order_with_escrow`:

```bash
leo execute submit_tick_order_with_escrow \
    1u64 \
    true \
    1495u64 \
    1505u64 \
    $(date +%s)u32 \
    150000u64 \
    100000000u64 \
    <YOUR_TOKEN_RECORD>
```

**Note:** `<YOUR_TOKEN_RECORD>` is the Token record from the mint transaction

---

## Getting Token Records

### Method 1: From Leo Wallet

After minting, check your wallet:
```bash
leo wallet records
```

Look for records of type `Token` with the correct `token_id`.

### Method 2: From Transaction Output

When you mint tokens, the transaction output includes the record:
```json
{
  "owner": "aleo1...",
  "amount": "1000000000000u64",
  "token_id": "2field",
  "external_authorization_required": "false",
  "authorized_until": "0u32"
}
```

Copy this entire record to use in escrow orders.

---

## Cost Breakdown

### Path A (Testing Mode):
- Order book deployment: ~100M credits (one-time)
- Register pair: ~5K credits per pair
- Submit orders: ~5-10K credits per order
- **Total to start testing:** ~100M credits

### Path B (Full Setup):
- Test token deployment: ~100M credits
- Order book deployment: ~100M credits
- Register pair: ~5K credits
- Mint tokens: ~5K credits
- Submit escrow orders: ~10-15K credits per order
- **Total to start testing:** ~200M+ credits

---

## Recommended Testing Flow

### Week 1: Testing Mode
1. Deploy order book
2. Register 1-2 pairs with placeholders
3. Submit multiple test orders
4. Test frontend integration
5. Test order book display
6. Test matching logic (with matcher service)

### Week 2: Full Token Integration
1. Deploy test USDC token
2. Mint tokens to test accounts
3. Update pairs with real token IDs
4. Test escrow orders
5. Test full settlement flow
6. Test with multiple users

---

## Alternative: Use Existing Tokens

Instead of deploying your own token, you can look for existing test tokens on Aleo testnet:

```bash
# Search Aleo Explorer for existing token programs
curl https://api.explorer.aleo.org/v1/testnet/programs | grep token
```

If you find existing tokens (like `usdc_test.aleo`), you can:
1. Use their token ID in your pair registration
2. Request test tokens from faucet (if available)
3. Skip token deployment entirely

---

## Test Token Features

The test token I created (`test_usdc.aleo`) has:

✅ **Mint** - Create new tokens for testing
✅ **Transfer** - Send tokens between addresses
✅ **Split** - Divide token records
✅ **Join** - Combine token records

**Token ID:** `2field` (hardcoded for consistency)

This is compatible with your order book's `Token` record structure.

---

## Troubleshooting

### "Not enough credits"
Get more testnet credits from:
- Aleo Faucet: https://faucet.aleo.org
- Request from Aleo community

### "Token record not found"
After minting, wait 2-5 minutes for blockchain confirmation before using tokens.

### "Token ID mismatch"
Make sure the token ID in your pair registration matches the token's actual ID.

### "Pair not found"
Register the token pair before submitting orders. Check with:
```bash
# Query pair mapping
curl https://api.explorer.aleo.org/v1/testnet/program/<YOUR_PROGRAM>/mapping/token_pairs
```

---

## Quick Commands Reference

```bash
# Deploy order book
cd sl && leo deploy

# Register pair (testing mode)
leo execute register_token_pair 1u64 1field 2field 100u64

# Submit order (testing mode)
leo execute submit_tick_order 1u64 true 1495u64 1505u64 $(date +%s)u32 150000u64 100000000u64

# Deploy test token
cd test_token && leo deploy

# Mint test tokens
leo execute mint <YOUR_ADDRESS> 1000000000000u64

# Check wallet records
leo wallet records
```

---

## Summary

**For immediate testing:** Use Path A (testing mode)
- Fast setup
- Low cost
- Tests 90% of functionality

**For production-ready testing:** Use Path B (full setup)
- Complete end-to-end flow
- Real token transfers
- Tests escrow mechanism

**Recommended:** Start with Path A, move to Path B once core functionality is working.

Good luck! 🚀
