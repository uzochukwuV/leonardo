'use client';

import { type OrderBookData } from '@/hooks/use-order-book-data';
import { getTokenPair } from '@/lib/token-pairs';
import { Activity, Lock } from 'lucide-react';

interface RecentTradesProps {
  selectedPairId: number;
  data: OrderBookData;
}

export function RecentTrades({ selectedPairId, data }: RecentTradesProps) {
  const { recentTrades, loading } = data;
  const pair = getTokenPair(selectedPairId);

  const formatTime = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Recent Settlements</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Live
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{pair?.name ?? 'ALEO/USDC'}</span>
      </div>

      {loading && recentTrades.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Scanning on-chain settlements…</p>
      ) : recentTrades.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">No settled trades yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Trades appear here once orders are matched on-chain
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {recentTrades.map((trade, i) => (
            <div
              key={trade.id || i}
              className="rounded-lg border border-border bg-muted/20 p-3 text-center space-y-1"
            >
              <div className="flex items-center justify-center gap-1">
                <Lock className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground/60 font-medium">SETTLED</span>
              </div>
              <p className="text-xs font-mono text-muted-foreground">
                ${trade.tickRange.min.toFixed(2)}–${trade.tickRange.max.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground/60">{formatTime(trade.timestamp)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border flex items-start gap-2 text-xs text-muted-foreground/60">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Exact prices, quantities, and counterparty identities are ZK-encrypted. Only tick ranges
          and settlement events are visible on-chain.
        </span>
      </div>
    </div>
  );
}
