# Private Orderbook Keeper Bot v2

Automated keeper bot for the **Private Orderbook v17** on Aleo. Scans for orders, matches crossing bids/asks, and executes settlements — all while preserving order privacy.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRIVATE ORDERBOOK SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐         ┌──────────────────┐         ┌─────────────────┐  │
│  │   TRADER    │         │   ALEO CHAIN     │         │  KEEPER BOT     │  │
│  │   (User)    │         │   (On-Chain)     │         │  (This Bot)     │  │
│  └──────┬──────┘         └────────┬─────────┘         └────────┬────────┘  │
│         │                         │                            │           │
│         │  submit_buy_order()     │                            │           │
│         │  submit_sell_order()    │                            │           │
│         ├────────────────────────►│                            │           │
│         │                         │                            │           │
│         │◄────────────────────────┤  Order record (keeper)     │           │
│         │   Receipt record (user) │  ─────────────────────────►│           │
│         │                         │                            │           │
│         │                         │           Scan via Provable│           │
│         │                         │◄───────────────────────────┤           │
│         │                         │                            │           │
│         │                         │  settle_match()            │           │
│         │                         │◄───────────────────────────┤           │
│         │                         │                            │           │
│         │◄────────────────────────┤  SettlementProof (user)    │           │
│         │                         │                            │           │
│  ┌──────┴──────┐                  │                            │           │
│  │   WALLET    │                  │                            │           │
│  │ requestRecords()               │                            │           │
│  │ (View own receipts)            │                            │           │
│  └─────────────┘                  │                            │           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Privacy Model

**This is a PRIVATE orderbook.** Order details are never exposed publicly.

| What's Private | What's Public |
|----------------|---------------|
| Exact limit prices | That an order exists (encrypted) |
| Order quantities | Settlement events (not order details) |
| Trader identities | Keeper health status |
| Order timing | Network consensus |

### How Users See Their Orders

Users query their own records directly from their wallet:

```javascript
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';

const { requestRecords } = useWallet();

// Fetch user's receipts (only they can decrypt)
const records = await requestRecords('private_orderbook_v17.aleo', false);
```

The keeper bot does **NOT** expose order data via API.

## Keeper Bot Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEEPER BOT CYCLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. AUTH       │ POST /jwts/{consumerId} → Get JWT              │
│                │ (JWT in Authorization header)                  │
│                                                                 │
│  2. REGISTER   │ POST /scanner/testnet/register                 │
│                │ { view_key, start } → Returns UUID             │
│                │ (Saved to .keeper-state.json)                  │
│                                                                 │
│  3. SCAN       │ POST /scanner/testnet/records/owned            │
│                │ { uuid, programs: [...], records: [...] }      │
│                │ → Get Order & CancellationRequest records      │
│                                                                 │
│  4. DECRYPT    │ keeperAccount.decryptRecord(ciphertext)        │
│                │ → Extract order fields from plaintext          │
│                                                                 │
│  5. MATCH      │ Find crossing orders:                          │
│                │ buy.price >= sell.price                        │
│                │ buy.pairId === sell.pairId                     │
│                                                                 │
│  6. SETTLE     │ snarkos developer execute settle_match         │
│                │ (buy_order, sell_order, fill_qty, fill_price)  │
│                │ → Creates SettlementProof for both traders     │
│                                                                 │
│  7. CANCEL     │ Process CancellationRequest records            │
│                │ snarkos execute cancel_buy/sell_order          │
│                │ → Creates CancellationProof, refunds tokens    │
│                                                                 │
│  [Repeat every SCAN_INTERVAL]                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Record Types

| Record | Owner | Purpose |
|--------|-------|---------|
| **Order** | Keeper | Encrypted order data (price, qty, trader) |
| **Receipt** | Trader | Proof of order submission |
| **CancellationRequest** | Keeper | Request to cancel an order |
| **SettlementProof** | Trader | Proof of trade execution |
| **CancellationProof** | Trader | Proof of order cancellation + refund |

## Prerequisites

- **Node.js** 18+
- **snarkos** CLI installed and in PATH
- **ALEO credits** in the keeper wallet for transaction fees
- **Provable API credentials** for record scanning

## Setup

```bash
cd matcher
cp .env.example .env
# Edit .env with your keys
npm install
```

## Configuration

```env
# Required
PRIVATE_KEY=APrivateKey1zkp...     # Keeper private key
PROVABLE_API_KEY=your-api-key      # From Provable console
PROVABLE_CONSUMER_ID=your-uuid     # From Provable console

# Optional
SCANNER_START_BLOCK=15040000       # Block to start scanning from
ORDERBOOK_PROGRAM=private_orderbook_v17.aleo
SCAN_INTERVAL=30000                # Scan interval (ms)
MATCH_INTERVAL=10000               # Match interval (ms)
API_PORT=3002                      # Health API port
```

## Run

```bash
npm start
```

## API Endpoints

The keeper exposes minimal endpoints for monitoring only:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Keeper status (no order data) |
| `/api/stats` | GET | Aggregated stats only |

**Note:** Order data is private. Users query records via their wallet.

## State Persistence

The bot saves state to `.keeper-state.json`:

```json
{
  "uuid": "scanner-uuid-from-registration",
  "settledOrderIds": ["order1field", "order2field"]
}
```

This prevents:
- Re-registering the view key on restart
- Re-processing already settled orders

## Contract Functions

The keeper interacts with these v17 functions:

| Function | Description |
|----------|-------------|
| `settle_match` | Match buy + sell orders, transfer tokens |
| `cancel_buy_order` | Cancel buy, refund quote tokens to trader |
| `cancel_sell_order` | Cancel sell, refund base tokens to trader |

## Settlement Flow

```
Buy Order:  price=1.0500, qty=100 ALEO, escrow=105 USDC
Sell Order: price=1.0400, qty=100 ALEO, escrow=100 ALEO

Match at midpoint: (1.0500 + 1.0400) / 2 = 1.0450

Buyer receives:  100 ALEO
Seller receives: 104.50 USDC - fees
Keeper fee:      0.10% (settler)
Protocol fee:    0.05% (treasury)
```

## Files

```
matcher/
├── orderbook-keeper.mjs    # Main keeper bot (v2)
├── record-scanner.mjs      # Legacy scanner class (deprecated)
├── chain-scanner.mjs       # Fallback chain scanner
├── .env.example            # Configuration template
├── .keeper-state.json      # Persisted state (auto-created)
└── package.json
```

## Frontend Integration

The frontend uses wallet's `requestRecords()` to fetch user records:

```typescript
// hooks/use-user-orders.ts
const records = await wallet.adapter.requestRecords(
  'private_orderbook_v17.aleo',
  false  // unspent only
);

// Filter for Receipt, SettlementProof, CancellationProof
```

No API calls to the keeper bot are needed for viewing orders.

## Troubleshooting

**Scanner returns empty arrays:**
- Check `SCANNER_START_BLOCK` is before order creation blocks
- Ensure view key matches the keeper's private key
- Wait for scanner to index (may take a few minutes on first run)

**JWT errors:**
- JWT is in the `Authorization` header, not response body
- Format: `Bearer <token>`

**Settlement fails:**
- Ensure keeper has enough ALEO for gas
- Check that both orders have valid plaintext data
- Verify treasury address is set in contract

## License

MIT
