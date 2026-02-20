/**
 * Application Configuration
 */

export const config = {
  // Deployed contract program ID
  CONTRACT_PROGRAM_ID: 'private_orderbook_v4.aleo',

  // The program's on-chain Aleo address (derived from program ID).
  // Used as the `spender` argument in token_registry approve_public calls.
  PROGRAM_ADDRESS: 'aleo1wpqy7rm7zk0hly62gns6asza5pzehf2rjk4j9wms8ddwv3lzgvgq6d8x7h',

  // Network configuration
  NETWORK: 'testnet' as const,

  // Aleo API base — Provable v2 API (api.provable.com/v2/{network}).
  // Routes: /blocks/latest/height, /blocks/height/{h}, /transactions/summary/latest,
  //         /program/{id}/mapping/{name}/{key}, /transaction/{id}
  ALEO_API_BASE: 'https://api.provable.com/v2/testnet',

  // Enable verbose client-side query logging
  DEBUG_QUERIES: true,

  // Transaction defaults
  DEFAULT_FEE: 100_000, // 0.1 credits in microcredits

  // Contract constants (must match smart contract)
  TICK_SIZE: 100, // 100 basis points = $0.01
  MAX_TICK_RANGE: 50, // Maximum 50 ticks
  SETTLER_FEE_BPS: 10, // 0.10% to settler
  PROTOCOL_FEE_BPS: 5, // 0.05% to treasury

  // UI defaults
  DEFAULT_TOKEN_PAIR: 2, // ALEO/USDC (pair 2 on testnet; pair 1 uses different admin's tokens)
  BASE_PRICE: 15.0, // $15.00
  MAX_PRICE: 1000.0, // $1000.00
} as const;

export type Config = typeof config;
