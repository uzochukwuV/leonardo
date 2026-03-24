'use client';

/**
 * usePairPrices
 * Fetches best bid/ask prices from the keeper bot API.
 * Updates periodically to show users optimal prices for quick fills.
 */

import { useState, useCallback, useEffect } from 'react';
import { config } from '@/lib/config';

export interface PairPrice {
  pairId: string;
  bestBid: { price: string; quantity: string } | null;
  bestAsk: { price: string; quantity: string } | null;
  bidCount: number;
  askCount: number;
  spread: string | null;
  midPrice: string | null;
  updatedAt: string;
}

export interface PairPricesResponse {
  pairs: Record<string, PairPrice>;
  pairCount: number;
  lastScanAt: string | null;
}

export function usePairPrices(refreshInterval = 15000) {
  const [prices, setPrices] = useState<Record<string, PairPrice>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`${config.KEEPER_API_URL}/api/pairs`);
      if (!res.ok) {
        throw new Error('Failed to fetch pair prices');
      }

      const data: PairPricesResponse = await res.json();
      setPrices(data.pairs || {});
      setLastUpdate(data.lastScanAt);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch pair prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Periodic refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(fetchPrices, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchPrices, refreshInterval]);

  // Get price for specific pair
  const getPairPrice = useCallback((pairId: number | string): PairPrice | null => {
    return prices[String(pairId)] || null;
  }, [prices]);

  // Get best bid price for a pair (in USD)
  const getBestBid = useCallback((pairId: number | string): number | null => {
    const pair = prices[String(pairId)];
    if (!pair?.bestBid?.price) return null;
    return parseInt(pair.bestBid.price, 10) / 10000; // Convert from basis points
  }, [prices]);

  // Get best ask price for a pair (in USD)
  const getBestAsk = useCallback((pairId: number | string): number | null => {
    const pair = prices[String(pairId)];
    if (!pair?.bestAsk?.price) return null;
    return parseInt(pair.bestAsk.price, 10) / 10000; // Convert from basis points
  }, [prices]);

  // Get mid price for a pair (in USD)
  const getMidPrice = useCallback((pairId: number | string): number | null => {
    const pair = prices[String(pairId)];
    if (!pair?.midPrice) return null;
    return parseInt(pair.midPrice, 10) / 10000; // Convert from basis points
  }, [prices]);

  return {
    prices,
    loading,
    error,
    lastUpdate,
    refresh: fetchPrices,
    getPairPrice,
    getBestBid,
    getBestAsk,
    getMidPrice,
  };
}
