'use client';

/**
 * useCancelOrder
 * Two-step cancellation flow for v17 contract:
 *
 * Step 1 (Trader calls): request_cancel(receipt, keeper_addr, timestamp)
 *   - Uses trader's Receipt record as proof of order ownership
 *   - Creates CancellationRequest record owned by keeper
 *   - Returns: (CancellationRequest, Future)
 *
 * Step 2 (Keeper processes): cancel_buy_order or cancel_sell_order
 *   - Keeper sees CancellationRequest and processes it
 *   - Refunds tokens to trader
 *   - Returns: (CancellationProof, Future)
 *
 * From trader's perspective, they only call request_cancel and wait.
 * The keeper bot automatically processes the cancellation.
 */

import { useState, useCallback, useEffect } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';
import { getOrchestratorAddress } from '@/lib/aleo-service';

export interface CancelOrderParams {
  /** The Receipt record ciphertext (user's proof of order) */
  receiptRecord: string;
  /** The on-chain order_id field (from Receipt) */
  orderId: string;
  /** Is this a buy order? */
  isBuy: boolean;
}

export type CancelStep = 'idle' | 'requesting' | 'polling' | 'done';

export function useCancelOrder() {
  const { connected, execTx, pollTx } = useContract();
  const [step, setStep] = useState<CancelStep>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orchestratorAddr, setOrchestratorAddr] = useState<string | null>(null);

  // Fetch orchestrator/keeper address on mount
  useEffect(() => {
    let mounted = true;

    async function fetchOrchestrator() {
      try {
        const addr = await getOrchestratorAddress();
        if (mounted && addr) {
          setOrchestratorAddr(addr);
        }
      } catch (err) {
        console.error('Failed to fetch orchestrator:', err);
      }
    }

    fetchOrchestrator();
    return () => { mounted = false; };
  }, []);

  const reset = useCallback(() => {
    setStep('idle');
    setTxId(null);
    setError(null);
  }, []);

  /**
   * Request cancellation of an order.
   * User submits their Receipt record; keeper will process the refund.
   */
  const cancelOrder = useCallback(
    async (params: CancelOrderParams): Promise<boolean> => {
      const { receiptRecord } = params;

      setError(null);
      setTxId(null);

      if (!connected) {
        setError('Connect your wallet first');
        return false;
      }

      if (!orchestratorAddr) {
        setError('Keeper address not loaded. Please try again.');
        return false;
      }

      if (!receiptRecord) {
        setError('Receipt record required for cancellation');
        return false;
      }

      try {
        const timestamp = Math.floor(Date.now() / 1000);

        // Call request_cancel with the Receipt record
        // Function signature: request_cancel(receipt: Receipt, keeper_addr: address, timestamp: u32)
        setStep('requesting');
        const cancelTxId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'request_cancel',
          inputs: [
            receiptRecord,             // Receipt record (ciphertext)
            orchestratorAddr,          // keeper_addr
            `${timestamp}u32`,         // timestamp
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        setStep('polling');
        const cancelResult = await pollTx(cancelTxId);
        if (cancelResult.status === 'rejected') {
          throw new Error('Cancellation request rejected on-chain');
        }

        setTxId(cancelResult.onChainId);
        setStep('done');

        // Note: The actual refund happens when the keeper processes the CancellationRequest.
        // The user will receive a CancellationProof record when complete.
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cancel request failed');
        setStep('idle');
        return false;
      }
    },
    [connected, execTx, pollTx, orchestratorAddr]
  );

  const stepLabel: Record<CancelStep, string> = {
    idle: '',
    requesting: 'Submitting cancellation request...',
    polling: 'Waiting for confirmation...',
    done: 'Cancellation requested! Keeper will process refund.',
  };

  return {
    cancelOrder,
    step,
    stepLabel,
    txId,
    error,
    reset,
    orchestratorAddr,
  };
}
