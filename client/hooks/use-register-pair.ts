'use client';

/**
 * useRegisterPair
 * Hook for registering new trading pairs on the orderbook contract.
 */

import { useState, useCallback } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

export type RegisterStep = 'idle' | 'submitting' | 'polling' | 'done';

export interface RegisterPairParams {
  baseTokenId: string;   // e.g., "0field" for ALEO
  quoteTokenId: string;  // e.g., "1field" for USDT
  tickSize: number;      // e.g., 100 for $0.01
}

export function useRegisterPair() {
  const { connected, execTx, pollTx } = useContract();
  const [step, setStep] = useState<RegisterStep>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setTxId(null);
    setError(null);
  }, []);

  const registerPair = useCallback(
    async (params: RegisterPairParams): Promise<string | null> => {
      const { baseTokenId, quoteTokenId, tickSize } = params;

      setError(null);
      setTxId(null);

      if (!connected) {
        setError('Connect your wallet first');
        return null;
      }

      if (baseTokenId === quoteTokenId) {
        setError('Base and quote tokens must be different');
        return null;
      }

      if (tickSize <= 0) {
        setError('Tick size must be positive');
        return null;
      }

      try {
        setStep('submitting');

        // register_pair(base_token_id, quote_token_id, tick_size)
        const txId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'register_pair',
          inputs: [
            baseTokenId,
            quoteTokenId,
            `${tickSize}u64`,
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        setStep('polling');
        const result = await pollTx(txId);

        if (result.status === 'rejected') {
          throw new Error('Transaction rejected on-chain');
        }

        const confirmedId = result.onChainId;
        setTxId(confirmedId);
        setStep('done');
        return confirmedId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to register pair');
        setStep('idle');
        return null;
      }
    },
    [connected, execTx, pollTx]
  );

  const stepLabel: Record<RegisterStep, string> = {
    idle: '',
    submitting: 'Submitting transaction...',
    polling: 'Waiting for confirmation...',
    done: 'Pair registered successfully!',
  };

  return {
    registerPair,
    step,
    stepLabel,
    txId,
    error,
    reset,
    isLoading: step === 'submitting' || step === 'polling',
  };
}
