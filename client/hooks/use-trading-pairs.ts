'use client';

/**
 * useTradingPairs
 * Fetches trading pairs dynamically from the blockchain.
 * Gets pair info from orderbook contract and token metadata from token_registry.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getAllPairsWithMetadata,
  getFullPairInfo,
  OnChainTokenMetadata,
} from '@/lib/aleo-service';

export interface TradingPair {
  id: number;
  name: string;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  tickSize: number;
  isActive: boolean;
}

export interface TokenInfo {
  tokenId: string;
  symbol: string;
  name: string;
  decimals: number;
}

// Helper to convert on-chain metadata to TokenInfo
function metadataToTokenInfo(metadata: OnChainTokenMetadata | null, tokenId: string): TokenInfo {
  if (!metadata) {
    // Fallback for unknown tokens
    return {
      tokenId,
      symbol: tokenId === '0field' ? 'ALEO' : `TKN-${tokenId.slice(0, 4)}`,
      name: tokenId === '0field' ? 'Aleo' : `Token ${tokenId}`,
      decimals: 6,
    };
  }

  return {
    tokenId: metadata.token_id,
    symbol: metadata.symbol || `TKN-${tokenId.slice(0, 4)}`,
    name: metadata.name || `Token ${tokenId}`,
    decimals: metadata.decimals,
  };
}

export function useTradingPairs() {
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPairs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const onChainPairs = await getAllPairsWithMetadata();

      const tradingPairs: TradingPair[] = onChainPairs
        .filter(p => p.is_active) // Only show active pairs
        .map(p => {
          const baseToken = metadataToTokenInfo(p.base_token, p.base_token_id);
          const quoteToken = metadataToTokenInfo(p.quote_token, p.quote_token_id);

          return {
            id: p.pair_id,
            name: `${baseToken.symbol}/${quoteToken.symbol}`,
            baseToken,
            quoteToken,
            tickSize: p.tick_size,
            isActive: p.is_active,
          };
        });

      setPairs(tradingPairs);
    } catch (err) {
      console.error('Failed to load trading pairs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pairs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load pairs on mount
  useEffect(() => {
    loadPairs();
  }, [loadPairs]);

  // Get a specific pair by ID
  const getPairById = useCallback((id: number): TradingPair | undefined => {
    return pairs.find(p => p.id === id);
  }, [pairs]);

  return {
    pairs,
    loading,
    error,
    refresh: loadPairs,
    getPairById,
  };
}

/**
 * Hook to load a single pair with full metadata.
 */
export function useTradingPair(pairId: number) {
  const [pair, setPair] = useState<TradingPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPair = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const onChainPair = await getFullPairInfo(pairId);

      if (!onChainPair) {
        setError('Pair not found');
        setPair(null);
        return;
      }

      const baseToken = metadataToTokenInfo(onChainPair.base_token, onChainPair.base_token_id);
      const quoteToken = metadataToTokenInfo(onChainPair.quote_token, onChainPair.quote_token_id);

      setPair({
        id: onChainPair.pair_id,
        name: `${baseToken.symbol}/${quoteToken.symbol}`,
        baseToken,
        quoteToken,
        tickSize: onChainPair.tick_size,
        isActive: onChainPair.is_active,
      });
    } catch (err) {
      console.error('Failed to load trading pair:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pair');
    } finally {
      setLoading(false);
    }
  }, [pairId]);

  useEffect(() => {
    loadPair();
  }, [loadPair]);

  return {
    pair,
    loading,
    error,
    refresh: loadPair,
  };
}
