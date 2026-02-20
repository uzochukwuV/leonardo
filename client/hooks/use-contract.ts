'use client';

/**
 * useContract
 * Base hook: wallet context + shared tx utilities.
 *
 * Key patterns from production Aleo wallet usage:
 *  - Use wallet.adapter.transactionStatus (not the shortcut) so we can
 *    capture the final on-chain transactionId that may differ from the
 *    initial broadcast ID.
 *  - execTx returns the initial broadcast txId; pollTx resolves with the
 *    confirmed on-chain txId.
 */

import { useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import type { TransactionOptions } from '@provablehq/aleo-types';

const POLL_INTERVAL_MS = 1_000;
const POLL_MAX_ATTEMPTS = 120; // 2 minutes

export type TxStatus = 'accepted' | 'rejected';

export interface PollResult {
  status: TxStatus;
  /** Final confirmed on-chain txId (may differ from broadcast ID) */
  onChainId: string;
}

export function useContract() {
  const { address, connected, wallet, executeTransaction, requestRecords, decrypt } =
    useWallet() as any;

  /**
   * Poll until the tx lands or times out.
   * Returns the final confirmed on-chain txId (which wallets sometimes update
   * from the initial broadcast ID to the canonical chain ID).
   */
  const pollTx = useCallback(
    async (initialTxId: string): Promise<PollResult> => {
      if (!wallet?.adapter) {
        // Fallback: no adapter, just wait and assume accepted
        await new Promise((r) => setTimeout(r, 2_000));
        return { status: 'accepted', onChainId: initialTxId };
      }

      let onChainId = initialTxId;

      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          const res = await wallet.adapter.transactionStatus(initialTxId);
          const statusStr =
            typeof res === 'string'
              ? res.toLowerCase()
              : ((res as any)?.status?.toLowerCase() ?? '');

          // Wallet may return the canonical on-chain ID separately
          if ((res as any)?.transactionId) {
            onChainId = (res as any).transactionId;
          }

          if (
            statusStr === 'accepted' ||
            statusStr === 'finalized' ||
            statusStr === 'completed'
          ) {
            return { status: 'accepted', onChainId };
          }
          if (statusStr === 'rejected' || statusStr === 'failed') {
            return { status: 'rejected', onChainId };
          }
        } catch {
          // transient polling error — keep trying
        }
      }

      throw new Error('Transaction timed out after 2 minutes');
    },
    [wallet]
  );

  /**
   * Submit a transaction. Returns the initial broadcast txId.
   * Throws if the wallet rejects or returns no ID.
   */
  const execTx = useCallback(
    async (opts: TransactionOptions): Promise<string> => {
      if (!executeTransaction) {
        throw new Error('Wallet does not support executeTransaction');
      }
      const result = await executeTransaction(opts);
      const txId =
        typeof result === 'string'
          ? result
          : ((result as any)?.transactionId ?? '');
      if (!txId) throw new Error('Wallet rejected the transaction (no txId returned)');
      return txId;
    },
    [executeTransaction]
  );

  return {
    address,
    connected,
    wallet,
    requestRecords,
    decrypt,
    pollTx,
    execTx,
  };
}
