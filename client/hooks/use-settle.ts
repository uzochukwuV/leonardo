'use client';

/**
 * useSettle
 * Settles a matched BUY/SELL pair using settle_match_public.
 * Any wallet holder of both TickOrder records can call this (permissionless).
 *
 * Contract signature (main.leo):
 *   settle_match_public(
 *     private buy_order:  TickOrder,
 *     private sell_order: TickOrder,
 *     public  timestamp:  u32
 *   )
 *
 * Both records are passed as plaintext literals extracted from requestRecords.
 */

import { useState, useCallback } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

export interface SettleParams {
  /** Plaintext or raw record object for the buy TickOrder */
  buyRecord: any;
  /** Plaintext or raw record object for the sell TickOrder */
  sellRecord: any;
}

function buildRecordInput(record: any): string {
  if (typeof record === 'string') return record;
  if (record.plaintext) return record.plaintext;

  const nonce = record.nonce || record._nonce || record.data?._nonce;
  if (nonce) {
    const d = record.data ?? {};
    return [
      `{ owner: ${record.owner}.private`,
      `token_pair: ${d.token_pair ?? '1u64'}.private`,
      `tick_lower: ${d.tick_lower ?? '0u64'}.private`,
      `tick_upper: ${d.tick_upper ?? '0u64'}.private`,
      `is_buy: ${d.is_buy ?? 'true'}.private`,
      `quantity: ${d.quantity ?? '0u128'}.private`,
      `limit_price: ${d.limit_price ?? '0u64'}.private`,
      `token_id: ${d.token_id ?? '0field'}.private`,
      `escrowed_amount: ${d.escrowed_amount ?? '0u128'}.private`,
      `filled: ${d.filled ?? '0u128'}.private`,
      `nonce: ${d.nonce ?? '0field'}.private`,
      `timestamp: ${d.timestamp ?? '0u32'}.private`,
      `expires_at: ${d.expires_at ?? '0u32'}.private`,
      `_nonce: ${nonce}.public }`,
    ].join(', ');
  }

  if (record.ciphertext) return record.ciphertext;
  return JSON.stringify(record);
}

export function useSettle() {
  const { connected, execTx, pollTx } = useContract();
  const [settling, setSettling] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTxId(null);
    setError(null);
  }, []);

  const settle = useCallback(
    async (params: SettleParams): Promise<string | null> => {
      const { buyRecord, sellRecord } = params;

      setError(null);
      setTxId(null);

      if (!connected) {
        setError('Connect your wallet first');
        return null;
      }

      setSettling(true);
      try {
        const timestamp = Math.floor(Date.now() / 1000);

        const broadcastId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'settle_match_public',
          inputs: [
            buildRecordInput(buyRecord),   // private buy_order:  TickOrder
            buildRecordInput(sellRecord),  // private sell_order: TickOrder
            `${timestamp}u32`,             // public  timestamp:  u32
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        const result = await pollTx(broadcastId);
        if (result.status === 'rejected') {
          throw new Error('Settlement transaction rejected on-chain');
        }

        setTxId(result.onChainId);
        return result.onChainId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Settlement failed');
        return null;
      } finally {
        setSettling(false);
      }
    },
    [connected, execTx, pollTx]
  );

  return { settle, settling, txId, error, reset };
}
