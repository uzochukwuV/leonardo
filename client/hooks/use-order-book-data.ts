/**
 * Order Book Data Hook
 * Fetches real order book data from the Aleo blockchain
 */

import { useState, useEffect, useCallback } from 'react';
import { aleoService, type OnChainTickInfo, type Settlement } from '@/lib/aleo-service';
import { getTokenPair, tickToPrice, basisPointsToPrice } from '@/lib/token-pairs';

export interface TickDisplayInfo {
  tickId: number;
  tickRange: {
    min: number;
    max: number;
  };
  buyOrderCount: number;
  sellOrderCount: number;
  volume: number; // Estimated volume for visualization
  orderCount: number; // Total orders at this tick
}

export interface RecentTrade {
  id: string;
  side: 'buy' | 'sell';
  tickRange: {
    min: number;
    max: number;
  };
  estimatedPrice: number;
  timestamp: number;
}

export interface OrderBookData {
  orderBook: Record<number, TickDisplayInfo>;
  recentTrades: RecentTrade[];
  lastPrice: number;
  volume24h: number;
  loading: boolean;
  error: string | null;
  refreshOrderBook: () => Promise<void>;
}

/**
 * Hook to fetch and manage order book data from the blockchain
 */
export function useOrderBookData(tokenPairId: number = 1): OrderBookData {
  const [orderBook, setOrderBook] = useState<Record<number, TickDisplayInfo>>({});
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [lastPrice, setLastPrice] = useState(15.0);
  const [volume24h, setVolume24h] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tokenPair = getTokenPair(tokenPairId);
  const tickSize = tokenPair?.tickSize || 100;

  /**
   * Fetch order book data from blockchain
   */
  const fetchOrderBook = useCallback(async () => {
    if (!tokenPair) {
      setError('Invalid token pair');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch tick registry data
      const tickRegistry = await aleoService.getTickRegistry(tokenPairId);

      // Convert to display format
      const displayOrderBook: Record<number, TickDisplayInfo> = {};

      tickRegistry.forEach((tickInfo, tickId) => {
        const totalOrders = tickInfo.buyOrderCount + tickInfo.sellOrderCount;

        if (totalOrders > 0) {
          const priceMin = tickToPrice(tickId, tickSize);
          const priceMax = tickToPrice(tickId + 1, tickSize);

          displayOrderBook[tickId] = {
            tickId,
            tickRange: {
              min: priceMin,
              max: priceMax,
            },
            buyOrderCount: tickInfo.buyOrderCount,
            sellOrderCount: tickInfo.sellOrderCount,
            volume: totalOrders * 500, // Estimated volume for visualization
            orderCount: totalOrders,
          };
        }
      });

      setOrderBook(displayOrderBook);
    } catch (err) {
      console.error('Error fetching order book:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch order book');
    } finally {
      setLoading(false);
    }
  }, [tokenPairId, tokenPair, tickSize]);

  /**
   * Fetch recent settlements/trades
   */
  const fetchRecentTrades = useCallback(async () => {
    try {
      const settlements = await aleoService.getRecentSettlements(tokenPairId, 20);

      const trades: RecentTrade[] = settlements.map((settlement, index) => {
        const price = basisPointsToPrice(settlement.executionPrice);
        const tickId = Math.floor(settlement.executionPrice / tickSize);
        const priceMin = tickToPrice(tickId, tickSize);
        const priceMax = tickToPrice(tickId + 1, tickSize);

        // Determine side based on index (alternating for demo)
        const side = index % 2 === 0 ? 'buy' : 'sell';

        return {
          id: settlement.settlementId,
          side,
          tickRange: {
            min: priceMin,
            max: priceMax,
          },
          estimatedPrice: price,
          timestamp: settlement.timestamp,
        };
      });

      setRecentTrades(trades);

      // Update last price from most recent trade
      if (trades.length > 0) {
        setLastPrice(trades[0].estimatedPrice);
      }

      // Calculate 24h volume (simplified)
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const recentVolume = trades
        .filter(t => t.timestamp > oneDayAgo)
        .length * 1000; // Estimated

      setVolume24h(recentVolume);
    } catch (err) {
      console.error('Error fetching recent trades:', err);
    }
  }, [tokenPairId, tickSize]);

  /**
   * Refresh all order book data
   */
  const refreshOrderBook = useCallback(async () => {
    await Promise.all([
      fetchOrderBook(),
      fetchRecentTrades(),
    ]);
  }, [fetchOrderBook, fetchRecentTrades]);

  /**
   * Initial load and periodic refresh
   */
  useEffect(() => {
    // Initial fetch
    refreshOrderBook();

    // Set up periodic refresh every 30 seconds
    const interval = setInterval(() => {
      refreshOrderBook();
    }, 30000);

    return () => clearInterval(interval);
  }, [refreshOrderBook]);

  return {
    orderBook,
    recentTrades,
    lastPrice,
    volume24h,
    loading,
    error,
    refreshOrderBook,
  };
}
