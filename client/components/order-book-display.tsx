'use client';

import { type TickDisplayInfo, type OrderBookData } from '@/hooks/use-order-book-data';
import { RotateCw, AlertCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTokenPair } from '@/lib/token-pairs';

interface OrderBookDisplayProps {
  selectedPairId: number;
  onPriceClick: (priceUsd: number) => void;
  data: OrderBookData;
}

export function OrderBookDisplay({ selectedPairId, onPriceClick, data }: OrderBookDisplayProps) {
  const { bids, asks, buyOrders, sellOrders, lastPrice, loading, error, refreshOrderBook } = data;

  const pair = getTokenPair(selectedPairId);
  const pairName = pair?.name ?? 'ALEO/USDC';

  // Asks: sorted highest→lowest (top of book at top, cheapest ask nearest mid)
  const asksDisplay = [...asks].sort((a, b) => b.tickId - a.tickId).slice(0, 8);
  // Bids: sorted highest→lowest (best bid at top of bids section)
  const bidsDisplay = [...bids].sort((a, b) => b.tickId - a.tickId).slice(0, 8);

  const maxOrders = Math.max(
    1,
    ...bidsDisplay.map((t) => t.orderCount),
    ...asksDisplay.map((t) => t.orderCount)
  );

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-bold text-foreground">{pairName} Order Book</h2>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Sizes encrypted · tick ranges public
          </p>
        </div>
        <Button
          onClick={refreshOrderBook}
          disabled={loading}
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          title="Refresh"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2 rounded bg-destructive/10 border border-destructive/30 flex gap-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-3 px-4 py-2 text-xs text-muted-foreground border-b border-border">
        <span>Price (USD)</span>
        <span className="text-center">Tick</span>
        <span className="text-right">Orders</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Asks (sell side) — highest price at top, cheapest ask nearest mid */}
        {loading && asks.length === 0 ? (
          <div className="px-4 py-4 text-xs text-muted-foreground text-center">Loading…</div>
        ) : asksDisplay.length === 0 ? (
          <div className="px-4 py-4 text-xs text-muted-foreground/60 text-center italic">No sell orders</div>
        ) : (
          asksDisplay.map((tick) => (
            <BookRow key={`ask_${tick.tickId}`} tick={tick} maxOrders={maxOrders} side="sell" onPriceClick={onPriceClick} />
          ))
        )}

        {/* Mid-price separator */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-y border-border">
          <span className="text-sm font-mono font-bold text-foreground">
            {lastPrice > 0 ? `$${lastPrice.toFixed(2)}` : '—'}
          </span>
          <span className="text-xs text-muted-foreground">mid price</span>
        </div>

        {/* Bids (buy side) — highest bid at top */}
        {loading && bids.length === 0 ? (
          <div className="px-4 py-4 text-xs text-muted-foreground text-center">Loading…</div>
        ) : bidsDisplay.length === 0 ? (
          <div className="px-4 py-4 text-xs text-muted-foreground/60 text-center italic">No buy orders</div>
        ) : (
          bidsDisplay.map((tick) => (
            <BookRow key={`bid_${tick.tickId}`} tick={tick} maxOrders={maxOrders} side="buy" onPriceClick={onPriceClick} />
          ))
        )}
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-3 gap-0 border-t border-border text-center">
        <div className="py-2.5 px-3 border-r border-border">
          <p className="text-xs text-muted-foreground">Buys</p>
          <p className="text-sm font-bold text-primary">{loading ? '…' : buyOrders}</p>
        </div>
        <div className="py-2.5 px-3 border-r border-border">
          <p className="text-xs text-muted-foreground">Last Price</p>
          <p className="text-sm font-bold text-foreground font-mono">
            {lastPrice > 0 ? `$${lastPrice.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className="py-2.5 px-3">
          <p className="text-xs text-muted-foreground">Sells</p>
          <p className="text-sm font-bold text-destructive">{loading ? '…' : sellOrders}</p>
        </div>
      </div>
    </div>
  );
}

interface BookRowProps {
  tick: TickDisplayInfo;
  maxOrders: number;
  side: 'buy' | 'sell';
  onPriceClick: (price: number) => void;
}

function BookRow({ tick, maxOrders, side, onPriceClick }: BookRowProps) {
  const pct = (tick.orderCount / maxOrders) * 100;

  return (
    <button
      type="button"
      onClick={() => onPriceClick(tick.tickRange.min)}
      title="Click to use this price"
      className="relative w-full grid grid-cols-3 px-4 py-1.5 text-xs text-left hover:bg-muted/40 transition-colors"
    >
      <div
        className={`absolute inset-y-0 right-0 ${side === 'buy' ? 'bg-primary/10' : 'bg-destructive/10'}`}
        style={{ width: `${pct}%` }}
      />
      <span className={`relative font-mono font-semibold ${side === 'buy' ? 'text-primary' : 'text-destructive'}`}>
        ${tick.tickRange.min.toFixed(2)}
      </span>
      <span className="relative text-center text-muted-foreground font-mono">
        {tick.tickId}
      </span>
      <span className="relative text-right font-mono text-foreground">
        {tick.orderCount}
      </span>
    </button>
  );
}
