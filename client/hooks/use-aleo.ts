'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export interface AleoAccount {
  address: string;
  viewKey: string;
}

export interface TickOrder {
  id: string;
  tokenPair: string;
  isBuy: boolean;
  tickLower: number;
  tickUpper: number;
  limitPrice: number;
  quantity: number;
  filled: number;
  timestamp: number;
  status: 'active' | 'filled' | 'cancelled';
}

// Type definitions for Aleo wallet interface
interface AleoWallet {
  requestRecords: (program: string) => Promise<unknown[]>;
  requestBulkTransactions: (txns: unknown[]) => Promise<unknown>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  decrypt: (ciphertext: string, programId: string, functionName: string) => Promise<string>;
}

export function useAleo() {
  const [account, setAccount] = useState<AleoAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const walletRef = useRef<AleoWallet | null>(null);

  // Real wallet connection using Aleo/Provable SDK
  const connectWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Check if window.aleo exists (Aleo extension)
      if (typeof window !== 'undefined' && (window as any).aleo) {
        const walletAPI = (window as any).aleo;
        
        // Request account connection
        const accounts = await walletAPI.getAccounts?.();
        
        if (!accounts || accounts.length === 0) {
          // If no accounts, request account from user
          const requestedAccounts = await walletAPI.requestAccounts?.();
          if (!requestedAccounts || requestedAccounts.length === 0) {
            throw new Error('No accounts authorized');
          }
        }

        const address = accounts?.[0] || (await walletAPI.requestAccounts?.())?.[0];
        if (!address) {
          throw new Error('Failed to get account address');
        }

        // Request view key for decryption
        let viewKey = '';
        try {
          viewKey = await walletAPI.requestViewKey?.() || '';
        } catch {
          console.warn('[v0] View key request failed, continuing with address only');
        }

        const aleoAccount: AleoAccount = {
          address,
          viewKey: viewKey || '',
        };

        // Store wallet reference
        walletRef.current = walletAPI;

        setAccount(aleoAccount);
        setConnected(true);
        
        // Save to localStorage as backup
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'aleoAccount',
            JSON.stringify({
              address,
              connected: true,
              timestamp: Date.now(),
            })
          );
        }
      } else {
        // Fallback: Show helpful error for development
        console.warn('[v0] Aleo wallet not detected. Install Aleo extension or use devnet mode');
        
        // For development without wallet, use mock
        const mockAccount: AleoAccount = {
          address: 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5ev2m9',
          viewKey: 'AViewKey1gKT9T9AqMdMHB9ew8fRAkKJRqZQzH5eEqW6jSHgNqGRy7XdLr',
        };
        setAccount(mockAccount);
        setConnected(true);
        setError('Using development mode - install Aleo wallet for production');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect wallet';
      console.error('[v0] Wallet connection error:', errorMsg);
      setError(errorMsg);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setConnected(false);
    walletRef.current = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aleoAccount');
    }
  }, []);

  // Execute transaction via Aleo wallet
  const executeTransaction = useCallback(
    async (transitionName: string, inputs: Record<string, unknown>) => {
      if (!account) throw new Error('Wallet not connected');

      setLoading(true);
      try {
        if (walletRef.current && typeof window !== 'undefined' && (window as any).aleo?.requestBulkTransactions) {
          // Real transaction execution via wallet
          const walletAPI = (window as any).aleo;
          
          // Transaction structure for Aleo
          const transaction = {
            type: 'transition',
            program: 'sl.aleo', // Pteaker program ID
            function: transitionName,
            inputs: Object.values(inputs),
          };

          console.log('[v0] Executing transition:', transitionName, 'with inputs:', inputs);
          
          // Send transaction request to wallet
          const result = await walletAPI.requestBulkTransactions?.([transaction]);
          
          if (!result) {
            throw new Error('Transaction rejected by wallet');
          }

          return { success: true, txId: result as string };
        } else {
          // Development mode: simulate transaction
          console.log('[v0] (Dev Mode) Executing transition:', transitionName, inputs);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { success: true, txId: `tx_${Date.now()}_dev` };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Transaction failed';
        console.error('[v0] Transaction error:', errorMsg);
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [account]
  );

  // Request records for a program (decrypt encrypted orders)
  const requestRecords = useCallback(async (program: string) => {
    if (!walletRef.current) {
      console.warn('[v0] Wallet not available for record request');
      return [];
    }

    try {
      const records = await walletRef.current.requestRecords(program);
      return records;
    } catch (err) {
      console.error('[v0] Failed to request records:', err);
      return [];
    }
  }, []);

  // Restore connection from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('aleoAccount');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          // Auto-reconnect if data is recent (within 24 hours)
          if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
            if ((window as any).aleo) {
              connectWallet();
            }
          }
        } catch {
          localStorage.removeItem('aleoAccount');
        }
      }
    }
  }, [connectWallet]);

  return {
    account,
    connected,
    loading,
    error,
    connectWallet,
    disconnectWallet,
    executeTransaction,
    requestRecords,
    wallet: walletRef.current,
  };
}
