# Leonardo - Private Order Book on Aleo

A fully private, zero-knowledge order book built on the Aleo blockchain. Trade tokens with complete privacy - your order details remain encrypted and invisible to other market participants.

## What is Leonardo?

Leonardo is a decentralized exchange (DEX) that uses Aleo's zero-knowledge proof technology to create a **truly private trading experience**. Unlike traditional order books where everyone can see pending orders, Leonardo encrypts all order details, preventing front-running and protecting trader privacy.

### Key Features

- **Complete Order Privacy**: Order prices, quantities, and trader identities are encrypted
- **Zero-Knowledge Matching**: Orders are matched using ZK proofs without revealing details
- **No Front-Running**: Since orders are private, MEV bots cannot front-run your trades
- **On-Chain Settlement**: All settlements happen on-chain with cryptographic proofs
- **Receipt-Based System**: Traders receive cryptographic receipts as proof of their orders

## Architecture

```
+-------------------+     +------------------+     +------------------+
|                   |     |                  |     |                  |
|   Web Frontend    |---->|  Aleo Blockchain |<----|   Keeper Bot     |
|   (Next.js)       |     |  (Leo Contract)  |     |   (Node.js)      |
|                   |     |                  |     |                  |
+-------------------+     +------------------+     +------------------+
        |                         |                        |
        v                         v                        v
  - Place Orders            - Order Records          - Scan Orders
  - View Receipts           - Receipt Records        - Match Orders
  - Cancel Orders           - Settlement Proofs      - Execute Settlements
```

### Components

1. **Smart Contract** (`sl/`) - Leo program implementing the private order book
2. **Web Frontend** (`client/`) - Next.js application for trading
3. **Keeper Bot** (`matcher/`) - Automated order matching and settlement service

## How It Works

### The Privacy Model

| Private (Encrypted) | Public (Visible) |
|---------------------|------------------|
| Order prices | That an order exists |
| Order quantities | Settlement events |
| Trader identities | Protocol fees |
| Order timing | Network consensus |

### Order Flow

1. **Place Order**: User submits a buy or sell order
   - Order is encrypted and stored as a record owned by the Keeper
   - User receives a Receipt record as proof

2. **Matching**: Keeper scans for crossing orders
   - Buy price >= Sell price triggers a match
   - Matching happens off-chain, settlement on-chain

3. **Settlement**: Keeper executes the trade
   - Tokens are transferred atomically
   - Both traders receive SettlementProof records
   - Fees are distributed to protocol treasury

4. **Cancellation**: Two-step process
   - User requests cancellation with their Receipt
   - Keeper processes and returns escrowed tokens

## Technology Stack

- **Blockchain**: Aleo (L1 with native ZK)
- **Smart Contract**: Leo (Aleo's ZK programming language)
- **Frontend**: Next.js 14, TypeScript, TailwindCSS
- **Wallet**: Provable/Puzzle Wallet Adapters
- **Keeper**: Node.js with Provable SDK

## Getting Started

### Prerequisites

- Node.js 18+
- An Aleo wallet (Leo Wallet, Puzzle, or Provable)
- ALEO tokens for gas fees
- Quote tokens (TKNB, USDC, etc.) for trading

### Installation

```bash
# Clone the repository
git clone https://github.com/uzochukwuV/leonardo.git
cd leonardo

# Install frontend dependencies
cd client
npm install
cp .env.example .env.local
# Edit .env.local with your configuration
npm run dev

# Install keeper dependencies (separate terminal)
cd ../matcher
npm install
cp .env.example .env
# Edit .env with your keeper credentials
npm start
```

### Configuration

#### Frontend (.env.local)
```env
NEXT_PUBLIC_KEEPER_API_URL=http://localhost:3002
NEXT_PUBLIC_ALEO_NETWORK=testnet
NEXT_PUBLIC_CONTRACT_PROGRAM_ADDRESS=aleo1...  # Required for buy orders
```

#### Keeper (.env)
```env
PRIVATE_KEY=APrivateKey1zkp...     # Keeper wallet
PROVABLE_API_KEY=your-api-key
PROVABLE_CONSUMER_ID=your-id
ORDERBOOK_PROGRAM=private_orderbook_v17.aleo
```

## Project Structure

```
leonardo/
+-- client/                 # Next.js frontend
|   +-- app/               # App router pages
|   +-- components/        # React components
|   +-- hooks/             # Custom React hooks
|   +-- lib/               # Utilities and config
+-- matcher/               # Keeper bot service
|   +-- orderbook-keeper.mjs
|   +-- README.md
+-- sl/                    # Smart contract
|   +-- src/main.leo       # Contract source
|   +-- demo_v17.sh        # Demo script
+-- README.md
```

## Smart Contract (v17)

### Record Types

| Record | Owner | Purpose |
|--------|-------|---------|
| Order | Keeper | Encrypted order details |
| Receipt | Trader | Proof of order submission |
| SettlementProof | Trader | Proof of trade execution |
| CancellationRequest | Keeper | Request to cancel |
| CancellationProof | Trader | Proof of cancellation |

### Supported Token Pairs

- ALEO/USDC (Pair 1)
- ALEO/TKNB (Pair 2) - Active on testnet
- ALEO/TKNA (Pair 3) - Active on testnet
- TKNA/TKNB (Pair 4) - Active on testnet

## Why Privacy Matters

Traditional order books suffer from:

1. **Front-Running**: Bots see pending orders and trade ahead
2. **Information Leakage**: Order flow reveals trading strategies
3. **Sandwich Attacks**: Attackers profit from knowing your orders

Leonardo solves these by making orders cryptographically invisible until settlement.

## Development

### Running Tests

```bash
# Contract tests
cd sl
leo test

# Frontend type checking
cd client
npm run typecheck
```

### Deploying Contract

```bash
cd sl
leo deploy --network testnet
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## Security

- This is experimental software on testnet
- Do not use with significant funds
- Smart contracts have not been formally audited

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [Aleo Documentation](https://developer.aleo.org)
- [Leo Language](https://leo-lang.org)
- [Provable SDK](https://provable.com)

---

Built with privacy in mind on Aleo.
