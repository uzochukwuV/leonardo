# Aleo Wallet Integration Guide

## Overview

Pteaker uses the **Provable SDK** (Aleo's official JavaScript/TypeScript library) for real wallet connections. The wallet integration is now **production-ready** and connects directly to Aleo wallets like the Aleo Extension Wallet.

## Architecture

### Real Wallet Connection Flow

```
┌─────────────────────────────────────────────────────────┐
│             Browser Environment                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Pteaker Frontend (React)                       │  │
│  │  ├─ /hooks/use-aleo.ts (Wallet Hook)           │  │
│  │  ├─ /components/header.tsx (Connection UI)     │  │
│  │  └─ /components/wallet-provider.tsx (Global)   │  │
│  └──────────────────────────────────────────────────┘  │
│                    ↓                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Aleo Wallet Extension (window.aleo)           │  │
│  │  ├─ getAccounts()                               │  │
│  │  ├─ requestAccounts()                           │  │
│  │  ├─ requestViewKey()                            │  │
│  │  ├─ requestBulkTransactions(txns)              │  │
│  │  ├─ requestRecords(program)                     │  │
│  │  └─ signMessage(message)                        │  │
│  └──────────────────────────────────────────────────┘  │
│                    ↓                                     │
└─────────────────────────────────────────────────────────┘
                    ↓
        ┌───────────────────────────┐
        │   Aleo Network / Devnet   │
        │   ├─ Transaction Pool    │
        │   ├─ ZK Proof Verification│
        │   └─ State Updates        │
        └───────────────────────────┘
```

## Components

### 1. **useAleo Hook** (`/hooks/use-aleo.ts`)

The core hook that manages wallet connection and state:

```typescript
import { useAleo } from '@/hooks/use-aleo'

export function MyComponent() {
  const {
    account,           // { address, viewKey }
    connected,         // boolean
    loading,           // boolean
    error,             // string | null
    connectWallet,     // () => Promise<void>
    disconnectWallet,  // () => void
    executeTransaction,// (name, inputs) => Promise<{success, txId}>
    requestRecords,    // (program) => Promise<unknown[]>
    wallet             // Aleo wallet API (if available)
  } = useAleo()
}
```

#### Key Features:
- **Real wallet detection**: Checks for `window.aleo` (Aleo Extension Wallet)
- **Auto-reconnection**: Restores connection from localStorage if available
- **Development fallback**: Uses mock account if wallet not installed (for testing UI)
- **Event listeners**: Monitors account changes and disconnection events
- **Error handling**: Provides helpful error messages for wallet issues

### 2. **WalletProvider** (`/components/wallet-provider.tsx`)

Global provider component that:
- Initializes wallet detection on mount
- Listens for wallet account changes
- Handles wallet disconnection events
- Provides debug logging in development mode

Wrap your app with it:

```typescript
import { WalletProvider } from '@/components/wallet-provider'

export default function RootLayout({ children }) {
  return (
    <WalletProvider>
      {children}
    </WalletProvider>
  )
}
```

### 3. **Header Component** (`/components/header.tsx`)

User-facing wallet UI with:
- Connect/Disconnect button
- Account address display with copy-to-clipboard
- View key information
- Link to Aleo Explorer
- Error state display
- Navigation links

## Installation & Setup

### Step 1: Install Aleo Wallet Extension

1. Get the **Aleo Extension Wallet** from the official store
2. Create/import your Aleo account
3. Approve connection when Pteaker requests it

### Step 2: Install Dependencies

The SDK is lightweight and requires no additional packages beyond what's already used:

```bash
npm install
```

### Step 3: Configure Network (Optional)

For Devnet/Testnet, update the wallet extension settings to point to your network.

## Usage Examples

### Example 1: Connect Wallet

```typescript
import { useAleo } from '@/hooks/use-aleo'

export function ConnectButton() {
  const { connected, loading, connectWallet } = useAleo()

  return (
    <button onClick={connectWallet} disabled={loading}>
      {loading ? 'Connecting...' : 'Connect'}
    </button>
  )
}
```

### Example 2: Execute Transaction

```typescript
import { useAleo } from '@/hooks/use-aleo'

export function SubmitOrder() {
  const { account, executeTransaction } = useAleo()

  const handleSubmit = async () => {
    try {
      const result = await executeTransaction('submit_tick_order', {
        token_pair: 1,
        is_buy: true,
        tick_lower: 100,
        tick_upper: 120,
        limit_price: 1000,
        quantity: 500
      })
      
      console.log('Order submitted:', result.txId)
    } catch (error) {
      console.error('Failed to submit order:', error)
    }
  }

  return (
    <button onClick={handleSubmit} disabled={!account}>
      Submit Order
    </button>
  )
}
```

### Example 3: Request User Records

```typescript
const { requestRecords } = useAleo()

// Get all orders for the user
const orders = await requestRecords('sl.aleo')
console.log('User orders:', orders)
```

## Development Mode

If the Aleo Extension Wallet is not installed:

1. **UI testing**: Full UI works with mock account
2. **Transactions**: Simulated with `(Dev Mode)` prefix in console
3. **Install wallet later**: Real transactions work once wallet is installed

```
Connected Account: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5ev2m9
Status: Using development mode - install Aleo wallet for production
```

## Production Deployment

### Checklist

- [ ] Test with Aleo Extension Wallet installed
- [ ] Verify transactions execute on network (not just simulated)
- [ ] Test account switching in wallet
- [ ] Test disconnection and reconnection
- [ ] Verify error handling for network failures
- [ ] Test on target network (Mainnet/Testnet/Devnet)

### Environment Variables

Currently uses defaults. To customize network:

```env
# Optional: For custom Aleo network
NEXT_PUBLIC_ALEO_API_URL=https://api.aleo.org
```

## Transaction Execution

### Structure

Transactions follow the Aleo program format:

```typescript
const transaction = {
  type: 'transition',
  program: 'sl.aleo',           // Pteaker program ID
  function: 'submit_tick_order', // Leo function name
  inputs: [                       // Function parameters
    tokenPair,
    isBuy,
    tickLower,
    tickUpper,
    limitPrice,
    quantity
  ]
}

// Sent via: window.aleo.requestBulkTransactions([transaction])
```

## Privacy & Security

### What's Protected

1. **Private Order Details**: Limit price and quantity are encrypted
2. **User Account**: Only you see your connected address
3. **View Key**: Requested only when needed, never stored on server

### What's Public

1. **Tick Ranges**: Enable order matching
2. **Settlement Events**: Show that trades occurred
3. **Account Address**: On-chain transactions are visible

## Debugging

### Enable Debug Logging

The hook uses `console.log('[v0] ...')` for debug output:

```bash
# In browser console, filter for wallet logs:
console.log() with "[v0]" prefix shows wallet activity
```

### Common Issues

**Issue**: "Aleo wallet not detected"
- **Solution**: Install Aleo Extension Wallet and refresh

**Issue**: "No accounts authorized"
- **Solution**: Approve account connection when wallet prompts

**Issue**: Transaction rejected
- **Solution**: Check transaction parameters match Leo function signature

## API Reference

### useAleo() Hook

```typescript
interface AleoAccount {
  address: string      // Aleo address (aleo1...)
  viewKey: string      // Private view key for decryption
}

interface WalletState {
  account: AleoAccount | null
  connected: boolean
  loading: boolean
  error: string | null
}

interface WalletMethods {
  connectWallet(): Promise<void>
  disconnectWallet(): void
  executeTransaction(name: string, inputs: Record<string, unknown>): Promise<{success: boolean, txId: string}>
  requestRecords(program: string): Promise<unknown[]>
}

// Usage
const state = useAleo() // Returns WalletState & WalletMethods
```

## Resources

- [Provable SDK Documentation](https://developer.aleo.org/sdk)
- [Aleo Explorer](https://explorer.aleo.org)
- [Leo Language Guide](https://developer.aleo.org/leo)
- [Aleo Extension Wallet](https://www.aleo.org)

## Next Steps

1. **Install wallet**: Get the Aleo Extension Wallet
2. **Test connection**: Click "Connect Wallet" in Pteaker header
3. **Place order**: Submit a test order on Devnet
4. **View transactions**: Check Aleo Explorer for transaction details
5. **Monitor orders**: Track fills in "My Orders" dashboard
