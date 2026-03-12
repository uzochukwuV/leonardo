'use client';

/**
 * useUserOrders
 * Fetches user's Receipt records from v17 contract.
 *
 * In v17:
 * - Orders are stored as Order records owned by the KEEPER (encrypted)
 * - Users receive Receipt records as private proof of their orders
 * - Users can use Receipt records to request cancellation
 *
 * Receipt structure (v17):
 *   owner: address,           // TRADER
 *   order_id: field,
 *   pair_id: u64,
 *   is_buy: bool,
 *   price: u64,
 *   quantity: u128,
 *   quote_token_id: field,
 *   escrow_amount: u128,
 *   created_at: u32,
 */

import { useState, useCallback, useEffect } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

// ─── Puzzle SDK (Puzzle wallet only) ─────────────────────────────────────────
let _useRecords: typeof import('@puzzlehq/sdk').useRecords | null = null;
try {
  const puzzleSdk = require('@puzzlehq/sdk');
  _useRecords = puzzleSdk.useRecords;
} catch {
  // Puzzle SDK not available
}

export interface ReceiptRecord {
  id: string;
  owner: string;
  plaintext?: string;
  data: {
    order_id: string;
    pair_id: string;
    is_buy: string;
    price: string;
    quantity: string;
    quote_token_id: string;
    escrow_amount: string;
    created_at: string;
  };
  ciphertext?: string;
  recordCiphertext?: string;
  spent?: boolean;
}

export interface ParsedOrder {
  recordId: string;
  rawRecord: ReceiptRecord;
  /** The ciphertext needed for cancellation */
  receiptCiphertext: string;
  orderId: string;          // The on-chain order_id (field)
  side: 'buy' | 'sell';
  pairId: number;
  priceUsd: number;         // Price in USD (converted from basis points)
  priceBps: number;         // Raw price in basis points
  quantityRaw: bigint;
  quoteTokenId: string;
  escrowAmount: bigint;
  createdAt: number;        // Unix timestamp (seconds)
  createdAtMs: number;      // Unix milliseconds for display
  // Status from keeper API (optional, populated separately)
  filled?: bigint;
  status?: 'active' | 'partially_filled' | 'filled' | 'pending_cancel' | 'cancelled';
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function stripUnit(v: string): string {
  return v.replace(/u\d+|field/g, '').replace(/\.private|\.public/g, '').trim();
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

function parseRecord(r: ReceiptRecord): ParsedOrder | null {
  try {
    const d = r.data;
    if (!d?.order_id) return null;

    const isBuy = d.is_buy === 'true';
    const priceBps = parseU(d.price);
    const createdAt = parseU(d.created_at);

    return {
      recordId: r.id,
      rawRecord: r,
      receiptCiphertext: r.recordCiphertext || r.ciphertext || '',
      orderId: d.order_id,
      side: isBuy ? 'buy' : 'sell',
      pairId: parseU(d.pair_id),
      priceUsd: priceBps / 10000,
      priceBps,
      quantityRaw: parseBig(d.quantity),
      quoteTokenId: d.quote_token_id || '0field',
      escrowAmount: parseBig(d.escrow_amount),
      createdAt,
      createdAtMs: createdAt * 1000,
      status: 'active', // Default status; could be updated from keeper API
    };
  } catch {
    return null;
  }
}

// ─── Plaintext → data fields parser ──────────────────────────────────────────

function parsePlaintextToData(plaintext: string): ReceiptRecord['data'] {
  const get = (key: string): string => {
    const match = plaintext.match(new RegExp(`${key}:\\s*([^,}]+)`));
    return match ? match[1].replace('.private', '').replace('.public', '').trim() : '0';
  };

  return {
    order_id: get('order_id'),
    pair_id: get('pair_id'),
    is_buy: get('is_buy'),
    price: get('price'),
    quantity: get('quantity'),
    quote_token_id: get('quote_token_id'),
    escrow_amount: get('escrow_amount'),
    created_at: get('created_at'),
  };
}

// ─── Puzzle SDK path ──────────────────────────────────────────────────────────

function usePuzzleOrders(): { orders: ParsedOrder[]; loading: boolean; error: string | null; refresh: () => void } | null {
  if (!_useRecords) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { records, loading, error, fetchPage: refresh } = _useRecords({
    filter: {
      programIds: [config.CONTRACT_PROGRAM_ID],
      status: null,
    } as any,
  });

  const orders: ParsedOrder[] = (records ?? [])
    .map((r) => {
      const data = r.data as Record<string, string>;
      const rec: ReceiptRecord = {
        id: r.transactionId ?? r.transitionId,
        owner: r.owner ?? '',
        plaintext: r.plaintext,
        recordCiphertext: r.ciphertext,
        data: {
          order_id: data.order_id ?? '0field',
          pair_id: data.pair_id ?? '0',
          is_buy: data.is_buy ?? 'false',
          price: data.price ?? '0',
          quantity: data.quantity ?? '0',
          quote_token_id: data.quote_token_id ?? '0field',
          escrow_amount: data.escrow_amount ?? '0',
          created_at: data.created_at ?? '0',
        },
        spent: r.status !== null,
      };

      // If data fields are missing, try parsing from plaintext
      if (!rec.data.order_id || rec.data.order_id === '0field') {
        if (r.plaintext) rec.data = parsePlaintextToData(r.plaintext);
      }

      return rec;
    })
    .filter((r) => !r.spent)
    .map(parseRecord)
    .filter((o): o is ParsedOrder => o !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  return { orders, loading, error: error ?? null, refresh };
}

// ─── Provable adapter path ────────────────────────────────────────────────────

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
      let records: ReceiptRecord[] = await requestRecords(
        config.CONTRACT_PROGRAM_ID,
        false // unspent only
      );

      // If empty, wait briefly and retry
      if (records.length === 0) {
        await new Promise((r) => setTimeout(r, 2_000));
        records = await requestRecords(config.CONTRACT_PROGRAM_ID, false);
      }

      // Decrypt any ciphertext records and parse
      const processed = await Promise.all(
        records.map(async (r) => {
          if (r.spent) return null;

          // Store the ciphertext for cancellation
          const ciphertext = r.recordCiphertext ?? r.ciphertext;

          // If already has data fields, use them
          if (r.data?.order_id && r.data.order_id !== '0field') {
            r.recordCiphertext = ciphertext;
            return r;
          }

          // Try to decrypt if we have ciphertext
          if (ciphertext && decrypt) {
            try {
              const plaintext = await decrypt(ciphertext);
              if (plaintext) {
                r.plaintext = plaintext;
                r.data = parsePlaintextToData(plaintext);
                r.recordCiphertext = ciphertext;
              }
            } catch {
              // decrypt failed — skip
            }
          }

          return r.data?.order_id && r.data.order_id !== '0field' ? r : null;
        })
      );

      const parsed = processed
        .filter((r): r is ReceiptRecord => r !== null)
        .map(parseRecord)
        .filter((o): o is ParsedOrder => o !== null)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

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

export function useUserOrders() {
  const puzzleResult = usePuzzleOrders();
  const provableResult = useProvableOrders();

  return puzzleResult ?? provableResult;
}
