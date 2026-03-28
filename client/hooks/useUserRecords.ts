'use client';

/**
 * useUserRecords
 *
 * This hook is responsible for fetching and managing user-specific records from
 * the private_matching_orderbook_v1.aleo smart contract. It uses the Record Scanning
 * Service (RSS) to efficiently find records owned by the connected user.
 *
 * It scans for two types of records:
 *   - Receipt: Proof of a submitted order.
 *   - SettlementProof: Proof of a filled order (a trade).
 *
 * Note: CancellationProof records are no longer supported in this version.
 *
 * The hook provides separate lists for each type of record, along with a
 * loading state and a function to manually refresh the data.
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { config } from '@/lib/config';

// Define interfaces for the records based on the smart contract
// These might need adjustments if the record-scanner returns data in a different format
export interface ReceiptRecord {
  owner: string;
  order_id: string;
  pair_id: string;
  is_buy: boolean;
  price: string;
  quantity: string;
  quote_token_id: string;
  escrow_amount: string;
  created_at: string;
}

export interface SettlementProofRecord {
  owner: string;
  order_id: string;
  fill_quantity: string;
  fill_price: string;
  received_token: string;
  received_amount: string;
  settled_at: string;
}

export interface CancellationProofRecord {
   owner: string;
   order_id: string;
   is_buy: boolean;
   returned_amount: string;
   cancelled_at: string;
 }

export function useUserRecords() {
   const { address, connected, wallet } = useWallet() as any;
   const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
   const [settlements, setSettlements] = useState<SettlementProofRecord[]>([]);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);

  const parseRecord = (record: any) => {
    // The RSS might return fields with 'u128', 'u64' suffixes.
    // This simple parser strips them and converts to string.
    const data: any = {};
    if (!record.data) return null;
    for (const key in record.data) {
      if (typeof record.data[key] === 'string') {
        data[key] = record.data[key].replace(/u\d+$/, '');
      }
    }
    return { ...data, owner: record.owner };
  };

  const fetchRecords = useCallback(async () => {
    if (!connected || !address || !wallet?.adapter?.getViewKey) {
      setReceipts([]);
      setSettlements([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const viewKey = await wallet.adapter.getViewKey();
      if (!viewKey) {
        throw new Error('View key not available from wallet.');
      }

      // Fetch all records for the contract
      const allRecords = await wallet.adapter.requestRecords(config.CONTRACT_PROGRAM_ID, false);

       const newReceipts: ReceiptRecord[] = [];
       const newSettlements: SettlementProofRecord[] = [];

       for (const record of allRecords) {
         if (!record.program_id || record.program_id !== config.CONTRACT_PROGRAM_ID) {
           continue;
         }

         const parsedData = parseRecord(record);
         if (!parsedData) continue;

         // The record 'name' might be available in record.name or determined by its structure
         // Assuming the RSS provides a 'name' field for the record type.
         // If not, we might need to check for unique fields in each record type.
         if (record.name === 'Receipt') {
           newReceipts.push(parsedData as ReceiptRecord);
         } else if (record.name === 'SettlementProof') {
           newSettlements.push(parsedData as SettlementProofRecord);
         }
       }

      // Sort records by time (most recent first)
      newReceipts.sort((a, b) => parseInt(b.created_at) - parseInt(a.created_at));
      newSettlements.sort((a, b) => parseInt(b.settled_at) - parseInt(a.settled_at));
       setReceipts(newReceipts);
       setSettlements(newSettlements);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      console.error('Failed to fetch user records:', err);
    } finally {
      setLoading(false);
    }
  }, [connected, address, wallet]);

  // Fetch on mount and when address changes
  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Optional: Auto-refresh
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(fetchRecords, 60_000); // Refresh every 60 seconds
    return () => clearInterval(interval);
  }, [connected, fetchRecords]);

   return {
     receipts,
     settlements,
     loading,
     error,
     refresh: fetchRecords,
   };
}
