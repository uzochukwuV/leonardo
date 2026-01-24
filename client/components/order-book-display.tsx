'use client';

import { useState } from 'react';
import { useOrderBookData, type TickDisplayInfo } from '@/hooks/use-order-book-data';
import { useOrderBook, type TickInfo } from '@/hooks/use-order-book';
import { Button } from '@/components/ui/button';
import { RotateCw, AlertCircle, Database } from 'lucide-react';
import { config } from '@/lib/config';

export function OrderBookDisplay() {
  const [selectedPairId] = useState(config.DEFAULT_TOKEN_PAIR);
  const [useRealData, setUseRealData] = useState(true);

  // Try to fetch real blockchain data
  const {
    orderBook: realOrderBook,
    lastPrice: realLastPrice,
    volume24h: realVolume24h,
    loading: realLoading,
    error: realError,
    refreshOrderBook: realRefresh,
  } = useOrderBookData(selectedPairId);

  // Fallback to mock data
  const {
    orderBook: mockOrderBook,
    lastPrice: mockLastPrice,
    volume24h: mockVolume24h,
    loading: mockLoading,
    refreshOrderBook: mockRefresh,
  } = useOrderBook();

  // Determine which data to use
  const hasRealData = Object.keys(realOrderBook).length > 0;
  const shouldUseMock = !useRealData || (!realLoading && !hasRealData);

  const orderBook = shouldUseMock ? mockOrderBook : realOrderBook;
  const lastPrice = shouldUseMock ? mockLastPrice : realLastPrice;
  const volume24h = shouldUseMock ? mockVolume24h : realVolume24h;
  const loading = shouldUseMock ? mockLoading : realLoading;
  const refreshOrderBook = shouldUseMock ? mockRefresh : realRefresh;

  // Sort ticks by price
  const sortedTicks = Object.values(orderBook).sort(
    (a, b) => a.tickId - b.tickId
  );

  // Find mid-point tick for visual centering
  const midIndex = Math.floor(sortedTicks.length / 2);
  const buyTicks = sortedTicks.slice(0, midIndex);
  const sellTicks = sortedTicks.slice(midIndex);

  const maxVolume = Math.max(...sortedTicks.map((t) => t.volume));
  const maxOrders = Math.max(...sortedTicks.map((t) => t.orderCount));

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              Order Book
            </h2>
            <span className={`text-xs px-2 py-1 rounded ${shouldUseMock ? 'bg-amber-500/20 text-amber-600' : 'bg-green-500/20 text-green-600'}`}>
              <Database className="w-3 h-3 inline mr-1" />
              {shouldUseMock ? 'Demo Data' : 'Live'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tick-aggregated liquidity (ALEO/USDC)
          </p>
        </div>
        <Button
          onClick={refreshOrderBook}
          disabled={loading}
          size="sm"
          variant="outline"
          className="gap-2 bg-transparent"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Updating...' : 'Refresh'}
        </Button>
      </div>

      {/* Error Alert */}
      {realError && !shouldUseMock && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex gap-2">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-destructive font-semibold">Failed to fetch on-chain data</p>
            <p className="text-xs text-destructive/80 mt-1">{realError}</p>
          </div>
        </div>
      )}

      {/* Info for demo mode */}
      {shouldUseMock && !realLoading && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900/80">
            Showing demo data. Real order book will appear once orders are submitted on-chain.
          </p>
        </div>
      )}

      {/* Market Info Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 pb-4 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground">Last Price</p>
          <p className="text-sm sm:text-base font-mono font-bold text-primary">
            ${lastPrice.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">24h Volume</p>
          <p className="text-sm sm:text-base font-mono font-bold text-accent">
            {(volume24h / 1000).toFixed(0)}K ALEO
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Tick Size</p>
          <p className="text-sm sm:text-base font-mono font-bold text-foreground">
            $0.01
          </p>
        </div>
      </div>

      {/* Order Book Table */}
      <div className="space-y-6">
        {/* Buy Side (Reversed) */}
        <div>
          <h3 className="text-xs font-semibold text-accent mb-3 uppercase tracking-wide">
            Buy Orders
          </h3>
          <div className="space-y-2">
            {buyTicks.reverse().map((tick) => (
              <TickOrderRow
                key={`buy_${tick.tickId}`}
                tick={tick}
                maxVolume={maxVolume}
                maxOrders={maxOrders}
                side="buy"
              />
            ))}
          </div>
        </div>

        {/* Spread Indicator */}
        <div className="py-3 px-4 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-xs text-muted-foreground">
            Bid-Ask Spread: &lt; 1 tick (encrypted by default)
          </p>
        </div>

        {/* Sell Side */}
        <div>
          <h3 className="text-xs font-semibold text-destructive mb-3 uppercase tracking-wide">
            Sell Orders
          </h3>
          <div className="space-y-2">
            {sellTicks.map((tick) => (
              <TickOrderRow
                key={`sell_${tick.tickId}`}
                tick={tick}
                maxVolume={maxVolume}
                maxOrders={maxOrders}
                side="sell"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="mt-6 p-3 rounded-lg bg-primary/10 border border-primary/20">
        <p className="text-xs text-foreground leading-relaxed">
          <span className="font-semibold">Privacy Protected:</span> Individual
          order sizes, exact prices, and trader identities remain encrypted. Only
          tick ranges and aggregate metrics are visible.
        </p>
      </div>
    </div>
  );
}

interface TickOrderRowProps {
  tick: TickInfo;
  maxVolume: number;
  maxOrders: number;
  side: 'buy' | 'sell';
}

function TickOrderRow({
  tick,
  maxVolume,
  maxOrders,
  side,
}: TickOrderRowProps) {
  const volumePercent = (tick.volume / maxVolume) * 100;
  const orderPercent = (tick.orderCount / maxOrders) * 100;

  const minPrice = tick.tickRange.min;
  const maxPrice = tick.tickRange.max;

  return (
    <div className="group relative">
      {/* Background Bar */}
      <div
        className={`absolute inset-0 rounded transition-all ${side === 'buy' ? 'bg-primary/10' : 'bg-destructive/10'}`}
        style={{ width: `${volumePercent}%` }}
      />

      {/* Content */}
      <div className="relative p-3 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            Tick Range
          </p>
          <p className="text-sm font-mono text-foreground group-hover:text-primary transition-colors">
            ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">Orders</p>
          <p className="text-sm font-mono font-bold text-accent">
            {tick.orderCount}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">Est. Depth</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-12 h-2 rounded bg-muted/50">
              <div
                className={`h-full rounded ${side === 'buy' ? 'bg-primary' : 'bg-destructive'}`}
                style={{ width: `${orderPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {tick.volume.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
