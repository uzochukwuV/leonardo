'use client';

import { useOrderBook, type TickInfo } from '@/hooks/use-order-book';
import { Button } from '@/components/ui/button';
import { RotateCw } from 'lucide-react';

export function OrderBookDisplay() {
  const { orderBook, lastPrice, volume24h, loading, refreshOrderBook } =
    useOrderBook();

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
          <h2 className="text-base sm:text-lg font-bold text-foreground">
            Order Book
          </h2>
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
          <RotateCw className="w-4 h-4" />
          {loading ? 'Updating...' : 'Refresh'}
        </Button>
      </div>

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
