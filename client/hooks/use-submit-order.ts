'use client';

/**
 * useSubmitOrder
 * Order submission for private_orderbook_v17.aleo
 *
 * Functions:
 *   submit_buy_order(pair_id, quote_token_id, price, quantity, escrow_quote, timestamp, expires_at, orchestrator_addr)
 *   submit_sell_order(pair_id, quote_token_id, price, quantity, escrow_aleo, timestamp, expires_at, orchestrator_addr)
 *
 * Returns: (Order, Receipt, Future)
 *   - Order record: owned by orchestrator
 *   - Receipt record: owned by trader (proof of order)
 */

import { useState, useCallback, useEffect } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';
import {
  getTokenPair,
  priceToBasisPoints,
  calculateEscrowAmount,
} from '@/lib/token-pairs';
import { getOrchestratorAddress } from '@/lib/aleo-service';

export type SubmitStep = 'idle' | 'approving' | 'polling-approval' | 'submitting' | 'polling-order' | 'done';

export interface SubmitOrderParams {
  pairId: number;
  isBuy: boolean;
  /** Limit price in USD */
  limitPriceUsd: number;
  /** Quantity in human units (e.g. 100.5 ALEO) */
  quantity: number;
  /** Block height expiry — 0 means no expiry */
  expiresAt: number;
  /** Tick range for privacy (not used in v17 but kept for UI compatibility) */
  tickLowerUsd?: number;
  tickUpperUsd?: number;
}

export function useSubmitOrder() {
  const { connected, address, execTx, pollTx } = useContract();
  const [step, setStep] = useState<SubmitStep>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [approvalTxId, setApprovalTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [orchestratorAddr, setOrchestratorAddr] = useState<string | null>(null);
  const [loadingOrchestrator, setLoadingOrchestrator] = useState(true);

  // Fetch orchestrator address on mount
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
      } finally {
        if (mounted) {
          setLoadingOrchestrator(false);
        }
      }
    }

    fetchOrchestrator();
    return () => { mounted = false; };
  }, []);

  const reset = useCallback(() => {
    setStep('idle');
    setTxId(null);
    setApprovalTxId(null);
    setError(null);
    setReceipt(null);
  }, []);

  const approveQuoteTokens = useCallback(
    async (params: SubmitOrderParams): Promise<string | null> => {
      const { pairId, isBuy, limitPriceUsd, quantity } = params;

      if (!isBuy) {
        // Approval is only for buy orders
        return null;
      }

      setError(null);
      setApprovalTxId(null);

      if (!connected || !address) {
        setError('Connect your wallet first');
        return null;
      }

      const pair = getTokenPair(pairId);
      if (!pair) {
        setError('Invalid token pair');
        return null;
      }

      try {
        const priceBps = BigInt(priceToBasisPoints(limitPriceUsd));
        const quantityRaw = BigInt(
          Math.floor(quantity * Math.pow(10, pair.baseToken.decimals))
        );
        const escrowAmount = calculateEscrowAmount(true, quantityRaw, priceBps);

        setStep('approving');
        // Approve the orderbook program to spend quote tokens
        // token_registry.aleo/approve_public(token_id, spender, amount)
        const txId = await execTx({
          program: config.TOKEN_REGISTRY_PROGRAM,
          function: 'approve_public',
          inputs: [
            pair.quoteToken.tokenId,
            config.CONTRACT_PROGRAM_ID,
            `${escrowAmount}u128`,
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        setStep('polling-approval');
        const approvalResult = await pollTx(txId);
        if (approvalResult.status === 'rejected') {
          throw new Error('Approval transaction rejected');
        }

        const confirmedId = approvalResult.onChainId;
        setApprovalTxId(confirmedId);
        setStep('idle'); // Ready for the next step
        return confirmedId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve tokens');
        setStep('idle');
        return null;
      }
    },
    [connected, address, execTx, pollTx]
  );

  const submitOrder = useCallback(
    async (params: SubmitOrderParams): Promise<string | null> => {
      const {
        pairId,
        isBuy,
        limitPriceUsd,
        quantity,
        expiresAt = 0,
      } = params;

      setError(null);
      setTxId(null);

      if (!connected || !address) {
        setError('Connect your wallet first');
        return null;
      }

      if (!orchestratorAddr) {
        setError('Orchestrator address not loaded. Please try again.');
        return null;
      }

      const pair = getTokenPair(pairId);
      if (!pair) {
        setError('Invalid token pair');
        return null;
      }

      try {
        const priceBps = BigInt(priceToBasisPoints(limitPriceUsd));
        const quantityRaw = BigInt(
          Math.floor(quantity * Math.pow(10, pair.baseToken.decimals))
        );

        let orderTxId: string;
        const timestamp = Math.floor(Date.now() / 1000);

        setStep('submitting');
        if (isBuy) {
          // BUY ORDER: escrow quote tokens (via token_registry.aleo)
          const escrowAmount = calculateEscrowAmount(true, quantityRaw, priceBps);
          orderTxId = await execTx({
            program: config.CONTRACT_PROGRAM_ID,
            function: 'submit_buy_order',
            inputs: [
              `${pairId}u64`,
              pair.quoteToken.tokenId,
              `${priceBps}u64`,
              `${quantityRaw}u128`,
              `${escrowAmount}u128`,
              `${timestamp}u32`,
              `${expiresAt}u32`,
              orchestratorAddr,
            ],
            fee: config.DEFAULT_FEE,
            privateFee: false,
          });
        } else {
          // SELL ORDER: escrow ALEO (via credits.aleo)
          const escrowAmount = quantityRaw;
          orderTxId = await execTx({
            program: config.CONTRACT_PROGRAM_ID,
            function: 'submit_sell_order',
            inputs: [
              `${pairId}u64`,
              pair.quoteToken.tokenId,
              `${priceBps}u64`,
              `${quantityRaw}u128`,
              `${Number(escrowAmount)}u64`,
              `${timestamp}u32`,
              `${expiresAt}u32`,
              orchestratorAddr,
            ],
            fee: config.DEFAULT_FEE,
            privateFee: false,
          });
        }

        setStep('polling-order');
        const orderResult = await pollTx(orderTxId);
        if (orderResult.status === 'rejected') {
          throw new Error('Order transaction rejected on-chain');
        }

        const confirmedId = orderResult.onChainId;
        setTxId(confirmedId);
        setStep('done');
        return confirmedId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to place order');
        setStep('idle');
        return null;
      }
    },
    [connected, address, execTx, pollTx, orchestratorAddr]
  );

  const stepLabel: Record<SubmitStep, string> = {
    idle: '',
    approving: 'Approving token spend...',
    'polling-approval': 'Waiting for approval confirmation...',
    submitting: 'Submitting order to chain...',
    'polling-order': 'Waiting for order confirmation...',
    done: 'Transaction complete!',
  };

  return {
    approveQuoteTokens,
    submitOrder,
    step,
    stepLabel,
    txId,
    approvalTxId,
    error,
    reset,
    receipt,
    orchestratorAddr,
    loadingOrchestrator,
  };
}
