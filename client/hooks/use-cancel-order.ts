'use client';

/**
 * useCancelOrder
 * Cancels an open TickOrder and refunds the escrowed tokens.
 *
 * Contract signature (main.leo):
 *   cancel_order_public_escrow(
 *     private order:     TickOrder,
 *     public  order_key: field
 *   )
 *
 * The TickOrder record is passed as its plaintext literal (from requestRecords).
 * The order_key is a field derived on-chain — callers pass it if known,
 * or pass the record's nonce field as a best-effort placeholder (the contract
 * derives the key itself via BHP256).
 */

import { useState, useCallback } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

export interface CancelOrderParams {
  /** Plaintext record literal or the raw record object from requestRecords */
  record: any;
  /** The on-chain order_key field — pass the record's nonce if unknown */
  orderKey: string;
}

export function useCancelOrder() {
  const { connected, execTx, pollTx } = useContract();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelOrder = useCallback(
    async (params: CancelOrderParams): Promise<boolean> => {
      const { record, orderKey } = params;

      setError(null);

      if (!connected) {
        setError('Connect your wallet first');
        return false;
      }

      setCancelling(true);
      try {
        // Build the record input string.
        // Prefer plaintext literal; fall back to reconstructing from nonce fields;
        // last resort: pass the raw object (wallet may handle it).
        let recordInput: string;
        if (typeof record === 'string') {
          recordInput = record;
        } else if (record.plaintext) {
          recordInput = record.plaintext;
        } else {
          const nonce = record.nonce || record._nonce || record.data?._nonce;
          if (nonce) {
            // Reconstruct a minimal plaintext literal that the wallet can sign
            const d = record.data ?? {};
            recordInput = [
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
          } else if (record.ciphertext) {
            recordInput = record.ciphertext;
          } else {
            recordInput = JSON.stringify(record);
          }
        }

        const txId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'cancel_order_public_escrow',
          inputs: [
            recordInput,    // private order: TickOrder
            orderKey,       // public  order_key: field
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        const result = await pollTx(txId);
        if (result.status === 'rejected') {
          throw new Error('Cancel transaction rejected on-chain');
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cancel failed');
        return false;
      } finally {
        setCancelling(false);
      }
    },
    [connected, execTx, pollTx]
  );

  return { cancelOrder, cancelling, error };
}
