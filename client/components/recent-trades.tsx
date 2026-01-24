'use client';

import { useState } from 'react';
import { useOrderBookData } from '@/hooks/use-order-book-data';
import { useOrderBook, type RecentTrade } from '@/hooks/use-order-book';
import { TrendingUp, TrendingDown, Database } from 'lucide-react';
import { config } from '@/lib/config';

export function RecentTrades() {
  const [selectedPairId] = useState(config.DEFAULT_TOKEN_PAIR);

  // Try real data first
  const {
    recentTrades: realTrades,
    loading: realLoading,
  } = useOrderBookData(selectedPairId);

  // Fallback to mock data
  const { recentTrades: mockTrades } = useOrderBook();

  // Use real data if available, otherwise mock
  const hasRealData = realTrades.length > 0;
  const recentTrades = hasRealData ? realTrades : mockTrades;
  const isUsingMockData = !hasRealData;

  const formatTime = (timestamp: number) => {
    const mins = Math.floor((Date.now() - timestamp) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-base sm:text-lg font-bold text-foreground">
          Recent Trades (Public)
        </h2>
        <span className={`text-xs px-2 py-1 rounded ${isUsingMockData ? 'bg-amber-500/20 text-amber-600' : 'bg-green-500/20 text-green-600'}`}>
          <Database className="w-3 h-3 inline mr-1" />
          {isUsingMockData ? 'Demo' : 'Live'}
        </span>
      </div>

      {recentTrades.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No recent trades</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {recentTrades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} formatTime={formatTime} />
          ))}
        </div>
      )}

      {/* Privacy Notice */}
      <div className="mt-6 p-4 rounded-lg bg-muted/30 border border-border space-y-2">
        <p className="text-xs font-semibold text-foreground">
          Settlement Transparency
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Trade execution prices are public for settlement verification, but
          individual order sizes remain encrypted. Price discovery happens at
          tick-level resolution only.
        </p>
      </div>
    </div>
  );
}

interface TradeRowProps {
  trade: RecentTrade;
  formatTime: (timestamp: number) => string;
}

function TradeRow({ trade, formatTime }: TradeRowProps) {
  const isBuy = trade.side === 'buy';

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Trade Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {isBuy ? (
              <TrendingUp className="w-4 h-4 text-primary" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
            <span
              className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                isBuy
                  ? 'bg-primary/20 text-primary'
                  : 'bg-destructive/20 text-destructive'
              }`}
            >
              {isBuy ? 'BUY' : 'SELL'}
            </span>
          </div>

          <p className="text-xs text-muted-foreground mb-2">
            Tick Range: ${trade.tickRange.min.toFixed(2)} - $
            {trade.tickRange.max.toFixed(2)}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Est. Price</p>
              <p className="text-sm font-mono font-bold text-accent">
                ${trade.estimatedPrice.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="text-sm font-semibold text-foreground">
                {formatTime(trade.timestamp)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
