/**
 * Aleo Contract Helpers
 * Pure utility functions for order validation, price/tick conversion,
 * and Aleo value formatting. No mocks, no network calls.
 */

import { config } from './config';

// --- Types ---

export interface TickOrderParams {
  tokenPairId: number;
  isBuy: boolean;
  tickLower: number;
  tickUpper: number;
  limitPrice: number; // In basis points
  quantity: number;   // In raw token units
}

export interface OrderRecord {
  owner: string;
  token_pair: number;
  is_buy: boolean;
  tick_lower: number;
  tick_upper: number;
  limit_price: number;
  quantity: number;
  filled: number;
  escrowed_amount: number;
  timestamp: number;
  nonce: string;
  _plaintext?: string;
  _nonce?: string;
}

// --- Validation ---

/**
 * Validate tick order parameters against contract constraints.
 * Returns null if valid, or an error message string.
 */
export function validateTickOrder(order: TickOrderParams): string | null {
  const { tickLower, tickUpper, limitPrice, quantity, tokenPairId } = order;

  if (tokenPairId <= 0) {
    return 'Invalid token pair ID';
  }

  if (tickLower >= tickUpper) {
    return 'Tick lower must be less than tick upper';
  }

  const rangeWidth = tickUpper - tickLower;
  if (rangeWidth > config.MAX_TICK_RANGE) {
    return `Tick range too wide (max ${config.MAX_TICK_RANGE} ticks)`;
  }

  if (rangeWidth <= 0) {
    return 'Tick range must be positive';
  }

  // Check price within range
  const minAllowed = tickLower * config.TICK_SIZE;
  const maxAllowed = tickUpper * config.TICK_SIZE;

  if (limitPrice < minAllowed || limitPrice > maxAllowed) {
    return `Limit price must be within tick range ($${(minAllowed / 10000).toFixed(2)} - $${(maxAllowed / 10000).toFixed(2)})`;
  }

  if (quantity <= 0) {
    return 'Quantity must be positive';
  }

  return null;
}

// --- Price/Tick conversion ---

/**
 * Convert a dollar price to a tick ID.
 */
export function priceToTick(price: number, tickSize: number = config.TICK_SIZE): number {
  return Math.floor((price * 10000) / tickSize);
}

/**
 * Convert a tick ID to a dollar price.
 */
export function tickToPrice(tickId: number, tickSize: number = config.TICK_SIZE): number {
  return (tickId * tickSize) / 10000;
}

/**
 * Calculate midpoint execution price (used for settlement).
 */
export function calculateMidpointPrice(buyLimitBps: number, sellLimitBps: number): number {
  return Math.floor((buyLimitBps + sellLimitBps) / 2);
}

/**
 * Verify tick overlap (orders can only match if tick ranges overlap).
 */
export function verifyTickOverlap(
  buyTickLower: number,
  buyTickUpper: number,
  sellTickLower: number,
  sellTickUpper: number
): boolean {
  const overlapLow = Math.max(buyTickLower, sellTickLower);
  const overlapHigh = Math.min(buyTickUpper, sellTickUpper);
  return overlapLow < overlapHigh;
}

// --- Aleo value formatting ---

/**
 * Format a number as an Aleo u64 string.
 */
export function toU64(value: number): string {
  return `${Math.floor(value)}u64`;
}

/**
 * Format a number as an Aleo u32 string.
 */
export function toU32(value: number): string {
  return `${Math.floor(value)}u32`;
}

/**
 * Format a boolean for Aleo.
 */
export function toBool(value: boolean): string {
  return value ? 'true' : 'false';
}

/**
 * Format a field element string.
 */
export function toField(value: string | number): string {
  return `${value}field`;
}

// --- Record parsing ---

/**
 * Parse a decrypted Aleo record plaintext into an OrderRecord.
 * Aleo record plaintext format:
 * "{ owner: aleo1..., token_pair: 1u64, is_buy: true, ... }"
 */
export function parseOrderRecord(plaintext: string): OrderRecord | null {
  try {
    // Remove outer braces
    const inner = plaintext.replace(/^\s*\{/, '').replace(/\}\s*$/, '').trim();
    const fields: Record<string, string> = {};

    for (const entry of inner.split(',')) {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) continue;
      const key = entry.slice(0, colonIdx).trim();
      const value = entry.slice(colonIdx + 1).trim();
      fields[key] = value;
    }

    const parseNum = (s: string): number => {
      const m = s.match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    };

    return {
      owner: fields.owner || '',
      token_pair: parseNum(fields.token_pair || '0'),
      is_buy: fields.is_buy === 'true',
      tick_lower: parseNum(fields.tick_lower || '0'),
      tick_upper: parseNum(fields.tick_upper || '0'),
      limit_price: parseNum(fields.limit_price || '0'),
      quantity: parseNum(fields.quantity || '0'),
      filled: parseNum(fields.filled || '0'),
      escrowed_amount: parseNum(fields.escrowed_amount || '0'),
      timestamp: parseNum(fields.timestamp || '0'),
      nonce: fields._nonce || '',
      _plaintext: plaintext,
      _nonce: fields._nonce || '',
    };
  } catch (err) {
    console.error('[parseOrderRecord] Failed to parse:', err);
    return null;
  }
}

/**
 * Format an address for display (truncated).
 */
export function formatAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/**
 * Format a transaction ID for display (truncated).
 */
export function formatTxId(txId: string): string {
  if (txId.length <= 16) return txId;
  return `${txId.slice(0, 10)}...${txId.slice(-8)}`;
}
