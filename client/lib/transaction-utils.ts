/**
 * Transaction Utilities
 * Functions for building Aleo transaction inputs and monitoring transaction status.
 */

import { config } from './config';
import { aleoService, type TransactionStatus } from './aleo-service';

// --- Transaction input builders ---

/**
 * Build inputs array for submit_tick_order transition.
 */
export function buildSubmitOrderInputs(params: {
  tokenPairId: number;
  isBuy: boolean;
  tickLower: number;
  tickUpper: number;
  limitPrice: number;
  quantity: number;
}): string[] {
  const timestamp = Math.floor(Date.now() / 1000);
  return [
    `${params.tokenPairId}u64`,
    params.isBuy ? 'true' : 'false',
    `${params.tickLower}u64`,
    `${params.tickUpper}u64`,
    `${timestamp}u32`,
    `${params.limitPrice}u64`,
    `${params.quantity}u64`,
  ];
}

/**
 * Build inputs array for submit_tick_order_with_escrow transition.
 */
export function buildSubmitOrderWithEscrowInputs(params: {
  tokenPairId: number;
  isBuy: boolean;
  tickLower: number;
  tickUpper: number;
  limitPrice: number;
  quantity: number;
  escrowTokenRecord: string;
}): string[] {
  const timestamp = Math.floor(Date.now() / 1000);
  return [
    `${params.tokenPairId}u64`,
    params.isBuy ? 'true' : 'false',
    `${params.tickLower}u64`,
    `${params.tickUpper}u64`,
    `${timestamp}u32`,
    `${params.limitPrice}u64`,
    `${params.quantity}u64`,
    params.escrowTokenRecord,
  ];
}

/**
 * Build inputs array for update_order transition.
 */
export function buildUpdateOrderInputs(params: {
  orderRecord: string;
  newTickLower: number;
  newTickUpper: number;
  newLimitPrice: number;
  newQuantity: number;
}): string[] {
  return [
    params.orderRecord,
    `${params.newTickLower}u64`,
    `${params.newTickUpper}u64`,
    `${params.newLimitPrice}u64`,
    `${params.newQuantity}u64`,
  ];
}

/**
 * Build inputs array for cancel_order transition.
 */
export function buildCancelOrderInputs(orderRecord: string): string[] {
  return [orderRecord];
}

/**
 * Build inputs array for cancel_order_with_refund transition.
 */
export function buildCancelWithRefundInputs(orderRecord: string): string[] {
  return [orderRecord];
}

// --- Transaction monitoring ---

export type TxMonitorCallback = (status: TransactionStatus) => void;

/**
 * Poll the Aleo API until a transaction is confirmed or fails.
 * Returns the final status.
 */
export async function monitorTransaction(
  txId: string,
  onStatusChange?: TxMonitorCallback,
  pollInterval: number = config.TX_POLL_INTERVAL,
  maxAttempts: number = config.TX_MAX_POLL_ATTEMPTS
): Promise<TransactionStatus> {
  let lastStatus: TransactionStatus['status'] = 'not_found';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await aleoService.getTransactionStatus(txId);

    if (status.status !== lastStatus) {
      lastStatus = status.status;
      onStatusChange?.(status);
    }

    if (status.status === 'confirmed' || status.status === 'rejected') {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timed out
  const finalStatus: TransactionStatus = {
    status: 'not_found',
    transactionId: txId,
  };
  onStatusChange?.(finalStatus);
  return finalStatus;
}

// --- Display helpers ---

/**
 * Format a transaction ID for display.
 */
export function formatTxId(txId: string): string {
  if (!txId || txId.length <= 16) return txId || '';
  return `${txId.slice(0, 10)}...${txId.slice(-8)}`;
}

/**
 * Get a human-readable status label.
 */
export function getStatusLabel(status: TransactionStatus['status']): string {
  switch (status) {
    case 'confirmed': return 'Confirmed';
    case 'pending': return 'Pending';
    case 'rejected': return 'Rejected';
    case 'not_found': return 'Processing';
    default: return 'Unknown';
  }
}

/**
 * Get a CSS class for status badge coloring.
 */
export function getStatusColor(status: TransactionStatus['status']): string {
  switch (status) {
    case 'confirmed': return 'bg-green-500/20 text-green-600';
    case 'pending': return 'bg-yellow-500/20 text-yellow-600';
    case 'rejected': return 'bg-red-500/20 text-red-600';
    case 'not_found': return 'bg-blue-500/20 text-blue-600';
    default: return 'bg-muted text-muted-foreground';
  }
}

/**
 * Estimate fee in credits (display-friendly).
 */
export function estimateFeeCredits(feeInMicrocredits: number = config.DEFAULT_FEE): string {
  return (feeInMicrocredits / 1_000_000).toFixed(6);
}
