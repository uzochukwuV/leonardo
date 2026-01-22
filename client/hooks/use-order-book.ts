'use client';

import { useState, useCallback, useEffect } from 'react';

export interface TickInfo {
  tickId: number;
  tickRange: { min: number; max: number };
  orderCount: number;
  volume: number;
  lastUpdate: number;
}

export interface TickOrderBook {
  [key: string]: TickInfo;
}

export interface RecentTrade {
  id: string;
  timestamp: number;
  tickRange: { min: number; max: number };
  estimatedPrice: number;
  side: 'buy' | 'sell';
}

const TICK_SIZE = 100; // 100 basis points
const TOKEN_PAIR = 'ALEO/USDC';

// Generate mock order book data
function generateMockOrderBook(): TickOrderBook {
  const book: TickOrderBook = {};
  const basePrice = 1500; // $15.00

  for (let i = -5; i <= 5; i++) {
    const tickId = basePrice + i * TICK_SIZE;
    const minPrice = tickId;
    const maxPrice = tickId + TICK_SIZE;
    const midpoint = (minPrice + maxPrice) / 2 / 100;

    book[`tick_${tickId}`] = {
      tickId,
      tickRange: { min: midpoint - 0.05, max: midpoint + 0.05 },
      orderCount: Math.floor(Math.random() * 8) + 1,
      volume: Math.floor(Math.random() * 5000) + 500,
      lastUpdate: Date.now(),
    };
  }

  return book;
}

function generateMockRecentTrades(): RecentTrade[] {
  const trades: RecentTrade[] = [];
  const basePrice = 1500;

  for (let i = 0; i < 5; i++) {
    const tickOffset = Math.floor(Math.random() * 11) - 5;
    const tickId = basePrice + tickOffset * TICK_SIZE;
    const midpoint = (tickId + TICK_SIZE / 2) / 100;

    trades.push({
      id: `trade_${i}`,
      timestamp: Date.now() - i * 300000, // Every 5 mins
      tickRange: {
        min: midpoint - 0.05,
        max: midpoint + 0.05,
      },
      estimatedPrice: midpoint,
      side: Math.random() > 0.5 ? 'buy' : 'sell',
    });
  }

  return trades;
}

export function useOrderBook() {
  const [orderBook, setOrderBook] = useState<TickOrderBook>(() =>
    generateMockOrderBook()
  );
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>(() =>
    generateMockRecentTrades()
  );
  const [loading, setLoading] = useState(false);
  const [lastPrice, setLastPrice] = useState(15.0);
  const [volume24h, set24hVolume] = useState(125000);

  // Refresh order book
  const refreshOrderBook = useCallback(async () => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setOrderBook(generateMockOrderBook());
    } finally {
      setLoading(false);
    }
  }, []);

  // Add new trade
  const addTrade = useCallback((trade: RecentTrade) => {
    setRecentTrades((prev) => [trade, ...prev.slice(0, 9)]);
  }, []);

  // Update tick order count (after successful order placement)
  const updateTickOrderCount = useCallback((tickId: number) => {
    const key = `tick_${tickId}`;
    setOrderBook((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        orderCount: (prev[key]?.orderCount || 0) + 1,
        lastUpdate: Date.now(),
      },
    }));
  }, []);

  return {
    orderBook,
    recentTrades,
    loading,
    lastPrice,
    set24hVolume,
    volume24h,
    refreshOrderBook,
    addTrade,
    updateTickOrderCount,
    tokenPair: TOKEN_PAIR,
  };
}
