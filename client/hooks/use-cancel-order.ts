'use client';

/**
 * useCancelOrder
 * Two-step cancellation flow for v5 contract:
 *   1. cancel_order(order_id) - Marks order as cancelled
 *   2. withdraw_cancelled_credits(order_id, amount) - For native ALEO
 *      OR withdraw_cancelled_usdc(order_id, amount) - For Circle USDC
 *      OR withdraw_cancelled(order_id, token_id, amount) - For ARC-21 tokens
 *
 * Contract signatures (main.leo):
 *   cancel_order(public order_id: field)
 *   withdraw_cancelled_credits(public order_id: field, public amount: u64)
 *   withdraw_cancelled_usdc(public order_id: field, public amount: u128)
 *   withdraw_cancelled(public order_id: field, public token_id: field, public amount: u128)
 */

import { useState, useCallback } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

export interface CancelOrderParams {
  /** The on-chain order_id field */
  orderId: string;
  /** Token ID for the escrowed token */
  tokenId: string;
  /** Amount to withdraw (refund) */
  refundAmount: bigint;
  /** Whether this is native ALEO credits (tokenId === '0field') */
  isNative?: boolean;
  /** Whether this is Circle USDC (tokenId === '1field') */
  isCircleUsdc?: boolean;
}

export type CancelStep = 'idle' | 'cancelling' | 'withdrawing' | 'done';

export function useCancelOrder() {
  const { connected, execTx, pollTx } = useContract();
  const [step, setStep] = useState<CancelStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
  }, []);

  const cancelOrder = useCallback(
    async (params: CancelOrderParams): Promise<boolean> => {
      const { orderId, tokenId, refundAmount, isNative, isCircleUsdc } = params;

      setError(null);

      if (!connected) {
        setError('Connect your wallet first');
        return false;
      }

      try {
        // Step 1: Cancel the order (marks as cancelled in mapping)
        setStep('cancelling');
        const cancelTxId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'cancel_order',
          inputs: [orderId],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        const cancelResult = await pollTx(cancelTxId);
        if (cancelResult.status === 'rejected') {
          throw new Error('Cancel transaction rejected on-chain');
        }

        // Step 2: Withdraw the refund
        setStep('withdrawing');

        // Determine token type for withdrawal
        const useNative = isNative ?? tokenId === config.NATIVE_CREDITS_ID;
        const useCircleUsdc = isCircleUsdc ?? tokenId === config.CIRCLE_USDC_ID;

        let withdrawTxId: string;
        if (useNative) {
          // Native ALEO credits withdrawal
          withdrawTxId = await execTx({
            program: config.CONTRACT_PROGRAM_ID,
            function: 'withdraw_cancelled_credits',
            inputs: [
              orderId,
              `${refundAmount}u64`, // Native credits use u64
            ],
            fee: config.DEFAULT_FEE,
            privateFee: false,
          });
        } else if (useCircleUsdc) {
          // Circle USDC withdrawal
          withdrawTxId = await execTx({
            program: config.CONTRACT_PROGRAM_ID,
            function: 'withdraw_cancelled_usdc',
            inputs: [
              orderId,
              `${refundAmount}u128`, // Circle USDC uses u128
            ],
            fee: config.DEFAULT_FEE,
            privateFee: false,
          });
        } else {
          // ARC-21 token withdrawal
          withdrawTxId = await execTx({
            program: config.CONTRACT_PROGRAM_ID,
            function: 'withdraw_cancelled',
            inputs: [
              orderId,
              tokenId,
              `${refundAmount}u128`,
            ],
            fee: config.DEFAULT_FEE,
            privateFee: false,
          });
        }

        const withdrawResult = await pollTx(withdrawTxId);
        if (withdrawResult.status === 'rejected') {
          throw new Error('Withdrawal transaction rejected on-chain');
        }

        setStep('done');
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cancel failed');
        setStep('idle');
        return false;
      }
    },
    [connected, execTx, pollTx]
  );

  const stepLabel: Record<CancelStep, string> = {
    idle: '',
    cancelling: 'Cancelling order...',
    withdrawing: 'Withdrawing funds...',
    done: 'Order cancelled!',
  };

  return { cancelOrder, step, stepLabel, error, reset };
}
