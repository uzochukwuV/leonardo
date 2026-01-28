'use client';

import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import {
  Transaction,
  WalletAdapterNetwork,
  WalletNotConnectedError,
} from '@demox-labs/aleo-wallet-adapter-base';
import { useCallback, useState } from 'react';
import { config } from '@/lib/config';
import { buildSubmitOrderInputs, buildSubmitOrderWithEscrowInputs, monitorTransaction } from '@/lib/transaction-utils';
import { parseOrderRecord, type OrderRecord } from '@/lib/aleo-contract';
import type { TransactionStatus } from '@/lib/aleo-service';

// --- Types ---

export interface PendingTransaction {
  txId: string;
  type: 'submit_order' | 'cancel_order' | 'update_order';
  status: TransactionStatus['status'];
  submittedAt: number;
}

/**
 * Hook for all wallet-based operations against the order book contract.
 * Uses the @demox-labs wallet adapter for transaction signing.
 */
export function useWalletOperations() {
  const {
    publicKey,
    connected,
    requestTransaction,
    requestRecords,
    decrypt,
    signMessage,
    transactionStatus,
  } = useWallet();

  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Order submission ---

  const submitOrder = useCallback(
    async (params: {
      tokenPairId: number;
      isBuy: boolean;
      tickLower: number;
      tickUpper: number;
      limitPrice: number;
      quantity: number;
    }): Promise<string> => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestTransaction) throw new Error('Wallet does not support transactions');

      setLoading(true);
      setError(null);

      try {
        const inputs = buildSubmitOrderInputs(params);

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          config.CONTRACT_PROGRAM_ID,
          'submit_tick_order',
          inputs,
          config.DEFAULT_FEE
        );

        const txId = await requestTransaction(transaction);

        const pendingTx: PendingTransaction = {
          txId,
          type: 'submit_order',
          status: 'pending',
          submittedAt: Date.now(),
        };
        setPendingTxs(prev => [pendingTx, ...prev]);

        monitorTransaction(txId, (status) => {
          setPendingTxs(prev =>
            prev.map(tx => tx.txId === txId ? { ...tx, status: status.status } : tx)
          );
        });

        return txId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Order submission failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  const submitOrderWithEscrow = useCallback(
    async (params: {
      tokenPairId: number;
      isBuy: boolean;
      tickLower: number;
      tickUpper: number;
      limitPrice: number;
      quantity: number;
      escrowTokenRecord: string;
    }): Promise<string> => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestTransaction) throw new Error('Wallet does not support transactions');

      setLoading(true);
      setError(null);

      try {
        const inputs = buildSubmitOrderWithEscrowInputs(params);

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          config.CONTRACT_PROGRAM_ID,
          'submit_tick_order_with_escrow',
          inputs,
          config.DEFAULT_FEE
        );

        const txId = await requestTransaction(transaction);

        setPendingTxs(prev => [{
          txId,
          type: 'submit_order',
          status: 'pending',
          submittedAt: Date.now(),
        }, ...prev]);

        monitorTransaction(txId, (status) => {
          setPendingTxs(prev =>
            prev.map(tx => tx.txId === txId ? { ...tx, status: status.status } : tx)
          );
        });

        return txId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Order submission failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  // --- Order cancellation ---

  const cancelOrder = useCallback(
    async (orderRecord: string): Promise<string> => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestTransaction) throw new Error('Wallet does not support transactions');

      setLoading(true);
      setError(null);

      try {
        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          config.CONTRACT_PROGRAM_ID,
          'cancel_order_with_refund',
          [orderRecord],
          config.DEFAULT_FEE
        );

        const txId = await requestTransaction(transaction);

        setPendingTxs(prev => [{
          txId,
          type: 'cancel_order',
          status: 'pending',
          submittedAt: Date.now(),
        }, ...prev]);

        monitorTransaction(txId, (status) => {
          setPendingTxs(prev =>
            prev.map(tx => tx.txId === txId ? { ...tx, status: status.status } : tx)
          );
        });

        return txId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Order cancellation failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  // --- Record fetching ---

  const fetchOrderRecords = useCallback(
    async (): Promise<OrderRecord[]> => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestRecords) throw new Error('Wallet does not support record requests');

      try {
        const rawRecords = await requestRecords(config.CONTRACT_PROGRAM_ID);
        if (!rawRecords || !Array.isArray(rawRecords)) return [];

        const orders: OrderRecord[] = [];
        for (const record of rawRecords) {
          const plaintext = typeof record === 'string'
            ? record
            : (record as Record<string, unknown>)?.plaintext as string
              || (record as Record<string, unknown>)?.data as string
              || '';

          if (!plaintext) continue;
          const parsed = parseOrderRecord(plaintext);
          if (parsed) orders.push(parsed);
        }

        return orders;
      } catch (err) {
        console.error('[useWalletOperations] Error fetching records:', err);
        return [];
      }
    },
    [publicKey, requestRecords]
  );

  const fetchTokenRecords = useCallback(
    async (tokenProgram: string = 'token_registry.aleo') => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!requestRecords) throw new Error('Wallet does not support record requests');
      return await requestRecords(tokenProgram);
    },
    [publicKey, requestRecords]
  );

  // --- Decryption ---

  const decryptRecord = useCallback(
    async (ciphertext: string): Promise<string> => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!decrypt) throw new Error('Wallet does not support decryption');
      return await decrypt(ciphertext);
    },
    [publicKey, decrypt]
  );

  // --- Message signing ---

  const sign = useCallback(
    async (message: string): Promise<string> => {
      if (!publicKey) throw new WalletNotConnectedError();
      if (!signMessage) throw new Error('Wallet does not support signing');
      const bytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(bytes);
      return new TextDecoder().decode(signatureBytes);
    },
    [publicKey, signMessage]
  );

  // --- Transaction status ---

  const checkTransactionStatus = useCallback(
    async (txId: string) => {
      if (!transactionStatus) return null;
      return await transactionStatus(txId);
    },
    [transactionStatus]
  );

  const clearError = useCallback(() => setError(null), []);

  const clearPendingTxs = useCallback(() => {
    setPendingTxs(prev => prev.filter(tx => tx.status === 'pending'));
  }, []);

  return {
    publicKey,
    connected,
    submitOrder,
    submitOrderWithEscrow,
    cancelOrder,
    fetchOrderRecords,
    fetchTokenRecords,
    decryptRecord,
    sign,
    checkTransactionStatus,
    pendingTxs,
    loading,
    error,
    clearError,
    clearPendingTxs,
  };
}
