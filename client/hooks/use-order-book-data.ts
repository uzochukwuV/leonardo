'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchProgramTransitions, transitionsToDepth } from '@/lib/aleo-service';
import { getTokenPair, tickToPrice } from '@/lib/token-pairs';
import { config } from '@/lib/config';

export interface TickDisplayInfo {
  tickId: number;
  tickRange: { min: number; max: number };
  buyOrderCount: number;
  sellOrderCount: number;
  orderCount: number;
}

export interface RecentTrade {
  id: string;
  tickRange: { min: number; max: number };
  estimatedPrice: number;
  timestamp: number;
}

export interface OrderBookData {
  bids: TickDisplayInfo[];       // tick-level depth entries for buy side
  asks: TickDisplayInfo[];       // tick-level depth entries for sell side
  buyOrders: number;             // actual number of buy order transitions on-chain
  sellOrders: number;            // actual number of sell order transitions on-chain
  recentTrades: RecentTrade[];
  lastPrice: number;
  loading: boolean;
  error: string | null;
  refreshOrderBook: () => Promise<void>;
}

export function useOrderBookData(tokenPairId: number = config.DEFAULT_TOKEN_PAIR): OrderBookData {
  const [bids, setBids] = useState<TickDisplayInfo[]>([]);
  const [asks, setAsks] = useState<TickDisplayInfo[]>([]);
  const [buyOrders, setBuyOrders] = useState(0);
  const [sellOrders, setSellOrders] = useState(0);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [lastPrice, setLastPrice] = useState<number>(config.BASE_PRICE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tokenPair = getTokenPair(tokenPairId);
  const tickSize = tokenPair?.tickSize ?? config.TICK_SIZE;
  const baseTick = Math.floor((config.BASE_PRICE * 10000) / tickSize);
  const minTick = Math.max(0, baseTick - 200);
  const maxTick = baseTick + 200;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [submitTxs, settleTxs] = await Promise.all([
        fetchProgramTransitions(500, 'submit_order_with_escrow'),
        fetchProgramTransitions(50, 'settle_match_public'),
      ]);

      // Count actual orders (transitions) for this pair
      let buys = 0, sells = 0;
      for (const tx of submitTxs) {
        const inputs: string[] = tx.inputs ?? [];
        const pair = parseInt(String(inputs[0] ?? '').replace(/u64$/i, '').trim(), 10);
        if (pair !== tokenPairId) continue;
        const isBuy = String(inputs[1] ?? '').trim() === 'true';
        if (isBuy) buys++; else sells++;
      }
      setBuyOrders(buys);
      setSellOrders(sells);

      // Build tick-level depth
      const { bids: rawBids, asks: rawAsks } = transitionsToDepth(
        submitTxs, tokenPairId, minTick, maxTick
      );

      const toDisplay = (entries: typeof rawBids, isBid: boolean): TickDisplayInfo[] =>
        entries.map((e) => ({
          tickId: e.tickId,
          tickRange: {
            min: tickToPrice(e.tickId, tickSize),
            max: tickToPrice(e.tickId + 1, tickSize),
          },
          buyOrderCount: isBid ? e.orderCount : 0,
          sellOrderCount: isBid ? 0 : e.orderCount,
          orderCount: e.orderCount,
        }));

      const newBids = toDisplay(rawBids, true);
      const newAsks = toDisplay(rawAsks, false);
      setBids(newBids);
      setAsks(newAsks);

      // Last price from best bid/ask mid
      if (newBids.length > 0 || newAsks.length > 0) {
        const bestBid = newBids[0]?.tickRange.max ?? 0;
        const bestAsk = newAsks[0]?.tickRange.min ?? 0;
        if (bestBid > 0 && bestAsk > 0) setLastPrice((bestBid + bestAsk) / 2);
        else if (bestBid > 0) setLastPrice(bestBid);
        else if (bestAsk > 0) setLastPrice(bestAsk);
      }

      const trades: RecentTrade[] = settleTxs.map((tx) => ({
        id: tx.transaction_id ?? tx.id ?? '',
        tickRange: { min: 0, max: 0 },
        estimatedPrice: 0,
        timestamp: (tx.block_timestamp ?? 0) > 0 ? tx.block_timestamp * 1000 : Date.now(),
      }));
      setRecentTrades(trades);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch order book');
    } finally {
      setLoading(false);
    }
  }, [tokenPairId, minTick, maxTick, tickSize]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { bids, asks, buyOrders, sellOrders, recentTrades, lastPrice, loading, error, refreshOrderBook: fetchData };
}
