'use client';

import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button } from '@/components/ui/button';
import { X, TrendingUp, TrendingDown, RotateCw, Loader2 } from 'lucide-react';
import { useUserOrders, type ParsedOrder } from '@/hooks/use-user-orders';
import { useCancelOrder } from '@/hooks/use-cancel-order';
import { useState } from 'react';

export function UserOrders() {
  const { address, connected } = useWallet();
  const { orders, loading, error: loadError, refresh } = useUserOrders();
  const { cancelOrder, cancelling } = useCancelOrder();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (!connected || !address) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">Connect your wallet to view your orders</p>
      </div>
    );
  }

  const handleCancel = async (order: ParsedOrder) => {
    setCancelError(null);
    setCancellingId(order.recordId);
    // order_key: use nonce field as the key identifier — matches contract's derive_order_key input
    const orderKey = order.rawRecord.data?.nonce ?? '0field';
    const ok = await cancelOrder({ record: order.rawRecord, orderKey });
    setCancellingId(null);
    if (ok) {
      refresh();
    } else {
      setCancelError('Cancel failed — check your wallet and try again');
    }
  };

  const error = loadError ?? cancelError;

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base sm:text-lg font-bold text-foreground">
          My Active Orders (Private)
        </h2>
        <Button
          onClick={refresh}
          disabled={loading}
          size="sm"
          variant="outline"
          className="gap-2 bg-transparent"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Fetching your orders from wallet…</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">No orders found</p>
          <p className="text-sm text-muted-foreground">
            Place your first order to start trading privately
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 pb-4 border-b border-border">
            <div>
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="text-base sm:text-lg font-bold text-foreground">{orders.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Escrowed</p>
              <p className="text-base sm:text-lg font-bold text-primary">
                {orders.reduce((s, o) => s + Number(o.escrowedAmount) / 1e6, 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Fill</p>
              <p className="text-base sm:text-lg font-bold text-accent">
                {(
                  orders.reduce((s, o) => s + o.fillPercent, 0) / orders.length
                ).toFixed(0)}
                %
              </p>
            </div>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {orders.map((order) => (
              <OrderRow
                key={order.recordId}
                order={order}
                onCancel={() => handleCancel(order)}
                cancelling={cancellingId === order.recordId && cancelling}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
        <p className="text-xs text-foreground leading-relaxed">
          <span className="font-semibold">Privacy Guarantee:</span> Order details
          including exact prices, quantities, and settlement information are
          ZK-proven on Aleo. Only you can view complete order details via your wallet.
        </p>
      </div>
    </div>
  );
}

interface OrderRowProps {
  order: ParsedOrder;
  onCancel: () => void;
  cancelling: boolean;
}

function OrderRow({ order, onCancel, cancelling }: OrderRowProps) {
  const isBuy = order.side === 'buy';

  const formatTime = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-3">
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
            {order.fillPercent > 0 && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-accent/20 text-accent">
                {order.fillPercent.toFixed(0)}% filled
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-1">
            Tick Range: ${order.tickLowerUsd.toFixed(2)} – ${order.tickUpperUsd.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">
            Limit: ${order.limitPriceUsd.toFixed(4)} • {formatTime(order.timestamp)}
          </p>
        </div>

        <Button
          onClick={onCancel}
          disabled={cancelling}
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
        >
          {cancelling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Fill Progress */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">Filled</p>
          <p className="text-xs font-mono text-foreground">
            {(Number(order.filledRaw) / 1e6).toFixed(2)} /{' '}
            {(Number(order.quantityRaw) / 1e6).toFixed(2)}
          </p>
        </div>
        <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full transition-all ${isBuy ? 'bg-primary' : 'bg-destructive'}`}
            style={{ width: `${order.fillPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
