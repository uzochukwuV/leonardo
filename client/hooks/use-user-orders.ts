'use client';

/**
 * useUserOrders
 * Fetches user's OrderReceipt records from v5 contract.
 *
 * In v5:
 * - Orders are stored in PUBLIC mapping (accessible by keepers)
 * - Users receive OrderReceipt records as private proof of their orders
 *
 * OrderReceipt structure:
 *   owner: address, order_id: field, token_pair: u64,
 *   is_buy: bool, quantity: u128, limit_price: u64, timestamp: u32
 */

import { useState, useCallback, useEffect } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

// ─── Puzzle SDK (Puzzle wallet only) ─────────────────────────────────────────
let _useRecords: typeof import('@puzzlehq/sdk').useRecords | null = null;
let _RecordStatus: typeof import('@puzzlehq/sdk') | null = null;
try {
  const puzzleSdk = require('@puzzlehq/sdk');
  _useRecords = puzzleSdk.useRecords;
  _RecordStatus = puzzleSdk.RecordStatus;
} catch {
  // Puzzle SDK not available
}

export interface OrderReceiptRecord {
  id: string;
  owner: string;
  plaintext?: string;
  data: {
    order_id: string;
    token_pair: string;
    is_buy: string;
    quantity: string;
    limit_price: string;
    timestamp: string;
  };
  ciphertext?: string;
  recordCiphertext?: string;
  spent?: boolean;
}

export interface ParsedOrder {
  recordId: string;
  rawRecord: OrderReceiptRecord;
  orderId: string;          // The on-chain order_id (field)
  side: 'buy' | 'sell';
  tokenPair: number;
  limitPriceUsd: number;
  quantityRaw: bigint;
  timestamp: number;        // Unix milliseconds
  // These fields come from public mapping query (optional)
  filled?: bigint;
  status?: 'active' | 'filled' | 'cancelled';
  tickLower?: number;
  tickUpper?: number;
  tokenId?: string;
  escrowedAmount?: bigint;
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

function parseRecord(r: OrderReceiptRecord): ParsedOrder | null {
  try {
    const d = r.data;
    if (!d?.order_id) return null;

    const isBuy = d.is_buy === 'true';
    const limitPriceBps = parseU(d.limit_price);

    return {
      recordId: r.id,
      rawRecord: r,
      orderId: d.order_id,
      side: isBuy ? 'buy' : 'sell',
      tokenPair: parseU(d.token_pair),
      limitPriceUsd: limitPriceBps / 10000,
      quantityRaw: parseBig(d.quantity),
      timestamp: parseU(d.timestamp) * 1000,
    };
  } catch {
    return null;
  }
}

// ─── Plaintext → data fields parser ──────────────────────────────────────────

function parsePlaintextToData(plaintext: string): OrderReceiptRecord['data'] {
  const get = (key: string): string => {
    const match = plaintext.match(new RegExp(`${key}:\\s*([^,}]+)`));
    return match ? match[1].replace('.private', '').replace('.public', '').trim() : '0';
  };

  return {
    order_id:    get('order_id'),
    token_pair:  get('token_pair'),
    is_buy:      get('is_buy'),
    quantity:    get('quantity'),
    limit_price: get('limit_price'),
    timestamp:   get('timestamp'),
  };
}

// ─── Puzzle SDK path ──────────────────────────────────────────────────────────

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
      const data = r.data as Record<string, string>;
      const rec: OrderReceiptRecord = {
        id: r.transactionId ?? r.transitionId,
        owner: r.owner ?? '',
        plaintext: r.plaintext,
        data: {
          order_id:    data.order_id ?? '0field',
          token_pair:  data.token_pair ?? '0',
          is_buy:      data.is_buy ?? 'false',
          quantity:    data.quantity ?? '0',
          limit_price: data.limit_price ?? '0',
          timestamp:   data.timestamp ?? '0',
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
    .sort((a, b) => b.timestamp - a.timestamp);

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
      let records: OrderReceiptRecord[] = await requestRecords(
        config.CONTRACT_PROGRAM_ID,
        false // unspent only
      );

      // If empty, wait briefly and retry
      if (records.length === 0) {
        await new Promise((r) => setTimeout(r, 2_000));
        records = await requestRecords(config.CONTRACT_PROGRAM_ID, false);
      }

      // Decrypt any ciphertext records
      const processed = await Promise.all(
        records.map(async (r) => {
          if (r.spent) return null;
          if (r.data?.order_id) return r;

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

          return r.data?.order_id ? r : null;
        })
      );

      const parsed = processed
        .filter((r): r is OrderReceiptRecord => r !== null)
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

export function useUserOrders() {
  const puzzleResult = usePuzzleOrders();
  const provableResult = useProvableOrders();

  return puzzleResult ?? provableResult;
}
