'use client';

/**
 * useSubmitOrder
 * Order submission for private_matching_orderbook_v1.aleo
 *
 * Functions:
 *   submit_buy_order - Buy base token with token_registry/USDCx tokens
 *   submit_buy_order_usdcx - Buy base token with USDCx (quote = 7000field)
 *   submit_sell_order - Sell base token for token_registry/USDCx tokens
 *   submit_sell_order_usdcx - Sell USDCx for token_registry tokens (base = USDCx)
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

         // For buy orders: escrow quote tokens
         // For sell orders: escrow base tokens
         const isBuyOrder = isBuy;
         const escrowAmount = calculateEscrowAmount(isBuyOrder, quantityRaw, priceBps);

         setStep('approving');

         // Determine which token needs approval and which program to use
         const needsApproval = !isBuyOrder 
           ? pair.baseToken.tokenId !== '0field' // sell order: non-native base token needs approval
           : pair.quoteToken.tokenId !== '0field'; // buy order: non-native quote token needs approval
         
         if (!needsApproval) {
           // Native token (ALEO) doesn't need approval
           setStep('idle');
           return null;
         }

         const tokenToApprove = isBuyOrder 
           ? pair.quoteToken.tokenId 
           : pair.baseToken.tokenId;
         const isUsdcxToken = tokenToApprove === config.USDCX_TOKEN_ID;
         const approvalProgram = isUsdcxToken
           ? config.USDCX_PROGRAM
           : config.TOKEN_REGISTRY_PROGRAM;

         // USDCx uses approve_public(spender, amount) - no token_id
         // token_registry uses approve_public(token_id, spender, amount)
         const approvalInputs = isUsdcxToken
           ? [config.CONTRACT_PROGRAM_ID, `${escrowAmount}u128`]
           : [tokenToApprove, config.CONTRACT_PROGRAM_ID, `${escrowAmount}u128`];

         const txId = await execTx({
           program: approvalProgram,
           function: 'approve_public',
           inputs: approvalInputs,
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
           // BUY ORDER: escrow quote tokens
           const escrowAmount = calculateEscrowAmount(true, quantityRaw, priceBps);

           if (pair.quoteToken.tokenId === config.USDCX_TOKEN_ID) {
             // Buy base token with USDCx (quote = 7000field)
             orderTxId = await execTx({
               program: config.CONTRACT_PROGRAM_ID,
               function: 'submit_buy_order_usdcx',
               inputs: [
                 `${pairId}u64`,
                 pair.baseToken.tokenId,           // base_token_id (new param)
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
             // Buy base token with token_registry tokens
             orderTxId = await execTx({
               program: config.CONTRACT_PROGRAM_ID,
               function: 'submit_buy_order',
               inputs: [
                 `${pairId}u64`,
                 pair.baseToken.tokenId,           // base_token_id (new param)
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
           }
         } else {
           // SELL ORDER: escrow base tokens
           const escrowAmount = quantityRaw;

           if (pair.baseToken.tokenId === config.USDCX_TOKEN_ID) {
             // Sell USDCx for quote tokens (base = 7000field)
             orderTxId = await execTx({
               program: config.CONTRACT_PROGRAM_ID,
               function: 'submit_sell_order_usdcx',
               inputs: [
                 `${pairId}u64`,
                 pair.quoteToken.tokenId,          // quote_token_id (was base_token_id)
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
             // Sell base token for token_registry tokens
             orderTxId = await execTx({
               program: config.CONTRACT_PROGRAM_ID,
               function: 'submit_sell_order',
               inputs: [
                 `${pairId}u64`,
                 pair.baseToken.tokenId,           // base_token_id (new param)
                 pair.quoteToken.tokenId,
                 `${priceBps}u64`,
                 `${quantityRaw}u128`,
                 `${escrowAmount}u128`,            // changed from u64 to u128
                 `${timestamp}u32`,
                 `${expiresAt}u32`,
                 orchestratorAddr,
               ],
               fee: config.DEFAULT_FEE,
               privateFee: false,
             });
           }
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
