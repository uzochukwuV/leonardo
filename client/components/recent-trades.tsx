'use client';

import { type OrderBookData } from '@/hooks/use-order-book-data';
import { getTokenPair } from '@/lib/token-pairs';
import { Activity, Lock, ArrowRightLeft } from 'lucide-react';

interface RecentTradesProps {
  selectedPairId: number;
  data: OrderBookData;
}

export function RecentTrades({ selectedPairId, data }: RecentTradesProps) {
  const { recentTrades, loading, keeperStatus } = data;
  const pair = getTokenPair(selectedPairId);

  const formatTime = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatQuantity = (qty: string) => {
    const num = parseFloat(qty);
    if (isNaN(num)) return '—';
    return (num / 1e6).toFixed(4);
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (isNaN(num) || num === 0) return '—';
    return `$${(num / 10000).toFixed(4)}`;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Recent Trades</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
            keeperStatus === 'connected'
              ? 'bg-green-500/15 text-green-600'
              : 'bg-yellow-500/15 text-yellow-600'
          }`}>
            <Activity className="w-3 h-3" />
            {keeperStatus === 'connected' ? 'Live' : 'Chain'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{pair?.name ?? 'ALEO/USDC'}</span>
      </div>

      {loading && recentTrades.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Scanning settlements…</p>
      ) : recentTrades.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">No trades yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Trades appear here once orders are matched by the keeper
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentTrades.slice(0, 10).map((trade, i) => (
            <div
              key={trade.id || i}
              className="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {formatQuantity(trade.quantity)} {pair?.baseToken.symbol ?? 'ALEO'}
                    </span>
                    <span className="text-xs text-muted-foreground">@</span>
                    <span className="text-sm font-mono text-foreground">
                      {formatPrice(trade.price)}
                    </span>
                  </div>
                  {trade.buyTrader && trade.sellTrader && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-50">
                      {trade.buyTrader.slice(0, 8)}... ↔ {trade.sellTrader.slice(0, 8)}...
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatTime(trade.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border flex items-start gap-2 text-xs text-muted-foreground/60">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Exact order details are ZK-encrypted. The keeper matches crossing orders and executes
          settlements on-chain. Traders receive proof records.
        </span>
      </div>
    </div>
  );
}
