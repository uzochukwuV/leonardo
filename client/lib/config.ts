/**
 * Application Configuration
 * Compatible with private_orderbook_v17.aleo
 */

export const config = {
  // Deployed contract program ID (v17)
  CONTRACT_PROGRAM_ID: 'private_orderbook_v17.aleo',

  // Native ALEO credits token ID (0field = use credits.aleo)
  NATIVE_CREDITS_ID: '0field',

  // Token registry program for ARC20 tokens
  TOKEN_REGISTRY_PROGRAM: 'token_registry.aleo',
  CREDITS_PROGRAM: 'credits.aleo',

  // Network configuration
  NETWORK: 'testnet' as const,
  API_BASE_URL: 'https://api.explorer.provable.com/v1',
  EXPLORER_URL: 'https://explorer.provable.com',

  get API_URL() {
    return `${this.API_BASE_URL}/${this.NETWORK}`;
  },

  ALEO_API_BASE: 'https://api.provable.com/v2/testnet',

  // Keeper bot API (for order book data)
  KEEPER_API_URL: process.env.NEXT_PUBLIC_KEEPER_API_URL || 'http://localhost:3002',

  DEBUG_QUERIES: true,

  // Transaction defaults
  DEFAULT_FEE: 100_000, // 0.1 credits in microcredits
  TX_POLL_INTERVAL: 3000,
  TX_MAX_POLL_ATTEMPTS: 60,

  // Contract constants (must match private_orderbook_v17.aleo)
  SETTLER_FEE_BPS: 10, // 0.10% to settler
  PROTOCOL_FEE_BPS: 5, // 0.05% to treasury

  // Price bounds (basis points)
  MIN_PRICE_BPS: 10000, // $1.00 minimum
  MAX_PRICE_BPS: 10000000, // $1000.00 maximum

  // Tick size default (basis points)
  TICK_SIZE: 100, // $0.01

  // Order book settings
  ORDER_BOOK_REFRESH_INTERVAL: 15_000,

  // UI defaults
  DEFAULT_TOKEN_PAIR: 2,
  BASE_PRICE: 15.0,
  MAX_PRICE: 1000.0,
} as const;

export type Config = typeof config;
