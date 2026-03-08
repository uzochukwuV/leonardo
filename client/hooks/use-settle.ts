'use client';

/**
 * useSettle
 * Two-step settlement for v5 contract:
 *   1. settle_match(buy_order_id, sell_order_id, timestamp) - validates and updates orders
 *   2. execute_transfers_* - transfers tokens based on token types
 *
 * Contract signatures:
 *   settle_match(public buy_order_id: field, public sell_order_id: field, public timestamp: u32)
 *   execute_transfers_arc21(buy_order_id, sell_order_id, base_token_id, quote_token_id, fill_qty, quote_amount, seller_receives, settler_fee, buyer, seller)
 *   execute_transfers_credits_base(buy_order_id, sell_order_id, quote_token_id, fill_qty, quote_amount, seller_receives, settler_fee, buyer, seller)
 *   execute_transfers_credits_quote(buy_order_id, sell_order_id, base_token_id, fill_qty, seller_receives, settler_fee, buyer, seller)
 *   execute_transfers_credits_both(buy_order_id, sell_order_id, fill_qty, seller_receives, settler_fee, buyer, seller)
 */

import { useState, useCallback } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

export type TokenTransferType = 'arc21' | 'credits_base' | 'credits_quote' | 'credits_both' | 'usdc_quote' | 'arc21_usdc';
export type SettleStep = 'idle' | 'settling' | 'transferring' | 'done';

export interface SettleParams {
  /** Buy order ID (field) */
  buyOrderId: string;
  /** Sell order ID (field) */
  sellOrderId: string;
  /** Base token ID */
  baseTokenId: string;
  /** Quote token ID */
  quoteTokenId: string;
  /** Fill quantity (base token units) */
  fillQty: bigint;
  /** Quote amount (quote token units) */
  quoteAmount: bigint;
  /** Amount seller receives after fees */
  sellerReceives: bigint;
  /** Fee for settler */
  settlerFee: bigint;
  /** Buyer address */
  buyer: string;
  /** Seller address */
  seller: string;
}

/**
 * Determine transfer type based on token IDs
 */
function getTransferType(baseTokenId: string, quoteTokenId: string): TokenTransferType {
  const baseNative = baseTokenId === config.NATIVE_CREDITS_ID;
  const quoteNative = quoteTokenId === config.NATIVE_CREDITS_ID;
  const quoteCircleUsdc = quoteTokenId === config.CIRCLE_USDC_ID;

  if (baseNative && quoteNative) return 'credits_both';
  if (baseNative && quoteCircleUsdc) return 'usdc_quote';  // ALEO/USDC
  if (baseNative) return 'credits_base';
  if (quoteNative) return 'credits_quote';
  if (quoteCircleUsdc) return 'arc21_usdc';  // TOKEN/USDC
  return 'arc21';
}

export function useSettle() {
  const { connected, execTx, pollTx } = useContract();
  const [step, setStep] = useState<SettleStep>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setTxId(null);
    setError(null);
  }, []);

  const settle = useCallback(
    async (params: SettleParams): Promise<string | null> => {
      const {
        buyOrderId,
        sellOrderId,
        baseTokenId,
        quoteTokenId,
        fillQty,
        quoteAmount,
        sellerReceives,
        settlerFee,
        buyer,
        seller,
      } = params;

      setError(null);
      setTxId(null);

      if (!connected) {
        setError('Connect your wallet first');
        return null;
      }

      try {
        const timestamp = Math.floor(Date.now() / 1000);

        // Step 1: settle_match - validates and updates order state
        setStep('settling');
        const settleTxId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'settle_match',
          inputs: [
            buyOrderId,
            sellOrderId,
            `${timestamp}u32`,
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        const settleResult = await pollTx(settleTxId);
        if (settleResult.status === 'rejected') {
          throw new Error('Settlement validation rejected on-chain');
        }

        // Step 2: execute_transfers - transfer tokens based on type
        setStep('transferring');
        const transferType = getTransferType(baseTokenId, quoteTokenId);

        let transferTxId: string;

        switch (transferType) {
          case 'arc21':
            // Both tokens are ARC-21
            transferTxId = await execTx({
              program: config.CONTRACT_PROGRAM_ID,
              function: 'execute_transfers_arc21',
              inputs: [
                buyOrderId,
                sellOrderId,
                baseTokenId,
                quoteTokenId,
                `${fillQty}u128`,
                `${quoteAmount}u128`,
                `${sellerReceives}u128`,
                `${settlerFee}u128`,
                buyer,
                seller,
              ],
              fee: config.DEFAULT_FEE,
              privateFee: false,
            });
            break;

          case 'credits_base':
            // Base is native ALEO, quote is ARC-21
            transferTxId = await execTx({
              program: config.CONTRACT_PROGRAM_ID,
              function: 'execute_transfers_credits_base',
              inputs: [
                buyOrderId,
                sellOrderId,
                quoteTokenId,
                `${fillQty}u64`, // Native uses u64
                `${quoteAmount}u128`,
                `${sellerReceives}u128`,
                `${settlerFee}u128`,
                buyer,
                seller,
              ],
              fee: config.DEFAULT_FEE,
              privateFee: false,
            });
            break;

          case 'credits_quote':
            // Base is ARC-21, quote is native ALEO
            transferTxId = await execTx({
              program: config.CONTRACT_PROGRAM_ID,
              function: 'execute_transfers_credits_quote',
              inputs: [
                buyOrderId,
                sellOrderId,
                baseTokenId,
                `${fillQty}u128`,
                `${sellerReceives}u64`, // Native uses u64
                `${settlerFee}u64`,
                buyer,
                seller,
              ],
              fee: config.DEFAULT_FEE,
              privateFee: false,
            });
            break;

          case 'credits_both':
            // Both are native ALEO
            transferTxId = await execTx({
              program: config.CONTRACT_PROGRAM_ID,
              function: 'execute_transfers_credits_both',
              inputs: [
                buyOrderId,
                sellOrderId,
                `${fillQty}u64`,
                `${sellerReceives}u64`,
                `${settlerFee}u64`,
                buyer,
                seller,
              ],
              fee: config.DEFAULT_FEE,
              privateFee: false,
            });
            break;

          case 'usdc_quote':
            // Base is native ALEO, quote is Circle USDC
            transferTxId = await execTx({
              program: config.CONTRACT_PROGRAM_ID,
              function: 'execute_transfers_usdc_quote',
              inputs: [
                buyOrderId,
                sellOrderId,
                `${fillQty}u64`,        // Native ALEO uses u64
                `${sellerReceives}u128`, // Circle USDC uses u128
                `${settlerFee}u128`,
                buyer,
                seller,
              ],
              fee: config.DEFAULT_FEE,
              privateFee: false,
            });
            break;

          case 'arc21_usdc':
            // Base is ARC-21, quote is Circle USDC
            transferTxId = await execTx({
              program: config.CONTRACT_PROGRAM_ID,
              function: 'execute_transfers_arc21_usdc',
              inputs: [
                buyOrderId,
                sellOrderId,
                baseTokenId,
                `${fillQty}u128`,
                `${sellerReceives}u128`, // Circle USDC uses u128
                `${settlerFee}u128`,
                buyer,
                seller,
              ],
              fee: config.DEFAULT_FEE,
              privateFee: false,
            });
            break;
        }

        const transferResult = await pollTx(transferTxId);
        if (transferResult.status === 'rejected') {
          throw new Error('Token transfer rejected on-chain');
        }

        setTxId(transferResult.onChainId);
        setStep('done');
        return transferResult.onChainId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Settlement failed');
        setStep('idle');
        return null;
      }
    },
    [connected, execTx, pollTx]
  );

  const stepLabel: Record<SettleStep, string> = {
    idle: '',
    settling: 'Validating match...',
    transferring: 'Executing transfers...',
    done: 'Settlement complete!',
  };

  return { settle, step, stepLabel, txId, error, reset };
}
