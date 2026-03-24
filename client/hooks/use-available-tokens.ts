'use client';

/**
 * useAvailableTokens
 * Fetches available tokens from Provable API for pair creation.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  getAllProvableTokens,
  ProvableToken,
  formatTokenIdForContract,
} from '@/lib/aleo-service';

export interface TokenOption {
  id: string;           // Token ID formatted for contract (e.g., "1field")
  symbol: string;
  name: string;
  decimals: number;
  programName: string;
  iconUrl: string | null;
  verified: boolean;
  price: string | null;
}

function tokenToOption(token: ProvableToken): TokenOption {
  return {
    id: formatTokenIdForContract(token),
    symbol: token.symbol,
    name: token.display || token.symbol,
    decimals: token.decimals,
    programName: token.program_name,
    iconUrl: token.token_icon_url,
    verified: token.verified,
    price: token.price,
  };
}

export function useAvailableTokens() {
  const [tokens, setTokens] = useState<TokenOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const provableTokens = await getAllProvableTokens();

      // Convert to options and deduplicate by symbol
      const seen = new Set<string>();
      const options: TokenOption[] = [];

      for (const token of provableTokens) {
        // Skip tokens without valid symbol
        if (!token.symbol || token.symbol.length === 0) continue;

        // Deduplicate by symbol (keep first/verified one)
        const key = `${token.symbol}-${token.program_name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        options.push(tokenToOption(token));
      }

      // Sort: verified first, then by symbol
      options.sort((a, b) => {
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return a.symbol.localeCompare(b.symbol);
      });

      setTokens(options);
    } catch (err) {
      console.error('Failed to load tokens:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // Get token by ID
  const getTokenById = useCallback((id: string): TokenOption | undefined => {
    return tokens.find(t => t.id === id);
  }, [tokens]);

  // Filter verified tokens
  const verifiedTokens = useMemo(() => {
    return tokens.filter(t => t.verified);
  }, [tokens]);

  // Filter token_registry tokens
  const registryTokens = useMemo(() => {
    return tokens.filter(t => t.programName === 'token_registry.aleo');
  }, [tokens]);

  return {
    tokens,
    verifiedTokens,
    registryTokens,
    loading,
    error,
    refresh: loadTokens,
    getTokenById,
  };
}
