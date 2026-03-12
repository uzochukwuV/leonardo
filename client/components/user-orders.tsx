'use client';

import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button } from '@/components/ui/button';
import { X, TrendingUp, TrendingDown, RotateCw, Loader2, Clock } from 'lucide-react';
import { useUserOrders, type ParsedOrder } from '@/hooks/use-user-orders';
import { useCancelOrder } from '@/hooks/use-cancel-order';
import { useState } from 'react';
import { getTokenPair } from '@/lib/token-pairs';

export function UserOrders() {
  const { address, connected } = useWallet();
  const { orders, loading, error: loadError, refresh } = useUserOrders();
  const { cancelOrder, step, stepLabel, error: cancelHookError, reset } = useCancelOrder();
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
    reset();
    setCancellingId(order.recordId);

    // v17: Use the Receipt record ciphertext for cancellation
    if (!order.receiptCiphertext) {
      setCancelError('Receipt record not found - cannot cancel');
      setCancellingId(null);
      return;
    }

    const ok = await cancelOrder({
      receiptRecord: order.receiptCiphertext,
      orderId: order.orderId,
      isBuy: order.side === 'buy',
    });

    setCancellingId(null);
    if (ok) {
      refresh();
    } else {
      setCancelError(cancelHookError ?? 'Cancel request failed — check your wallet and try again');
    }
  };

  const error = loadError ?? cancelError;
  const isCancelling = step !== 'idle' && step !== 'done';

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base sm:text-lg font-bold text-foreground">
          My Orders
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

      {isCancelling && cancellingId && (
        <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/30">
          <p className="text-sm text-primary">{stepLabel[step]}</p>
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
            Place your first order to start trading
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6 pb-4 border-b border-border">
            <div>
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="text-base sm:text-lg font-bold text-foreground">{orders.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Quantity</p>
              <p className="text-base sm:text-lg font-bold text-primary">
                {orders.reduce((s, o) => s + Number(o.quantityRaw) / 1e6, 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {orders.map((order) => (
              <OrderRow
                key={order.recordId}
                order={order}
                onCancel={() => handleCancel(order)}
                cancelling={cancellingId === order.recordId && isCancelling}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
        <p className="text-xs text-foreground leading-relaxed">
          <span className="font-semibold">v17 Architecture:</span> Your Receipt records prove order
          ownership. To cancel, submit a cancellation request and the keeper will process the refund.
          Orders are settled by the keeper when prices cross.
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
  const pair = getTokenPair(order.pairId);

  const formatTime = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  // Status display
  const statusText = order.status ?? 'active';
  const statusColor = statusText === 'filled' ? 'text-accent' :
                      statusText === 'cancelled' ? 'text-muted-foreground' :
                      statusText === 'pending_cancel' ? 'text-yellow-500' :
                      statusText === 'partially_filled' ? 'text-blue-500' :
                      'text-foreground';

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
            <span className={`text-xs ${statusColor}`}>
              {statusText.replace('_', ' ')}
            </span>
            {pair && (
              <span className="text-xs text-muted-foreground">
                {pair.name}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-1">
            Limit: ${order.priceUsd.toFixed(4)} • Qty: {(Number(order.quantityRaw) / 1e6).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(order.createdAtMs)}
          </p>
          <p className="text-xs text-muted-foreground font-mono truncate mt-1">
            ID: {order.orderId.slice(0, 20)}...
          </p>
        </div>

        {(statusText === 'active' || statusText === 'partially_filled') && (
          <Button
            onClick={onCancel}
            disabled={cancelling}
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
            title="Request cancellation"
          >
            {cancelling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      {/* Escrow info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Escrow</span>
        <span className="font-mono">
          {(Number(order.escrowAmount) / 1e6).toFixed(4)} {isBuy ? pair?.quoteToken.symbol ?? 'QUOTE' : 'ALEO'}
        </span>
      </div>

      {/* Fill Progress (if available) */}
      {order.filled !== undefined && order.filled > 0n && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Filled</p>
            <p className="text-xs font-mono text-foreground">
              {(Number(order.filled) / 1e6).toFixed(2)} /{' '}
              {(Number(order.quantityRaw) / 1e6).toFixed(2)}
            </p>
          </div>
          <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
            <div
              className={`h-full transition-all ${isBuy ? 'bg-primary' : 'bg-destructive'}`}
              style={{ width: `${Number((order.filled * 100n) / order.quantityRaw)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
