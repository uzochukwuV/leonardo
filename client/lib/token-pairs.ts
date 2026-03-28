/**
 * Token Pair Registry (Static Fallback)
 *
 * This file contains static token pair definitions used as a fallback when
 * dynamic data is not available. For production, prefer using the dynamic
 * hooks which fetch data directly from the blockchain:
 *
 *   import { useTradingPairs, useTradingPair } from '@/hooks/use-trading-pairs';
 *
 * The dynamic hooks:
 *   1. Fetch pair info from private_matching_orderbook_v1.aleo/token_pairs mapping
 *   2. Fetch token metadata from token_registry.aleo/registered_tokens mapping
 *   3. Combine to create full TradingPair objects with real on-chain data
 *
 * Static definitions here should match on-chain registrations for consistency.
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  tokenId: string; // On-chain token_id (field literal), e.g. "1field"
  icon?: string;
  color?: string;
  isNative?: boolean; // true = native ALEO credits (uses credits.aleo)
  isCircleUsdc?: boolean; // true = Circle's test USDC (uses test_usdc_token.aleo)
  programId?: string; // Direct program import (e.g., "test_usdc_token.aleo")
}

export interface TokenPair {
  id: number; // On-chain identifier (u64)
  name: string; // Display name
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  tickSize: number; // In basis points (100 = $0.01)
  minPrice: number; // Minimum allowed price in basis points
  maxPrice: number; // Maximum allowed price in basis points
  maxTickRange: number; // Maximum tick range users can specify
  active: boolean; // Whether this pair is available for trading
}

// Token definitions
export const TOKENS: Record<string, TokenInfo> = {
  ALEO: {
    symbol: 'ALEO',
    name: 'Aleo',
    decimals: 6,
    // Native ALEO credits: 0field = uses credits.aleo (not token_registry)
    tokenId: '0field',
    icon: '🅰️',
    color: '#00D4AA',
    isNative: true, // Flag for native credits
  } as TokenInfo & { isNative?: boolean },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin (Circle)',
    decimals: 6,
    // Circle's test USDC: uses test_usdc_token.aleo (1field marker)
    tokenId: '1field',
    icon: '💵',
    color: '#2775CA',
    isCircleUsdc: true,
    programId: 'test_usdc_token.aleo',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    tokenId: 'usdt.aleo',
    icon: '💲',
    color: '#26A17B',
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    tokenId: 'wbtc.aleo',
    icon: '₿',
    color: '#F7931A',
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ethereum',
    decimals: 18,
    tokenId: 'weth.aleo',
    icon: '♦️',
    color: '#627EEA',
  },
  TOKEN_A: {
    symbol: 'TKNA',
    name: 'Token A',
    decimals: 6,
    tokenId: '7001field',
    icon: '🅰️',
    color: '#FF6B6B',
  },
  TOKEN_B: {
    symbol: 'TKNB',
    name: 'Token B',
    decimals: 6,
    tokenId: '7002field',
    icon: '🅱️',
    color: '#4ECDC4',
  },
  USDCX: {
    symbol: 'USDCx',
    name: 'Bridged USDC',
    decimals: 6,
    tokenId: '7000field',
    icon: '💲',
    color: '#2775CA',
    programId: 'test_usdcx_stablecoin.aleo',
  },
};

// Token pair configurations
export const TOKEN_PAIRS: Record<number, TokenPair> = {
  1: {
    id: 1,
    name: 'ALEO/USDC',
    baseToken: TOKENS.ALEO,
    quoteToken: TOKENS.USDC,
    tickSize: 100, // $0.01
    minPrice: 10000, // $1.00
    maxPrice: 10000000, // $1000.00
    maxTickRange: 50, // 50 ticks = $0.50 range
    active: true, // Pair 1 on testnet uses 1field/2field tokens owned by different admin
  },
  2: {
    id: 2,
    name: 'ALEO/TKNB',
    baseToken: TOKENS.ALEO,
    quoteToken: TOKENS.TOKEN_B,
    tickSize: 100, // $0.01
    minPrice: 10000, // $1.00
    maxPrice: 10000000, // $1000.00
    maxTickRange: 50,
    active: true,
  },
  3: {
    id: 3,
    name: 'ALEO/TKNA',
    baseToken: TOKENS.ALEO,
    quoteToken: TOKENS.TOKEN_A,
    tickSize: 100, // $0.01
    minPrice: 10000, // $1.00
    maxPrice: 10000000, // $1000.00
    maxTickRange: 50,
    active: true,
  },
  4: {
    id: 4,
    name: 'TKNA/TKNB',
    baseToken: TOKENS.TOKEN_A,
    quoteToken: TOKENS.TOKEN_B,
    tickSize: 100, // $0.01
    minPrice: 10000, // $1.00
    maxPrice: 10000000, // $1000.00
    maxTickRange: 50,
    active: true,
  },
};

/**
 * Get a token pair by ID
 */
export function getTokenPair(id: number): TokenPair | undefined {
  return TOKEN_PAIRS[id];
}

/**
 * Get all active token pairs
 */
export function getAllActiveTokenPairs(): TokenPair[] {
  return Object.values(TOKEN_PAIRS).filter((p) => p.active);
}

/**
 * Get token by symbol
 */
export function getToken(symbol: string): TokenInfo | undefined {
  return TOKENS[symbol];
}

/**
 * Calculate escrow amount required for an order.
 * Accepts and returns bigint to match the contract's u128 arithmetic.
 *
 * - Buy  order: escrows quote token → quantity * limitPriceBps / 10000
 * - Sell order: escrows base token  → quantity (raw units)
 */
export function calculateEscrowAmount(
  isBuy: boolean,
  quantity: bigint,
  limitPriceBps: bigint
): bigint {
  if (isBuy) {
    // Buyer escrows quote currency (e.g., USDC)
    // escrow = quantity * limitPriceBps / 10000
    return (quantity * limitPriceBps) / BigInt(10000);
  } else {
    // Seller escrows base currency (e.g., ALEO)
    return quantity;
  }
}

/**
 * Convert price in dollars to basis points
 */
export function priceToBasisPoints(priceInDollars: number): number {
  return Math.floor(priceInDollars * 10000);
}

/**
 * Convert basis points to price in dollars
 */
export function basisPointsToPrice(basisPoints: number): number {
  return basisPoints / 10000;
}

/**
 * Convert tick ID to price in dollars
 */
export function tickToPrice(tickId: number, tickSize: number = 100): number {
  return (tickId * tickSize) / 10000;
}

/**
 * Convert price in dollars to tick ID
 */
export function priceToTick(priceInDollars: number, tickSize: number = 100): number {
  return Math.floor((priceInDollars * 10000) / tickSize);
}

/**
 * Get tick price range
 */
export function getTickPriceRange(
  tickId: number,
  tickSize: number = 100
): { min: number; max: number } {
  const minBasisPoints = tickId * tickSize;
  const maxBasisPoints = (tickId + 1) * tickSize;
  return {
    min: basisPointsToPrice(minBasisPoints),
    max: basisPointsToPrice(maxBasisPoints),
  };
}

/**
 * Format token amount with proper decimals
 */
export function formatTokenAmount(amount: number, decimals: number): string {
  return (amount / Math.pow(10, decimals)).toLocaleString('en-US', {
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse token amount to raw units
 */
export function parseTokenAmount(amount: string | number, decimals: number): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.floor(num * Math.pow(10, decimals));
}
