'use client';

/**
 * useTokenBalances
 * Fetches token balances for supported tokens using the Record Scanning Service (RSS).
 * Balances are derived from unspent records owned by the user.
 *
 * It still uses a direct mapping query for allowances, as the RSS is focused
 * on record discovery, not mapping values.
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { config } from '@/lib/config';
import { TOKENS, type TokenInfo } from '@/lib/token-pairs';
import { getRecordsForViewKey } from '@/lib/aleo-record-scanner';
import { Account } from '@provablehq/sdk';

export interface TokenBalance {
  token: TokenInfo;
  balance: bigint;
  formatted: string;
  loading: boolean;
  error: string | null;
  allowances: Record<string, bigint>; // Spender address -> amount
}

// Kept for fetching allowances, which are mappings not records
async function fetchMappingValue(
  program: string,
  mapping: string,
  key: string
): Promise<string | null> {
  try {
    const url = `${config.ALEO_API_BASE}/program/${program}/mapping/${mapping}/${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text) as string;
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function parseU128(v: string): bigint {
  try {
    // Handle formats like "1000u128", "1000u64", or just "1000"
    return BigInt(v.replace(/u(128|64|32|16|8)/g, '').trim());
  } catch {
    return 0n;
  }
}

function formatBalance(amount: bigint, decimals: number): string {
  if (typeof amount !== 'bigint') {
    return '0.0000';
  }
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function useTokenBalances() {
  const { address, connected, wallet } = useWallet() as any;
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!connected || !address || !wallet?.adapter?.getViewKey) {
      setBalances([]);
      return;
    }

    setLoading(true);

    try {
      const viewKey = await wallet.adapter.getViewKey();
      if (!viewKey) {
        throw new Error('View key not available from wallet');
      }

      // Fetch all unspent records for the user
      const allRecords = await getRecordsForViewKey(viewKey);

      const newBalances: Record<string, TokenBalance> = {};
      const tokensToFetch = [TOKENS.ALEO, TOKENS.USDC, TOKENS.TOKEN_A, TOKENS.TOKEN_B];

      // Initialize balances
      tokensToFetch.forEach(token => {
        newBalances[token.symbol] = {
          token,
          balance: 0n,
          formatted: '0.0000',
          loading: false,
          error: null,
          allowances: {},
        };
      });

      // Process records to calculate balances
      for (const record of allRecords) {
        const programId = record.program_id;
        let token: TokenInfo | undefined;
        let amount = 0n;

        if (programId === 'credits.aleo' && record.data.microcredits) {
          token = TOKENS.ALEO;
          amount = parseU128(record.data.microcredits);
        } else if (programId === config.TOKEN_REGISTRY_PROGRAM) {
           // This part is an assumption based on a typical ARC-21 structure
           // The actual record structure from your token program might differ
           const tokenIdFromRecord = record.data.token_id; // e.g. '1field'
           token = tokensToFetch.find(t => t.tokenId === tokenIdFromRecord);
           if (record.data.amount) {
             amount = parseU128(record.data.amount);
           }
        }
        // Add other token logic here if they have unique program IDs

        if (token && newBalances[token.symbol]) {
          newBalances[token.symbol].balance += amount;
        }
      }

      // Fetch allowances (still requires mapping queries)
      for (const token of tokensToFetch) {
        if (!token.isNative && token.tokenId) {
          try {
            const raw = await fetchMappingValue(
              config.TOKEN_REGISTRY_PROGRAM,
              'authorized_balances',
              `{ token_id: ${token.tokenId}, account: ${address} }`
            );
            if (raw) {
              // This is a simplification. The mapping likely holds spender->amount.
              // We'll assume for now it's just one allowance to our contract.
              const allowanceAmount = parseU128(raw);
              if (newBalances[token.symbol]) {
                newBalances[token.symbol].allowances[config.PROGRAM_ADDRESS] = allowanceAmount;
              }
            }
          } catch (err) {
             console.error(`Failed to fetch allowance for ${token.symbol}:`, err);
          }
        }
      }


      // Finalize formatting
      const finalBalances = Object.values(newBalances).map(b => ({
        ...b,
        formatted: formatBalance(b.balance, b.token.decimals),
      }));

      setBalances(finalBalances);
    } catch (err) {
      console.error('Failed to fetch token balances:', err);
      // Optionally set an error state for the whole hook
    } finally {
      setLoading(false);
    }
  }, [connected, address, wallet]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(fetchBalances, 45_000); // Increased interval
    return () => clearInterval(interval);
  }, [connected, fetchBalances]);

  const getBalanceBySymbol = (symbol: string) => balances.find(b => b.token.symbol === symbol);

  return {
    balances,
    loading,
    refresh: fetchBalances,
    // Convenience getters
    aleoBalance: getBalanceBySymbol('ALEO'),
    usdcBalance: getBalanceBySymbol('USDC'),
    tokenABalance: getBalanceBySymbol('TKNA'),
    tokenBBalance: getBalanceBySymbol('TKNB'),
  };
}
