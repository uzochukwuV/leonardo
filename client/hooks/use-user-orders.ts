'use client';

/**
 * useUserOrders
 * Fetches and parses the user's TickOrder private records.
 *
 * Uses Puzzle SDK's `useRecords` when the Puzzle wallet is connected,
 * falling back to the Provable adapter's `requestRecords` otherwise.
 *
 * Puzzle SDK types:
 *   RecordsFilter { programIds: string[], status: RecordStatus }
 *   RecordWithPlaintext { plaintext: string, data: StringRecord, ... }
 */

import { useState, useCallback, useEffect } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';




// ─── Puzzle SDK (Puzzle wallet only) ─────────────────────────────────────────
// Only import when the Puzzle provider is available; guarded by try-catch on usage.
let _useRecords: typeof import('@puzzlehq/sdk').useRecords | null = null;
let _RecordStatus: typeof import('@puzzlehq/sdk') | null = null;
try {
  // Dynamic require keeps Next.js SSR from crashing when Puzzle SDK has no ESM exports
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puzzleSdk = require('@puzzlehq/sdk');
  _useRecords = puzzleSdk.useRecords;
  _RecordStatus = puzzleSdk.RecordStatus;
} catch {
  // Puzzle SDK not available or not in browser — fall back to Provable adapter
}

export interface TickOrderRecord {
  /** Record commitment / unique ID */
  id: string;
  owner: string;
  /** Plaintext string if available */
  plaintext?: string;
  /** Raw data fields keyed by name */
  data: {
    token_pair: string;
    tick_lower: string;
    tick_upper: string;
    is_buy: string;
    quantity: string;
    limit_price: string;
    token_id: string;
    escrowed_amount: string;
    filled: string;
    nonce: string;
    timestamp: string;
    expires_at: string;
    _nonce?: string;
  };
  /** Ciphertext blob if record is not yet decrypted */
  ciphertext?: string;
  recordCiphertext?: string;
  spent?: boolean;
}

export interface ParsedOrder {
  recordId: string;
  /** Full raw record kept for cancel / settle calls */
  rawRecord: TickOrderRecord;
  side: 'buy' | 'sell';
  tokenPair: number;
  tickLowerUsd: number;
  tickUpperUsd: number;
  limitPriceUsd: number;
  quantityRaw: bigint;
  filledRaw: bigint;
  escrowedAmount: bigint;
  /** Unix milliseconds */
  timestamp: number;
  fillPercent: number;
  expiresAt: number;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function stripUnit(v: string): string {
  return v.replace(/u\d+|field/g, '').trim();
}

function parseU(v: string): number {
  return parseInt(stripUnit(v), 10) || 0;
}

function parseBig(v: string): bigint {
  try {
    return BigInt(stripUnit(v));
  } catch {
    return 0n;
  }
}

function parseRecord(r: TickOrderRecord): ParsedOrder | null {
  try {
    const d = r.data;
    if (!d?.token_pair) return null;

    const isBuy = d.is_buy === 'true';
    const tickSize = config.TICK_SIZE;

    const tickLowerId = parseU(d.tick_lower);
    const tickUpperId = parseU(d.tick_upper);
    const limitPriceBps = parseU(d.limit_price);
    const qty = parseBig(d.quantity);
    const filled = parseBig(d.filled);
    const fillPercent = qty > 0n ? Number((filled * 100n) / qty) : 0;

    return {
      recordId: r.id,
      rawRecord: r,
      side: isBuy ? 'buy' : 'sell',
      tokenPair: parseU(d.token_pair),
      tickLowerUsd: (tickLowerId * tickSize) / 10000,
      tickUpperUsd: (tickUpperId * tickSize) / 10000,
      limitPriceUsd: limitPriceBps / 10000,
      quantityRaw: qty,
      filledRaw: filled,
      escrowedAmount: parseBig(d.escrowed_amount),
      timestamp: parseU(d.timestamp) * 1000,
      fillPercent,
      expiresAt: parseU(d.expires_at),
    };
  } catch {
    return null;
  }
}

// ─── Plaintext → data fields parser ──────────────────────────────────────────
// Parses a Leo record plaintext string into the data fields shape.
// e.g. "{ owner: aleo1....private, token_pair: 1u64.private, ... }"

function parsePlaintextToData(plaintext: string): TickOrderRecord['data'] {
  const get = (key: string): string => {
    const match = plaintext.match(new RegExp(`${key}:\\s*([^,}]+)`));
    return match ? match[1].replace('.private', '').replace('.public', '').trim() : '0';
  };

  return {
    token_pair:      get('token_pair'),
    tick_lower:      get('tick_lower'),
    tick_upper:      get('tick_upper'),
    is_buy:          get('is_buy'),
    quantity:        get('quantity'),
    limit_price:     get('limit_price'),
    token_id:        get('token_id'),
    escrowed_amount: get('escrowed_amount'),
    filled:          get('filled'),
    nonce:           get('nonce'),
    timestamp:       get('timestamp'),
    expires_at:      get('expires_at'),
    _nonce:          get('_nonce'),
  };
}

// ─── Puzzle SDK path ──────────────────────────────────────────────────────────
// Uses useRecords({ filter: { programIds, status: 'Unspent' } }) from @puzzlehq/sdk.
// RecordWithPlaintext has: plaintext (string), data (StringRecord), transactionId, etc.

function usePuzzleOrders(): { orders: ParsedOrder[]; loading: boolean; error: string | null; refresh: () => void } | null {
  if (!_useRecords || !_RecordStatus) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { records, loading, error, fetchPage: refresh } = _useRecords({
    filter: {
      programIds: [config.CONTRACT_PROGRAM_ID],
      status: null,
    } as any,
  });

  const orders: ParsedOrder[] = (records ?? [])
    .map((r) => {
      // RecordWithPlaintext.data is StringRecord (nested string map)
      const data = r.data as Record<string, string>;
      const rec: TickOrderRecord = {
        id: r.transactionId ?? r.transitionId,
        owner: r.owner ?? '',
        plaintext: r.plaintext,
        data: {
          token_pair:      data.token_pair ?? '0',
          tick_lower:      data.tick_lower ?? '0',
          tick_upper:      data.tick_upper ?? '0',
          is_buy:          data.is_buy ?? 'false',
          quantity:        data.quantity ?? '0',
          limit_price:     data.limit_price ?? '0',
          token_id:        data.token_id ?? '0field',
          escrowed_amount: data.escrowed_amount ?? '0',
          filled:          data.filled ?? '0',
          nonce:           data.nonce ?? '0field',
          timestamp:       data.timestamp ?? '0',
          expires_at:      data.expires_at ?? '0',
          _nonce:          data._nonce,
        },
        spent: r.status !== null,
      };

      // If data fields are missing, try parsing from plaintext
      if (!rec.data.token_pair || rec.data.token_pair === '0') {
        if (r.plaintext) rec.data = parsePlaintextToData(r.plaintext);
      }

      return rec;
    })
    .filter((r) => !r.spent)
    .map(parseRecord)
    .filter((o): o is ParsedOrder => o !== null)
    .sort((a, b) => b.timestamp - a.timestamp);

  return { orders, loading, error: error ?? null, refresh };
}

// ─── Provable adapter path ────────────────────────────────────────────────────
// Fallback when Puzzle SDK is not available or Puzzle wallet not connected.

function useProvableOrders() {
  const { connected, address, requestRecords, decrypt } = useContract();
  const [orders, setOrders] = useState<ParsedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!connected || !address || !requestRecords) return;

    setLoading(true);
    setError(null);

    try {
      // First attempt — Provable adapter: requestRecords(programId, unspentOnly)
      let records: TickOrderRecord[] = await requestRecords(
        config.CONTRACT_PROGRAM_ID,
        false // unspent only
      );

      // If empty, wait briefly and retry (wallet may need to sync)
      if (records.length === 0) {
        await new Promise((r) => setTimeout(r, 2_000));
        records = await requestRecords(config.CONTRACT_PROGRAM_ID, false);
      }

      // Decrypt any ciphertext records the wallet hasn't auto-decrypted
      const processed = await Promise.all(
        records.map(async (r) => {
          if (r.spent) return null;
          if (r.data?.token_pair) return r;

          const cipher = r.recordCiphertext ?? r.ciphertext;
          if (cipher && decrypt) {
            try {
              const plaintext = await decrypt(cipher);
              if (plaintext) {
                r.plaintext = plaintext;
                r.data = parsePlaintextToData(plaintext);
              }
            } catch {
              // decrypt failed — skip
            }
          }

          return r.data?.token_pair ? r : null;
        })
      );

      const parsed = processed
        .filter((r): r is TickOrderRecord => r !== null)
        .map(parseRecord)
        .filter((o): o is ParsedOrder => o !== null)
        .sort((a, b) => b.timestamp - a.timestamp);

      setOrders(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [connected, address, requestRecords, decrypt]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  return { orders, loading, error, refresh: loadOrders };
}

// ─── Unified hook ─────────────────────────────────────────────────────────────
// Tries Puzzle SDK path first; if not available, uses Provable adapter.

export function useUserOrders() {
  const puzzleResult = usePuzzleOrders();
  const provableResult = useProvableOrders();

  // If Puzzle SDK is available and returned a result, prefer it
  return puzzleResult ?? provableResult;
}
