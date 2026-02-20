'use client';

/**
 * useSubmitOrder
 * Two-step order placement flow:
 *   1. token_registry.aleo/approve_public  — grants escrow pull to program
 *   2. private_orderbook_v4.aleo/submit_order_with_escrow — submits the order
 *
 * Contract signature (main.leo):
 *   submit_order_with_escrow(
 *     public  token_pair:  u64,
 *     public  is_buy:      bool,
 *     public  tick_lower:  u64,
 *     public  tick_upper:  u64,
 *     public  timestamp:   u32,
 *     public  expires_at:  u32,
 *     private limit_price: u64,
 *     private quantity:    u128,
 *     public  token_id:    field
 *   )
 */

import { useState, useCallback } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';
import {
  getTokenPair,
  priceToBasisPoints,
  priceToTick,
  calculateEscrowAmount,
} from '@/lib/token-pairs';

export type SubmitStep = 'idle' | 'approving' | 'submitting' | 'polling' | 'done';

export interface SubmitOrderParams {
  pairId: number;
  isBuy: boolean;
  /** Tick lower bound as USD price */
  tickLowerUsd: number;
  /** Tick upper bound as USD price */
  tickUpperUsd: number;
  /** Exact limit price in USD (private input) */
  limitPriceUsd: number;
  /** Quantity in human units e.g. 100.5 ALEO (private input) */
  quantity: number;
  /** Block height expiry — 0 means no expiry */
  expiresAt?: number;
}

export function useSubmitOrder() {
  const { connected, address, execTx, pollTx } = useContract();
  const [step, setStep] = useState<SubmitStep>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setTxId(null);
    setError(null);
  }, []);

  const submitOrder = useCallback(
    async (params: SubmitOrderParams): Promise<string | null> => {
      const {
        pairId,
        isBuy,
        tickLowerUsd,
        tickUpperUsd,
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

      const pair = getTokenPair(pairId);
      if (!pair) {
        setError('Invalid token pair');
        return null;
      }

      try {
        const tickLowerId = priceToTick(tickLowerUsd, pair.tickSize);
        const tickUpperId = priceToTick(tickUpperUsd, pair.tickSize);
        const limitPriceBps = priceToBasisPoints(limitPriceUsd);
        const quantityRaw = BigInt(
          Math.floor(quantity * Math.pow(10, pair.baseToken.decimals))
        );
        const escrowToken = isBuy ? pair.quoteToken : pair.baseToken;
        const escrowAmt = calculateEscrowAmount(isBuy, quantityRaw, BigInt(limitPriceBps));
        const timestamp = Math.floor(Date.now() / 1000);

        // ── Step 1: approve_public ────────────────────────────────────────
        // Approve the program's on-chain address (not the program ID string)
        // to pull escrowAmt of the escrow token from the user's public balance.
        setStep('approving');
        const approveTxId = await execTx({
          program: 'token_registry.aleo',
          function: 'approve_public',
          inputs: [
            escrowToken.tokenId,        // token_id: field
            config.PROGRAM_ADDRESS,     // spender: the program's aleo address
            `${escrowAmt}u128`,         // amount: u128
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        const approveResult = await pollTx(approveTxId);
        if (approveResult.status === 'rejected') {
          throw new Error('Approve transaction rejected on-chain');
        }

        // ── Step 2: submit_order_with_escrow ──────────────────────────────
        setStep('submitting');
        const orderTxId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'submit_order_with_escrow',
          inputs: [
            `${pairId}u64`,             // public  token_pair
            `${isBuy}`,                  // public  is_buy
            `${tickLowerId}u64`,         // public  tick_lower
            `${tickUpperId}u64`,         // public  tick_upper
            `${timestamp}u32`,           // public  timestamp
            `${expiresAt}u32`,           // public  expires_at
            `${limitPriceBps}u64`,       // private limit_price
            `${quantityRaw}u128`,        // private quantity
            escrowToken.tokenId,         // public  token_id
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        // ── Step 3: poll ──────────────────────────────────────────────────
        setStep('polling');
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
    [connected, address, execTx, pollTx]
  );

  const stepLabel: Record<SubmitStep, string> = {
    idle: '',
    approving: 'Approving escrow in wallet...',
    submitting: 'Submitting order to chain...',
    polling: 'Waiting for confirmation...',
    done: 'Order confirmed!',
  };

  return { submitOrder, step, stepLabel, txId, error, reset };
}
