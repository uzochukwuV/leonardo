'use client';

/**
 * useTokenBalances
 * Fetches token balances for supported tokens:
 *   - Native ALEO credits (from wallet adapter)
 *   - Circle USDC (from test_usdc_token.aleo public balance mapping)
 *   - ARC-21 tokens (from token_registry.aleo public balance mapping)
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { config } from '@/lib/config';
import { TOKENS, type TokenInfo } from '@/lib/token-pairs';

export interface TokenBalance {
  token: TokenInfo;
  balance: bigint;
  formatted: string;
  loading: boolean;
  error: string | null;
}

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
    // Parse JSON string if needed
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
    return BigInt(v.replace(/u128|u64/gi, '').trim());
  } catch {
    return 0n;
  }
}

function formatBalance(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function useTokenBalances() {
  const { address, connected, wallet } = useWallet() as any;
  const [balances, setBalances] = useState<Record<string, TokenBalance>>({});
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!connected || !address) {
      setBalances({});
      return;
    }

    setLoading(true);

    const newBalances: Record<string, TokenBalance> = {};

    // Supported tokens to fetch
    const tokensToFetch = [TOKENS.ALEO, TOKENS.USDC, TOKENS.TOKEN_A, TOKENS.TOKEN_B];

    await Promise.all(
      tokensToFetch.map(async (token) => {
        const key = token.symbol;
        newBalances[key] = {
          token,
          balance: 0n,
          formatted: '0.0000',
          loading: true,
          error: null,
        };

        try {
          let balance = 0n;

          if (token.isNative) {
            // Native ALEO: try wallet adapter first, fallback to credits.aleo mapping
            try {
              // Some wallet adapters expose balance directly
              if (wallet?.adapter?.getBalance) {
                const walletBalance = await wallet.adapter.getBalance();
                balance = BigInt(walletBalance ?? 0);
              } else {
                // Fallback: query credits.aleo account mapping
                const raw = await fetchMappingValue(
                  'credits.aleo',
                  'account',
                  address
                );
                if (raw) {
                  balance = parseU128(raw);
                }
              }
            } catch {
              // Try mapping query as last resort
              const raw = await fetchMappingValue(
                'credits.aleo',
                'account',
                address
              );
              if (raw) {
                balance = parseU128(raw);
              }
            }
          } else if (token.isCircleUsdc) {
            // Circle USDC: query test_usdc_token.aleo account mapping
            const raw = await fetchMappingValue(
              'test_usdc_token.aleo',
              'account',
              address
            );
            if (raw) {
              balance = parseU128(raw);
            }
          } else if (token.tokenId) {
            // ARC-21 tokens: query token_registry.aleo
            // Key format: hash of (token_id, address) - simplified: just token_id for now
            const raw = await fetchMappingValue(
              'token_registry.aleo',
              'authorized_balances',
              `{ token_id: ${token.tokenId}, account: ${address} }`
            );
            if (raw) {
              balance = parseU128(raw);
            }
          }

          newBalances[key] = {
            token,
            balance,
            formatted: formatBalance(balance, token.decimals),
            loading: false,
            error: null,
          };
        } catch (err) {
          newBalances[key] = {
            token,
            balance: 0n,
            formatted: '0.0000',
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to fetch',
          };
        }
      })
    );

    setBalances(newBalances);
    setLoading(false);
  }, [connected, address, wallet]);

  // Fetch on mount and when address changes
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(fetchBalances, 30_000);
    return () => clearInterval(interval);
  }, [connected, fetchBalances]);

  return {
    balances,
    loading,
    refresh: fetchBalances,
    // Convenience getters
    aleoBalance: balances['ALEO'],
    usdcBalance: balances['USDC'],
    tokenABalance: balances['TKNA'],
    tokenBBalance: balances['TKNB'],
  };
}
