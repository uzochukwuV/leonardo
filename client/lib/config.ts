/**
 * Application Configuration
 */

export const config = {
  // Deployed contract program ID
  CONTRACT_PROGRAM_ID: 'private_orderbook_v1.aleo',

  // Network configuration
  NETWORK: 'testnet' as const,

  // Transaction defaults
  DEFAULT_FEE: 100_000, // 0.1 credits in microcredits

  // Contract constants (must match smart contract)
  TICK_SIZE: 100, // 100 basis points = $0.01
  MAX_TICK_RANGE: 50, // Maximum 50 ticks
  MATCHER_FEE_BPS: 5, // 0.05%
  TRADING_FEE_BPS: 10, // 0.10%

  // UI defaults
  DEFAULT_TOKEN_PAIR: 1, // ALEO/USDC
  BASE_PRICE: 15.0, // $15.00
  MAX_PRICE: 1000.0, // $1000.00
} as const;

export type Config = typeof config;
