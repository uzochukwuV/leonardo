# Record Scanner Service Setup Guide
{
  "consumer": {
    "id": "30474757-787a-46fb-ac6d-7fa752d92c50"
  },
  "created_at": 1773338431,
  "id": "11d19fc7-6b6e-4d74-833b-881712cb7941",
  "key": "pif7WoiyA4mC0zYUMWPCyumlTFbQTsxe"
}
## Prerequisites

1. **Provable SDK**: Install the SDK for your network
   ```bash
   npm install @provablehq/sdk
   ```

2. **Private Key**: Your keeper's private key (must be the orchestrator)

## Step-by-Step Setup

### 1. Get Provable API Credentials

#### Option A: Provable Console (Recommended)
1. Visit https://console.provable.com
2. Sign up or log in
3. Navigate to **"API Keys"** or **"Consumers"**
4. Click **"Create New Consumer"** or **"Create API Key"**
5. Name it: `"Orderbook Matcher Bot"`
6. Copy the credentials:
   - **Consumer ID**: `consumer_abc123xyz`
   - **API Key**: `pk_live_abc123xyz` or `pk_test_abc123xyz`

The RSS uses JWT authentication. The `ProvableClient` will automatically exchange your API Key + Consumer ID for a JWT token when making RSS requests.

### 2. Extract View Key from Private Key

Run the extraction utility:
```bash
# Make sure your PRIVATE_KEY is in .env first
echo "PRIVATE_KEY=APrivateKey1zkp..." > .env
echo "NETWORK=testnet" >> .env

# Extract view key
node extract-viewkey.mjs
```

**Expected Output:**
```
✅ Extraction successful!

📋 Account Information:
   Address: aleo1abc123...
   Private Key: APrivateKey1zkp...
   View Key: AViewKey1abc123...

📝 Add this to your .env file:
VIEW_KEY=AViewKey1abc123...
```

### 3. Configure Environment Variables

Update your `.env` file:
```bash
# ── Orchestrator Keys (REQUIRED) ──────────────────────────────
PRIVATE_KEY=APrivateKey1zkp...
VIEW_KEY=AViewKey1abc123...

# ── Record Scanner Service (ENHANCED MATCHING) ──────────────
USE_RECORD_SCANNER=true
RSS_API_KEY=pk_test_abc123xyz
RSS_CONSUMER_ID=consumer_abc123xyz

# ── Legacy Fallback (BACKUP) ─────────────────────────────────
PROVABLE_CONSUMER_ID=consumer_abc123xyz  
PROVABLE_API_KEY=pk_test_abc123xyz

# ── Program Configuration ─────────────────────────────────────
ORDERBOOK_PROGRAM=private_orderbook_v17.aleo
NETWORK=testnet
NETWORK_ID=1

# ── Optional Performance Tuning ──────────────────────────────
SCAN_INTERVAL=30000
MATCH_INTERVAL=10000
API_PORT=3002
```

### 4. Test RSS Setup

Run the comprehensive test:
```bash
node TEST_RSS_SCENARIO.mjs
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════╗
║           Record Scanner Service Test                       ║
╚════════════════════════════════════════════════════════════╝

[RSS] Registering view key with Record Scanner Service...
[RSS] Got ephemeral public key: key_xyz789
[RSS] Attempting encrypted registration...
[RSS] ✅ Encrypted registration successful
[RSS] UUID: rss-uuid-12345

✅ All tests completed successfully!

📊 Summary:
  - Order records discovered: 15
  - Cancellation requests: 2
  - Potential matches: 3
  - Record Scanner Service: ✅ Working
```

### 5. Start Enhanced Matcher Bot

```bash
node orderbook-keeper.mjs
```

**Expected Startup:**
```
╔════════════════════════════════════════════════════════════╗
║        Private Orderbook Keeper Bot v1 (v17)               ║
║             Enhanced with Record Scanner Service            ║
╚════════════════════════════════════════════════════════════╝

[BOT] Program: private_orderbook_v17.aleo
[BOT] Network: testnet
[BOT] Record Scanner: ENABLED
[BOT] Initializing Record Scanner Service...
[RSS] ✅ Encrypted registration successful
[BOT] ✅ Record Scanner Service initialized successfully
[BOT] RSS UUID: rss-uuid-12345
[API] ✅ HTTP server listening on port 3002
[BOT] ✅ Running. Ctrl+C to stop.
```

## Verification Steps

### 1. Check RSS Status
```bash
curl http://localhost:3002/api/rss/status
```
**Expected Response:**
```json
{
  "enabled": true,
  "initialized": true,
  "uuid": "rss-uuid-12345",
  "network": "testnet", 
  "lastScanTime": "2024-03-12T10:30:00Z",
  "registered": true
}
```

### 2. Test Best Match Finding
```bash
curl -X POST http://localhost:3002/api/rss/find-matches
```
**Expected Response:**
```json
{
  "matchCount": 2,
  "matches": [
    {
      "buyOrderId": "12345field",
      "sellOrderId": "67890field",
      "fillQuantity": "1000000",
      "fillPrice": "50000", 
      "score": 125.75
    }
  ]
}
```

### 3. Monitor Enhanced Health
```bash
curl http://localhost:3002/health
```
**Look for:**
```json
{
  "status": "ok",
  "recordScanner": {
    "enabled": true,
    "initialized": true,
    "status": { "uuid": "rss-uuid-12345", "registered": true }
  }
}
```

## Common Issues & Solutions

### ❌ **View Key Extraction Failed**
```
Error: Invalid private key format
```
**Solution:**
- Check private key starts with `APrivateKey1zkp`
- Ensure NETWORK matches key network (testnet/mainnet)
- Install SDK: `npm install @provablehq/sdk`

### ❌ **RSS Registration Failed: 401 Unauthorized**
```
❌ Registration failed: 401 - Unauthorized
```
**Solution:**
- Verify RSS_API_KEY and RSS_CONSUMER_ID
- Check credentials at https://console.provable.com
- Ensure using correct environment (test vs live keys)

### ❌ **SDK Import Error**
```
Provable SDK not available for encryption
```
**Solution:**
```bash
npm install @provablehq/sdk
# Or if using specific network:
npm install @provablehq/sdk@latest
```

### ❌ **No Records Found**
```
📊 Found 0 Order records
```
**Possible Causes:**
- No orders exist for this keeper/program
- VIEW_KEY doesn't match PRIVATE_KEY
- Wrong ORDERBOOK_PROGRAM ID
- Program has no Order records yet

**Debug Steps:**
```bash
# 1. Verify account derivation
node extract-viewkey.mjs

# 2. Check program exists
curl "https://api.provable.com/v2/testnet/program/private_orderbook_v17.aleo"

# 3. Enable debug logging
DEBUG=1 node orderbook-keeper.mjs
```

### ❌ **Network Mismatch**
```
Error: Network mismatch in SDK import
```
**Solution:**
- Set `NETWORK=testnet` or `NETWORK=mainnet` in .env
- Use matching private key for the network
- Verify program exists on the target network

## Advanced Configuration

### Custom RSS Endpoints
```bash
# Override default RSS endpoints (advanced)
RSS_BASE_URL=https://custom-scanner.example.com/scanner
SCANNER_START_BLOCK=15000000
```

### Performance Optimization
```bash
# Increase scanning frequency for active markets
SCAN_INTERVAL=15000    # 15 seconds (default: 30s)
MATCH_INTERVAL=5000    # 5 seconds (default: 10s) 

# Reduce for lower activity
SCAN_INTERVAL=60000    # 1 minute
MATCH_INTERVAL=30000   # 30 seconds
```

### Fallback Configuration
```bash
# Always use legacy scanning (disable RSS)
USE_RECORD_SCANNER=false

# Use RSS with aggressive fallback
RSS_RETRY_ATTEMPTS=3
RSS_TIMEOUT_MS=30000
```

## Security Best Practices

1. **Private Keys**: Never commit to version control
2. **Environment Files**: Use `.env` files, not hardcoded values
3. **Network Separation**: Use testnet for development
4. **Key Rotation**: Regularly rotate API keys
5. **Access Control**: Limit API key permissions where possible

## Production Deployment

### Environment Variables (Production)
```bash
# Production settings
NETWORK=mainnet
USE_RECORD_SCANNER=true
PRIVATE_KEY=APrivateKey1zkp...    # Production keeper key
VIEW_KEY=AViewKey1...             # Extracted from production key
RSS_API_KEY=pk_live_...           # Production API key
RSS_CONSUMER_ID=consumer_...      # Production consumer

# Performance tuning for production
SCAN_INTERVAL=20000               # 20 seconds
MATCH_INTERVAL=8000               # 8 seconds
API_PORT=3002

# Security
FRONTEND_ORIGIN=https://yourdapp.com
```

### Monitoring
```bash
# Health check endpoint
curl -f http://localhost:3002/health || exit 1

# RSS status monitoring
curl -s http://localhost:3002/api/rss/status | jq '.initialized'

# Log monitoring (look for these patterns)
grep "✅" matcher.log    # Successful operations
grep "❌" matcher.log    # Errors requiring attention  
grep "[RSS]" matcher.log # RSS-specific activities
```

---

🎉 **Setup Complete!** Your matcher bot now uses comprehensive Record Scanner Service for enhanced order discovery and optimal matching algorithms.