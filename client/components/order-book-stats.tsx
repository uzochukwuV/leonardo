'use client';

import { type OrderBookData } from '@/hooks/use-order-book-data';
import { getTokenPair } from '@/lib/token-pairs';
import { TrendingUp, TrendingDown, Activity, Layers } from 'lucide-react';

interface OrderBookStatsProps {
  selectedPairId: number;
  data: OrderBookData;
}

export function OrderBookStats({ selectedPairId, data }: OrderBookStatsProps) {
  const { buyOrders, sellOrders, recentTrades, lastPrice, loading } = data;
  const pair = getTokenPair(selectedPairId);

  const totalOrders = buyOrders + sellOrders;
  const buyPct = totalOrders > 0 ? Math.round((buyOrders / totalOrders) * 100) : 50;
  const sellPct = 100 - buyPct;

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-6">

        {/* Pair label */}
        <div className="text-xs text-muted-foreground font-medium min-w-[70px]">
          {pair?.name ?? 'ALEO/USDC'}
        </div>

        {/* Last price */}
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Last:</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {loading && lastPrice === 0 ? '—' : `$${lastPrice.toFixed(4)}`}
          </span>
        </div>

        {/* Buy orders */}
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">Buys:</span>
          <span className="text-sm font-bold text-primary">
            {loading ? '…' : buyOrders}
          </span>
        </div>

        {/* Sell orders */}
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-destructive" />
          <span className="text-xs text-muted-foreground">Sells:</span>
          <span className="text-sm font-bold text-destructive">
            {loading ? '…' : sellOrders}
          </span>
        </div>

        {/* Total */}
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Total orders:</span>
          <span className="text-sm font-bold text-foreground">
            {loading ? '…' : totalOrders}
          </span>
        </div>

        {/* Settlements */}
        {recentTrades.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Settlements:</span>
            <span className="text-sm font-bold text-green-500">{recentTrades.length}</span>
          </div>
        )}

        {/* Buy/sell pressure bar */}
        {totalOrders > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-primary font-mono">{buyPct}%</span>
            <div className="w-24 h-1.5 rounded-full bg-destructive/30 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${buyPct}%` }}
              />
            </div>
            <span className="text-xs text-destructive font-mono">{sellPct}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
