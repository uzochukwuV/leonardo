'use client';

/**
 * useOrderBookData
 * Fetches order book data from the keeper bot API for v17 contract.
 *
 * The keeper bot maintains an in-memory order book by scanning Order records
 * and provides aggregated bids/asks via REST API.
 *
 * Falls back to on-chain transition parsing if keeper is unavailable.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchKeeperOrderBook,
  fetchKeeperTrades,
  fetchKeeperHealth,
  fetchProgramTransitions,
  transitionsToDepth,
} from '@/lib/aleo-service';
import { getTokenPair, tickToPrice } from '@/lib/token-pairs';
import { config } from '@/lib/config';

export interface TickDisplayInfo {
  tickId: number;
  tickRange: { min: number; max: number };
  buyOrderCount: number;
  sellOrderCount: number;
  orderCount: number;
  totalQuantity?: string;
}

export interface RecentTrade {
  id: string;
  buyTrader: string;
  sellTrader: string;
  quantity: string;
  price: string;
  timestamp: number;
}

export interface OrderBookData {
  bids: TickDisplayInfo[];       // tick-level depth entries for buy side
  asks: TickDisplayInfo[];       // tick-level depth entries for sell side
  buyOrders: number;             // number of buy orders
  sellOrders: number;            // number of sell orders
  recentTrades: RecentTrade[];
  lastPrice: number;
  spread: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  loading: boolean;
  error: string | null;
  keeperStatus: 'connected' | 'disconnected' | 'unknown';
  refreshOrderBook: () => Promise<void>;
}

export function useOrderBookData(tokenPairId: number = config.DEFAULT_TOKEN_PAIR): OrderBookData {
  const [bids, setBids] = useState<TickDisplayInfo[]>([]);
  const [asks, setAsks] = useState<TickDisplayInfo[]>([]);
  const [buyOrders, setBuyOrders] = useState(0);
  const [sellOrders, setSellOrders] = useState(0);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [lastPrice, setLastPrice] = useState<number>(config.BASE_PRICE);
  const [spread, setSpread] = useState<number | null>(null);
  const [bestBid, setBestBid] = useState<number | null>(null);
  const [bestAsk, setBestAsk] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keeperStatus, setKeeperStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  const tokenPair = getTokenPair(tokenPairId);
  const tickSize = tokenPair?.tickSize ?? config.TICK_SIZE;

  /**
   * Fetch from keeper bot API (primary source)
   */
  const fetchFromKeeper = useCallback(async (): Promise<boolean> => {
    try {
      // Check keeper health first
      const health = await fetchKeeperHealth();
      if (!health || health.status !== 'ok') {
        setKeeperStatus('disconnected');
        return false;
      }

      setKeeperStatus('connected');

      // Fetch order book
      const orderBook = await fetchKeeperOrderBook();
      if (!orderBook) return false;

      // Convert keeper response to tick display format
      const bidTicks: TickDisplayInfo[] = [];
      const askTicks: TickDisplayInfo[] = [];

      // Group bids by tick
      const bidsByTick = new Map<number, { count: number; quantity: bigint }>();
      for (const bid of orderBook.bids) {
        const priceBps = parseInt(bid.price);
        const tickId = Math.floor(priceBps / tickSize);
        const existing = bidsByTick.get(tickId) || { count: 0, quantity: 0n };
        existing.count++;
        existing.quantity += BigInt(bid.quantity);
        bidsByTick.set(tickId, existing);
      }

      // Group asks by tick
      const asksByTick = new Map<number, { count: number; quantity: bigint }>();
      for (const ask of orderBook.asks) {
        const priceBps = parseInt(ask.price);
        const tickId = Math.floor(priceBps / tickSize);
        const existing = asksByTick.get(tickId) || { count: 0, quantity: 0n };
        existing.count++;
        existing.quantity += BigInt(ask.quantity);
        asksByTick.set(tickId, existing);
      }

      // Convert to display format
      for (const [tickId, data] of bidsByTick) {
        bidTicks.push({
          tickId,
          tickRange: {
            min: tickToPrice(tickId, tickSize),
            max: tickToPrice(tickId + 1, tickSize),
          },
          buyOrderCount: data.count,
          sellOrderCount: 0,
          orderCount: data.count,
          totalQuantity: data.quantity.toString(),
        });
      }

      for (const [tickId, data] of asksByTick) {
        askTicks.push({
          tickId,
          tickRange: {
            min: tickToPrice(tickId, tickSize),
            max: tickToPrice(tickId + 1, tickSize),
          },
          buyOrderCount: 0,
          sellOrderCount: data.count,
          orderCount: data.count,
          totalQuantity: data.quantity.toString(),
        });
      }

      // Sort bids DESC, asks ASC
      bidTicks.sort((a, b) => b.tickId - a.tickId);
      askTicks.sort((a, b) => a.tickId - b.tickId);

      setBids(bidTicks);
      setAsks(askTicks);
      setBuyOrders(orderBook.bids.length);
      setSellOrders(orderBook.asks.length);

      // Parse best bid/ask and spread
      const bestBidVal = orderBook.bestBid ? parseInt(orderBook.bestBid) / 10000 : null;
      const bestAskVal = orderBook.bestAsk ? parseInt(orderBook.bestAsk) / 10000 : null;
      setBestBid(bestBidVal);
      setBestAsk(bestAskVal);

      if (bestBidVal && bestAskVal) {
        setSpread(bestAskVal - bestBidVal);
        setLastPrice((bestBidVal + bestAskVal) / 2);
      } else if (bestBidVal) {
        setLastPrice(bestBidVal);
      } else if (bestAskVal) {
        setLastPrice(bestAskVal);
      }

      // Fetch recent trades
      const tradesResponse = await fetchKeeperTrades();
      if (tradesResponse?.trades) {
        const trades: RecentTrade[] = tradesResponse.trades.map((t) => ({
          id: `${t.buyOrderId}-${t.sellOrderId}`,
          buyTrader: t.buyTrader,
          sellTrader: t.sellTrader,
          quantity: t.quantity,
          price: t.price,
          timestamp: new Date(t.timestamp).getTime(),
        }));
        setRecentTrades(trades);
      }

      return true;
    } catch (err) {
      console.error('Keeper API error:', err);
      setKeeperStatus('disconnected');
      return false;
    }
  }, [tickSize]);

  /**
   * Fallback: fetch from on-chain transitions
   */
  const fetchFromChain = useCallback(async () => {
    const baseTick = Math.floor((config.BASE_PRICE * 10000) / tickSize);
    const minTick = Math.max(0, baseTick - 200);
    const maxTick = baseTick + 200;

    // Fetch transitions for v17 contract functions
    const [submitBuyTxs, submitSellTxs, settleTxs] = await Promise.all([
      fetchProgramTransitions(500, 'submit_buy_order'),
      fetchProgramTransitions(500, 'submit_sell_order'),
      fetchProgramTransitions(50, 'settle_match'),
    ]);

    // Combine submissions and parse
    const allSubmitTxs = [...submitBuyTxs, ...submitSellTxs];

    // Count actual orders for this pair
    let buys = 0, sells = 0;
    for (const tx of allSubmitTxs) {
      const inputs: string[] = tx.inputs ?? [];
      const pair = parseInt(String(inputs[0] ?? '').replace(/u64$/i, '').trim(), 10);
      if (pair !== tokenPairId) continue;
      // In v17, submit_buy_order vs submit_sell_order determines side
      const fnName = tx.function ?? '';
      if (fnName.includes('buy')) buys++;
      else if (fnName.includes('sell')) sells++;
    }
    setBuyOrders(buys);
    setSellOrders(sells);

    // Build tick-level depth (adapting the existing function)
    // Note: v17 doesn't have tick_lower/tick_upper in public inputs
    // We use price to determine tick
    const tickCounts: Record<number, { buys: number; sells: number }> = {};

    for (const tx of allSubmitTxs) {
      const inputs: string[] = tx.inputs ?? [];
      const pair = parseInt(String(inputs[0] ?? '').replace(/u64$/i, '').trim(), 10);
      if (pair !== tokenPairId) continue;

      // inputs[2] is price in v17
      const priceBps = parseInt(String(inputs[2] ?? '0').replace(/u64$/i, '').trim(), 10);
      if (isNaN(priceBps)) continue;

      const tickId = Math.floor(priceBps / tickSize);
      if (tickId < minTick || tickId > maxTick) continue;

      if (!tickCounts[tickId]) tickCounts[tickId] = { buys: 0, sells: 0 };

      const fnName = tx.function ?? '';
      if (fnName.includes('buy')) tickCounts[tickId].buys++;
      else if (fnName.includes('sell')) tickCounts[tickId].sells++;
    }

    const newBids: TickDisplayInfo[] = [];
    const newAsks: TickDisplayInfo[] = [];

    for (const [tickStr, counts] of Object.entries(tickCounts)) {
      const tickId = parseInt(tickStr, 10);
      const base: TickDisplayInfo = {
        tickId,
        tickRange: {
          min: tickToPrice(tickId, tickSize),
          max: tickToPrice(tickId + 1, tickSize),
        },
        buyOrderCount: counts.buys,
        sellOrderCount: counts.sells,
        orderCount: counts.buys + counts.sells,
      };

      if (counts.buys > 0) newBids.push({ ...base, orderCount: counts.buys });
      if (counts.sells > 0) newAsks.push({ ...base, orderCount: counts.sells });
    }

    newBids.sort((a, b) => b.tickId - a.tickId);
    newAsks.sort((a, b) => a.tickId - b.tickId);

    setBids(newBids);
    setAsks(newAsks);

    // Last price from best bid/ask mid
    if (newBids.length > 0 || newAsks.length > 0) {
      const bestBidVal = newBids[0]?.tickRange.max ?? null;
      const bestAskVal = newAsks[0]?.tickRange.min ?? null;
      setBestBid(bestBidVal);
      setBestAsk(bestAskVal);

      if (bestBidVal && bestAskVal) {
        setSpread(bestAskVal - bestBidVal);
        setLastPrice((bestBidVal + bestAskVal) / 2);
      } else if (bestBidVal) {
        setLastPrice(bestBidVal);
      } else if (bestAskVal) {
        setLastPrice(bestAskVal);
      }
    }

    // Recent trades from settle_match
    const trades: RecentTrade[] = settleTxs.map((tx) => ({
      id: tx.transaction_id ?? tx.id ?? '',
      buyTrader: '',
      sellTrader: '',
      quantity: '0',
      price: '0',
      timestamp: (tx.block_timestamp ?? 0) > 0 ? tx.block_timestamp * 1000 : Date.now(),
    }));
    setRecentTrades(trades);
  }, [tokenPairId, tickSize]);

  /**
   * Main fetch function - tries keeper first, falls back to chain
   */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try keeper API first
      const keeperSuccess = await fetchFromKeeper();

      // Fall back to chain if keeper unavailable
      if (!keeperSuccess) {
        await fetchFromChain();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch order book');
    } finally {
      setLoading(false);
    }
  }, [fetchFromKeeper, fetchFromChain]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, config.ORDER_BOOK_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    bids,
    asks,
    buyOrders,
    sellOrders,
    recentTrades,
    lastPrice,
    spread,
    bestBid,
    bestAsk,
    loading,
    error,
    keeperStatus,
    refreshOrderBook: fetchData,
  };
}
