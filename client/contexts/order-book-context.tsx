'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { aleoService } from '@/lib/aleo-service';
import { config } from '@/lib/config';
import { tickToPrice } from '@/lib/token-pairs';

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
  quantity: number;
  timestamp: number;
  txId?: string;
}

export interface PendingOrder {
  id: string;
  txId: string;
  side: 'buy' | 'sell';
  tickLower: number;
  tickUpper: number;
  limitPrice: number;
  quantity: number;
  status: 'pending' | 'confirmed' | 'failed';
  submittedAt: number;
}

export interface TokenRecord {
  id: string;
  owner: string;
  amount: string;
  tokenId: string;
  externalAuthorizationRequired: boolean;
  authorizedUntil: number;
  plaintext: string;
  spent: boolean;
  programId: string;
}

export interface MarketStats {
  lastPrice: number;
  volume24h: number;
  blockHeight: number;
  pairActive: boolean;
}

interface OrderBookContextValue {
  // Order book data
  ticks: Record<string, TickDisplayInfo>;
  recentTrades: RecentTrade[];
  pendingOrders: PendingOrder[];
  stats: MarketStats;

  // Token records
  tokenRecords: TokenRecord[];
  loadingTokenRecords: boolean;

  // State
  loading: boolean;
  error: string | null;
  isLive: boolean;
  selectedPairId: number;

  // Actions
  setSelectedPairId: (id: number) => void;
  addPendingOrder: (order: Omit<PendingOrder, 'id' | 'status' | 'submittedAt'>) => void;
  updateOrderStatus: (txId: string, status: PendingOrder['status']) => void;
  addTrade: (trade: Omit<RecentTrade, 'id'>) => void;
  refreshOrderBook: () => Promise<void>;
  refreshTokenRecords: () => Promise<void>;
}

const OrderBookContext = createContext<OrderBookContextValue | null>(null);

// --- Token record parsing ---

function parseTokenRecord(record: { plaintext?: string; data?: string; spent?: boolean; id?: string; program_id?: string }): TokenRecord | null {
  const plaintext = record.plaintext || record.data || '';
  if (!plaintext) return null;

  try {
    // Parse Aleo record format:
    // { owner: aleo1..., amount: 1000000u128, token_id: 12345field, external_authorization_required: false, authorized_until: 0u32 }
    const fields: Record<string, string> = {};
    const inner = plaintext.replace(/^\s*\{/, '').replace(/\}\s*$/, '').trim();

    for (const entry of inner.split(',')) {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) continue;
      const key = entry.slice(0, colonIdx).trim();
      const value = entry.slice(colonIdx + 1).trim();
      fields[key] = value;
    }

    // Extract owner (address)
    const owner = fields.owner || '';

    // Extract amount (u128)
    const amountMatch = (fields.amount || '0').match(/^(\d+)/);
    const amount = amountMatch ? amountMatch[1] : '0';

    // Extract token_id (field)
    const tokenId = fields.token_id || fields['token_id'] || '0field';

    // Extract external_authorization_required (bool)
    const extAuth = (fields.external_authorization_required || 'false') === 'true';

    // Extract authorized_until (u32)
    const authUntilMatch = (fields.authorized_until || '0').match(/^(\d+)/);
    const authorizedUntil = authUntilMatch ? parseInt(authUntilMatch[1], 10) : 0;

    return {
      id: record.id || `token_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      owner,
      amount,
      tokenId,
      externalAuthorizationRequired: extAuth,
      authorizedUntil,
      plaintext,
      spent: record.spent || false,
      programId: record.program_id || 'token_registry.aleo',
    };
  } catch (err) {
    console.error('[parseTokenRecord] Failed to parse:', err);
    return null;
  }
}

// --- Provider ---

export function OrderBookProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, requestRecords } = useWallet();

  // Core state
  const [ticks, setTicks] = useState<Record<string, TickDisplayInfo>>({});
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [stats, setStats] = useState<MarketStats>({
    lastPrice: config.BASE_PRICE,
    volume24h: 0,
    blockHeight: 0,
    pairActive: false,
  });

  // Token records
  const [tokenRecords, setTokenRecords] = useState<TokenRecord[]>([]);
  const [loadingTokenRecords, setLoadingTokenRecords] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [selectedPairId, setSelectedPairId] = useState<number>(config.DEFAULT_TOKEN_PAIR);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch on-chain data ---
  const fetchOnChainData = useCallback(async () => {
    try {
      setError(null);
      const [pairData, blockHeight] = await Promise.all([
        aleoService.getTokenPair(selectedPairId),
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
  }, [selectedPairId]);

  // --- Refresh order book ---
  const refreshOrderBook = useCallback(async () => {
    setLoading(true);
    try {
      await fetchOnChainData();
    } finally {
      setLoading(false);
    }
  }, [fetchOnChainData]);

  // --- Fetch token records ---
  const refreshTokenRecords = useCallback(async () => {
    if (!connected || !publicKey || !requestRecords) {
      setTokenRecords([]);
      return;
    }

    setLoadingTokenRecords(true);
    try {
      // Fetch from token_registry.aleo
      const rawRecords = await requestRecords('token_registry.aleo');

      if (!rawRecords || !Array.isArray(rawRecords)) {
        setTokenRecords([]);
        return;
      }

      const parsed: TokenRecord[] = [];
      for (const record of rawRecords) {
        const tokenRecord = parseTokenRecord(record as Record<string, unknown>);
        if (tokenRecord && !tokenRecord.spent) {
          parsed.push(tokenRecord);
        }
      }

      setTokenRecords(parsed);
    } catch (err) {
      console.error('[OrderBookContext] Error fetching token records:', err);
      setTokenRecords([]);
    } finally {
      setLoadingTokenRecords(false);
    }
  }, [connected, publicKey, requestRecords]);

  // --- Add pending order (called when order is submitted) ---
  const addPendingOrder = useCallback((order: Omit<PendingOrder, 'id' | 'status' | 'submittedAt'>) => {
    const newOrder: PendingOrder = {
      ...order,
      id: `order_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      submittedAt: Date.now(),
    };

    setPendingOrders(prev => [newOrder, ...prev]);

    // Also update ticks immediately for visual feedback
    const tickSize = config.TICK_SIZE;
    setTicks(prev => {
      const updated = { ...prev };
      for (let tick = order.tickLower; tick < order.tickUpper; tick++) {
        const key = `tick_${tick}`;
        const existing = updated[key];
        const priceMin = tickToPrice(tick, tickSize);
        const priceMax = tickToPrice(tick + 1, tickSize);
        const isBuy = order.side === 'buy';

        if (existing) {
          updated[key] = {
            ...existing,
            buyOrderCount: existing.buyOrderCount + (isBuy ? 1 : 0),
            sellOrderCount: existing.sellOrderCount + (isBuy ? 0 : 1),
            orderCount: existing.orderCount + 1,
            volume: existing.volume + order.quantity,
          };
        } else {
          updated[key] = {
            tickId: tick,
            tickRange: { min: priceMin, max: priceMax },
            buyOrderCount: isBuy ? 1 : 0,
            sellOrderCount: isBuy ? 0 : 1,
            orderCount: 1,
            volume: order.quantity,
          };
        }
      }
      return updated;
    });
  }, []);

  // --- Update order status ---
  const updateOrderStatus = useCallback((txId: string, status: PendingOrder['status']) => {
    setPendingOrders(prev =>
      prev.map(order =>
        order.txId === txId ? { ...order, status } : order
      )
    );
  }, []);

  // --- Add trade ---
  const addTrade = useCallback((trade: Omit<RecentTrade, 'id'>) => {
    const newTrade: RecentTrade = {
      ...trade,
      id: `trade_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    };

    setRecentTrades(prev => [newTrade, ...prev.slice(0, 49)]);

    setStats(prev => ({
      ...prev,
      lastPrice: trade.estimatedPrice,
      volume24h: prev.volume24h + trade.quantity,
    }));
  }, []);

  // --- Effects ---

  // Initial load and periodic refresh
  useEffect(() => {
    refreshOrderBook();

    intervalRef.current = setInterval(() => {
      fetchOnChainData();
    }, config.ORDER_BOOK_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshOrderBook, fetchOnChainData]);

  // Fetch token records when wallet connects
  useEffect(() => {
    if (connected) {
      refreshTokenRecords();
    } else {
      setTokenRecords([]);
    }
  }, [connected, refreshTokenRecords]);

  const value: OrderBookContextValue = {
    ticks,
    recentTrades,
    pendingOrders,
    stats,
    tokenRecords,
    loadingTokenRecords,
    loading,
    error,
    isLive,
    selectedPairId,
    setSelectedPairId,
    addPendingOrder,
    updateOrderStatus,
    addTrade,
    refreshOrderBook,
    refreshTokenRecords,
  };

  return (
    <OrderBookContext.Provider value={value}>
      {children}
    </OrderBookContext.Provider>
  );
}

// --- Hook ---

export function useOrderBookContext() {
  const context = useContext(OrderBookContext);
  if (!context) {
    throw new Error('useOrderBookContext must be used within OrderBookProvider');
  }
  return context;
}
