'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { aleoService } from '@/lib/aleo-service';
import { config } from '@/lib/config';
import { getTokenPair, tickToPrice } from '@/lib/token-pairs';

// --- Types ---

export interface TickDisplayInfo {
  tickId: number;
  tickRange: { min: number; max: number };
  buyOrderCount: number;
  sellOrderCount: number;
  orderCount: number;
  volume: number;
}

export interface RecentTrade {
  id: string;
  side: 'buy' | 'sell';
  tickRange: { min: number; max: number };
  estimatedPrice: number;
  timestamp: number;
}

export interface MarketStats {
  lastPrice: number;
  volume24h: number;
  blockHeight: number;
  pairActive: boolean;
}

/**
 * Primary order book hook.
 * Queries the Aleo blockchain for token pair status and block height.
 * Maintains local order book state populated from:
 *  1. On-chain mapping queries (token pair status)
 *  2. Local tracking of submitted orders
 *  3. Block height polling for freshness
 *
 * Note: tick_registry mapping uses BHP256 hashed keys.
 * A production deployment would use a backend indexer or @provablehq/wasm.
 * Currently, the order book is populated from locally tracked orders.
 */
export function useOrderBook(tokenPairId: number = config.DEFAULT_TOKEN_PAIR) {
  const [ticks, setTicks] = useState<Record<string, TickDisplayInfo>>({});
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [stats, setStats] = useState<MarketStats>({
    lastPrice: config.BASE_PRICE,
    volume24h: 0,
    blockHeight: 0,
    pairActive: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tokenPair = getTokenPair(tokenPairId);
  const tickSize = tokenPair?.tickSize || config.TICK_SIZE;

  /**
   * Fetch on-chain data: token pair status, block height.
   */
  const fetchOnChainData = useCallback(async () => {
    try {
      setError(null);

      const [pairData, blockHeight] = await Promise.all([
        aleoService.getTokenPair(tokenPairId),
        aleoService.getLatestBlockHeight(),
      ]);

      const pairActive = pairData !== null && pairData.active;

      setStats(prev => ({
        ...prev,
        blockHeight,
        pairActive,
      }));

      setIsLive(blockHeight > 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch on-chain data';
      setError(msg);
      setIsLive(false);
    }
  }, [tokenPairId]);

  /**
   * Full refresh.
   */
  const refreshOrderBook = useCallback(async () => {
    setLoading(true);
    try {
      await fetchOnChainData();
    } finally {
      setLoading(false);
    }
  }, [fetchOnChainData]);

  /**
   * Add a locally tracked order to the display.
   */
  const addLocalOrder = useCallback((order: {
    tickLower: number;
    tickUpper: number;
    isBuy: boolean;
  }) => {
    setTicks(prev => {
      const updated = { ...prev };
      for (let tick = order.tickLower; tick < order.tickUpper; tick++) {
        const key = `tick_${tick}`;
        const existing = updated[key];
        const priceMin = tickToPrice(tick, tickSize);
        const priceMax = tickToPrice(tick + 1, tickSize);

        if (existing) {
          updated[key] = {
            ...existing,
            buyOrderCount: existing.buyOrderCount + (order.isBuy ? 1 : 0),
            sellOrderCount: existing.sellOrderCount + (order.isBuy ? 0 : 1),
            orderCount: existing.orderCount + 1,
            volume: existing.volume + 500,
          };
        } else {
          updated[key] = {
            tickId: tick,
            tickRange: { min: priceMin, max: priceMax },
            buyOrderCount: order.isBuy ? 1 : 0,
            sellOrderCount: order.isBuy ? 0 : 1,
            orderCount: 1,
            volume: 500,
          };
        }
      }
      return updated;
    });
  }, [tickSize]);

  /**
   * Add a trade to the recent trades list.
   */
  const addTrade = useCallback((trade: RecentTrade) => {
    setRecentTrades(prev => [trade, ...prev.slice(0, 19)]);
    setStats(prev => ({
      ...prev,
      lastPrice: trade.estimatedPrice,
      volume24h: prev.volume24h + 1000,
    }));
  }, []);

  // --- Lifecycle ---

  useEffect(() => {
    refreshOrderBook();

    intervalRef.current = setInterval(() => {
      fetchOnChainData();
    }, config.ORDER_BOOK_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshOrderBook, fetchOnChainData]);

  return {
    ticks,
    recentTrades,
    stats,
    loading,
    error,
    isLive,
    refreshOrderBook,
    addLocalOrder,
    addTrade,
  };
}
