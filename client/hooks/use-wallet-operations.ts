'use client';

import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import {
  Transaction,
  WalletAdapterNetwork,
  WalletNotConnectedError,
} from '@demox-labs/aleo-wallet-adapter-base';
import { useCallback } from 'react';

/**
 * Hook for common wallet operations
 * Provides helpers for:
 * - Submitting orders with token escrow
 * - Requesting settlements
 * - Checking balances
 * - Decrypting records
 */
export function useWalletOperations() {
  const {
    publicKey,
    requestTransaction,
    requestRecords,
    decrypt,
    signMessage,
  } = useWallet();

  /**
   * Submit a tick order with token escrow
   */
  const submitOrder = useCallback(
    async (params: {
      tokenPair: number;
      isBuy: boolean;
      tickLower: number;
      tickUpper: number;
      limitPrice: number;
      quantity: number;
      escrowToken: string; // Serialized token record
    }) => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestTransaction) throw new Error('Wallet does not support transactions');

      const { tokenPair, isBuy, tickLower, tickUpper, limitPrice, quantity, escrowToken } = params;

      const inputs = [
        `${tokenPair}u64`,
        isBuy ? 'true' : 'false',
        `${tickLower}u64`,
        `${tickUpper}u64`,
        `${Math.floor(Date.now() / 1000)}u32`,
        `${limitPrice}u64`,
        `${quantity}u64`,
        escrowToken,
      ];

      const fee = 100_000; // 0.1 credits

      const transaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        'sl.aleo',
        'submit_tick_order_with_escrow',
        inputs,
        fee
      );

      const txId = await requestTransaction(transaction);
      return txId;
    },
    [publicKey, requestTransaction]
  );

  /**
   * Update an existing order
   */
  const updateOrder = useCallback(
    async (params: {
      oldOrderRecord: string;
      newTickLower: number;
      newTickUpper: number;
      newLimitPrice: number;
      newQuantity: number;
    }) => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestTransaction) throw new Error('Wallet does not support transactions');

      const { oldOrderRecord, newTickLower, newTickUpper, newLimitPrice, newQuantity } = params;

      const inputs = [
        oldOrderRecord,
        `${newTickLower}u64`,
        `${newTickUpper}u64`,
        `${newLimitPrice}u64`,
        `${newQuantity}u64`,
      ];

      const fee = 50_000;

      const transaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        'sl.aleo',
        'update_order',
        inputs,
        fee
      );

      return await requestTransaction(transaction);
    },
    [publicKey, requestTransaction]
  );

  /**
   * Cancel an order and get refund
   */
  const cancelOrder = useCallback(
    async (orderRecord: string) => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestTransaction) throw new Error('Wallet does not support transactions');

      const inputs = [orderRecord];
      const fee = 50_000;

      const transaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        'sl.aleo',
        'cancel_order_with_refund',
        inputs,
        fee
      );

      return await requestTransaction(transaction);
    },
    [publicKey, requestTransaction]
  );

  /**
   * Get token records for a specific program
   */
  const getTokenRecords = useCallback(
    async (tokenProgram: string = 'token_registry.aleo') => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestRecords) throw new Error('Wallet does not support record requests');

      return await requestRecords(tokenProgram);
    },
    [publicKey, requestRecords]
  );

  /**
   * Decrypt a ciphertext record
   */
  const decryptRecord = useCallback(
    async (ciphertext: string) => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!decrypt) throw new Error('Wallet does not support decryption');

      return await decrypt(ciphertext);
    },
    [publicKey, decrypt]
  );

  /**
   * Sign a message (for authentication or verification)
   */
  const sign = useCallback(
    async (message: string) => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!signMessage) throw new Error('Wallet does not support signing');

      const bytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(bytes);
      return new TextDecoder().decode(signatureBytes);
    },
    [publicKey, signMessage]
  );

  return {
    publicKey,
    submitOrder,
    updateOrder,
    cancelOrder,
    getTokenRecords,
    decryptRecord,
    sign,
  };
}
