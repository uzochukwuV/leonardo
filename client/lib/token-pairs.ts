/**
 * Token Pair Registry
 * Defines all tradeable token pairs for the order book
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  tokenId: string; // Aleo program ID for this token
  icon?: string;
  color?: string;
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
    tokenId: 'credits.aleo',
    icon: '🅰️',
    color: '#00D4AA',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    tokenId: 'usdc.aleo',
    icon: '💵',
    color: '#2775CA',
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
    active: true,
  },
  2: {
    id: 2,
    name: 'ALEO/USDT',
    baseToken: TOKENS.ALEO,
    quoteToken: TOKENS.USDT,
    tickSize: 100, // $0.01
    minPrice: 10000, // $1.00
    maxPrice: 10000000, // $1000.00
    maxTickRange: 50,
    active: true,
  },
  3: {
    id: 3,
    name: 'WBTC/USDC',
    baseToken: TOKENS.WBTC,
    quoteToken: TOKENS.USDC,
    tickSize: 10000, // $1.00
    minPrice: 100000, // $10.00
    maxPrice: 1000000000, // $100,000.00
    maxTickRange: 100, // 100 ticks = $100 range
    active: false, // Not yet active
  },
  4: {
    id: 4,
    name: 'WETH/USDC',
    baseToken: TOKENS.WETH,
    quoteToken: TOKENS.USDC,
    tickSize: 1000, // $0.10
    minPrice: 10000, // $1.00
    maxPrice: 100000000, // $10,000.00
    maxTickRange: 100, // 100 ticks = $10 range
    active: false, // Not yet active
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
 * Calculate escrow amount required for an order
 */
export function calculateEscrowAmount(
  isBuy: boolean,
  quantity: number,
  limitPrice: number
): number {
  if (isBuy) {
    // Buyer escrows quote currency (e.g., USDC)
    // Amount = quantity * price / 10000 (basis points to decimal)
    return Math.floor((quantity * limitPrice) / 10000);
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
