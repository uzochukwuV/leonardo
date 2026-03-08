/**
 * Application Configuration
 */

export const config = {
  // Deployed contract program ID
  CONTRACT_PROGRAM_ID: 'private_orderbook_0000v8testnet.aleo',

  // Native ALEO credits token ID (0field = use credits.aleo)
  NATIVE_CREDITS_ID: '0field',

  // Circle test USDC token ID (1field = use test_usdc_token.aleo)
  CIRCLE_USDC_ID: '1field',

  // The program's on-chain Aleo address (derived from program ID).
  // Used as the `spender` argument in token_registry approve_public calls.
  PROGRAM_ADDRESS: 'aleo1wpqy7rm7zk0hly62gns6asza5pzehf2rjk4j9wms8ddwv3lzgvgq6d8x7h',

  // Network configuration
  NETWORK: 'testnet' as const,
  API_BASE_URL: 'https://api.explorer.provable.com/v1',
  EXPLORER_URL: 'https://explorer.provable.com',

  // Derived API URL
  get API_URL() {
    return `${this.API_BASE_URL}/${this.NETWORK}`;
  },

  // Aleo API base — Provable v2 API (api.provable.com/v2/{network}).
  // Routes: /blocks/latest/height, /blocks/height/{h}, /transactions/summary/latest,
  //         /program/{id}/mapping/{name}/{key}, /transaction/{id}
  ALEO_API_BASE: 'https://api.provable.com/v2/testnet',

  // Enable verbose client-side query logging
  DEBUG_QUERIES: true,

  // Transaction defaults
  DEFAULT_FEE: 100_000, // 0.1 credits in microcredits
  TX_POLL_INTERVAL: 3000, // Poll every 3 seconds
  TX_MAX_POLL_ATTEMPTS: 60, // Max 3 minutes of polling

  // Contract constants (must match smart contract)
  TICK_SIZE: 100, // 100 basis points = $0.01
  MAX_TICK_RANGE: 50, // Maximum 50 ticks
  SETTLER_FEE_BPS: 10, // 0.10% to settler
  PROTOCOL_FEE_BPS: 5, // 0.05% to treasury

  // Order book scanning
  SCAN_TICK_MIN: 1400, // Min tick ID to scan for order book display
  SCAN_TICK_MAX: 1600, // Max tick ID to scan
  SCAN_BATCH_SIZE: 20, // Ticks per batch when scanning
  ORDER_BOOK_REFRESH_INTERVAL: 15_000, // Refresh every 15 seconds

  // UI defaults
  DEFAULT_TOKEN_PAIR: 2, // ALEO/TKNB (pair 2 on testnet)
  BASE_PRICE: 15.0, // $15.00
  MAX_PRICE: 1000.0, // $1000.00
} as const;

export type Config = typeof config;
