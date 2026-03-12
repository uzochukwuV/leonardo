'use client';

/**
 * useSettle
 * Settlement for private_orderbook_v17.aleo
 * 
 * IMPORTANT: In v17, settle_match is a KEEPER-ONLY function.
 * Regular users cannot settle orders - only the orchestrator/keeper can.
 * 
 * Contract function:
 *   settle_match(
 *     buy_order: Order,      // Record owned by keeper
 *     sell_order: Order,     // Record owned by keeper
 *     fill_quantity: u128,
 *     fill_price: u64,       // Must be within bid-ask spread
 *     timestamp: u32,
 *     treasury_addr: address
 *   ) -> (Order, Order, SettlementProof, SettlementProof, Future)
 * 
 * The function returns updated Order records (for partial fills) and 
 * SettlementProof records for both traders.
 * 
 * Fee calculation:
 *   - settler_fee = quote_amount * 10 / 10000 (0.10%)
 *   - protocol_fee = quote_amount * 5 / 10000 (0.05%)
 *   - seller_receives = quote_amount - settler_fee - protocol_fee
 */

import { useState, useCallback } from 'react';
import { useContract } from './use-contract';
import { config } from '@/lib/config';

export type SettleStep = 'idle' | 'settling' | 'done';

export interface OrderRecord {
  owner: string;
  trader: string;
  order_id: string;
  pair_id: number;
  is_buy: boolean;
  price: number;
  quantity: bigint;
  quote_token_id: string;
  escrow_amount: bigint;
  filled: bigint;
  created_at: number;
  expires_at: number;
}

export interface SettleParams {
  buyOrder: OrderRecord;
  sellOrder: OrderRecord;
  fillQuantity: bigint;
  fillPrice: number;
  treasuryAddr: string;
}

export function useSettle() {
  const { connected, address, execTx, pollTx } = useContract();
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
        buyOrder,
        sellOrder,
        fillQuantity,
        fillPrice,
        treasuryAddr,
      } = params;

      setError(null);
      setTxId(null);

      if (!connected || !address) {
        setError('Connect your wallet first');
        return null;
      }

      // Validate orders
      if (buyOrder.is_buy !== true || sellOrder.is_buy !== false) {
        setError('Invalid order types: buy order must have is_buy=true, sell order must have is_buy=false');
        return null;
      }

      if (buyOrder.pair_id !== sellOrder.pair_id) {
        setError('Orders must be for the same pair');
        return null;
      }

      if (buyOrder.quote_token_id !== sellOrder.quote_token_id) {
        setError('Orders must use the same quote token');
        return null;
      }

      // Price must be within spread
      if (fillPrice < sellOrder.price || fillPrice > buyOrder.price) {
        setError(`Fill price must be within bid-ask spread: ${sellOrder.price} - ${buyOrder.price}`);
        return null;
      }

      // Validate quantities
      const buyRemaining = buyOrder.quantity - buyOrder.filled;
      const sellRemaining = sellOrder.quantity - sellOrder.filled;
      if (fillQuantity <= 0n || fillQuantity > buyRemaining || fillQuantity > sellRemaining) {
        setError('Invalid fill quantity');
        return null;
      }

      try {
        const timestamp = Math.floor(Date.now() / 1000);

        setStep('settling');
        
        // In v17, we pass the order records as structured inputs
        // The contract expects them in a specific format
        const settleTxId = await execTx({
          program: config.CONTRACT_PROGRAM_ID,
          function: 'settle_match',
          inputs: [
            // Buy order
            buyOrder.order_id,
            `${buyOrder.pair_id}u64`,
            `${buyOrder.is_buy}`,
            `${buyOrder.price}u64`,
            `${buyOrder.quantity}u128`,
            buyOrder.quote_token_id,
            `${buyOrder.escrow_amount}u128`,
            `${buyOrder.filled}u128`,
            `${buyOrder.created_at}u32`,
            `${buyOrder.expires_at}u32`,
            // Sell order  
            sellOrder.order_id,
            `${sellOrder.pair_id}u64`,
            `${sellOrder.is_buy}`,
            `${sellOrder.price}u64`,
            `${sellOrder.quantity}u128`,
            sellOrder.quote_token_id,
            `${sellOrder.escrow_amount}u128`,
            `${sellOrder.filled}u128`,
            `${sellOrder.created_at}u32`,
            `${sellOrder.expires_at}u32`,
            // Fill parameters
            `${fillQuantity}u128`,
            `${fillPrice}u64`,
            `${timestamp}u32`,
            treasuryAddr,
          ],
          fee: config.DEFAULT_FEE,
          privateFee: false,
        });

        const settleResult = await pollTx(settleTxId);
        if (settleResult.status === 'rejected') {
          throw new Error('Settlement rejected on-chain');
        }

        setTxId(settleResult.onChainId);
        setStep('done');
        return settleResult.onChainId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Settlement failed');
        setStep('idle');
        return null;
      }
    },
    [connected, address, execTx, pollTx]
  );

  const stepLabel: Record<SettleStep, string> = {
    idle: '',
    settling: 'Settling orders...',
    done: 'Settlement complete!',
  };

  return { settle, step, stepLabel, txId, error, reset };
}

/**
 * Calculate settlement amounts based on fill quantity and price
 */
export function calculateSettlementAmounts(
  fillQuantity: bigint,
  fillPriceBps: number
): {
  quoteAmount: bigint;
  settlerFee: bigint;
  protocolFee: bigint;
  sellerReceives: bigint;
} {
  const quoteAmount = (fillQuantity * BigInt(fillPriceBps)) / BigInt(10000);
  const settlerFee = (quoteAmount * BigInt(config.SETTLER_FEE_BPS)) / BigInt(10000);
  const protocolFee = (quoteAmount * BigInt(config.PROTOCOL_FEE_BPS)) / BigInt(10000);
  const sellerReceives = quoteAmount - settlerFee - protocolFee;

  return {
    quoteAmount,
    settlerFee,
    protocolFee,
    sellerReceives,
  };
}