'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { X, TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react';
import { useWalletOperations } from '@/hooks/use-wallet-operations';
import type { OrderRecord } from '@/lib/aleo-contract';
import { basisPointsToPrice, tickToPrice } from '@/lib/token-pairs';
import { formatTxId } from '@/lib/transaction-utils';

interface DisplayOrder {
  record: OrderRecord;
  id: string;
  side: 'buy' | 'sell';
  tickRange: { min: number; max: number };
  limitPrice: number;
  quantity: number;
  filled: number;
  status: 'active' | 'partially-filled' | 'filled';
  createdAt: number;
}

export function UserOrders() {
  const { connected } = useWallet();
  const {
    fetchOrderRecords,
    cancelOrder,
    pendingTxs,
    loading: walletLoading,
  } = useWalletOperations();

  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /**
   * Fetch order records from the wallet.
   */
  const loadOrders = useCallback(async () => {
    if (!connected) return;

    setLoadingRecords(true);
    setFetchError(null);

    try {
      const records = await fetchOrderRecords();

      const displayOrders: DisplayOrder[] = records.map((record, idx) => {
        const fillPercent = record.quantity > 0 ? record.filled / record.quantity : 0;
        let status: DisplayOrder['status'] = 'active';
        if (fillPercent >= 1) status = 'filled';
        else if (fillPercent > 0) status = 'partially-filled';

        return {
          record,
          id: `order_${record.timestamp}_${idx}`,
          side: record.is_buy ? 'buy' : 'sell',
          tickRange: {
            min: tickToPrice(record.tick_lower),
            max: tickToPrice(record.tick_upper),
          },
          limitPrice: basisPointsToPrice(record.limit_price),
          quantity: record.quantity,
          filled: record.filled,
          status,
          createdAt: record.timestamp * 1000,
        };
      });

      setOrders(displayOrders);
    } catch (err) {
      console.error('[UserOrders] Failed to fetch records:', err);
      setFetchError(
        err instanceof Error ? err.message : 'Failed to fetch order records. Make sure your wallet supports record requests.'
      );
    } finally {
      setLoadingRecords(false);
    }
  }, [connected, fetchOrderRecords]);

  // Load orders when connected
  useEffect(() => {
    if (connected) {
      loadOrders();
    } else {
      setOrders([]);
    }
  }, [connected, loadOrders]);

  const handleCancelOrder = async (order: DisplayOrder) => {
    if (!order.record._plaintext) return;

    setCancelling(order.id);
    try {
      await cancelOrder(order.record._plaintext);
      // Refresh orders after cancellation is submitted
      setTimeout(() => loadOrders(), 2000);
    } catch (err) {
      console.error('[UserOrders] Cancel error:', err);
    } finally {
      setCancelling(null);
    }
  };

  const activeOrders = orders.filter(o => o.status !== 'filled');
  const totalValue = orders.reduce((sum, o) => sum + o.limitPrice * o.quantity, 0);
  const totalFilled = orders.reduce((sum, o) => sum + o.filled, 0);

  if (!connected) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">
          Connect your wallet to view your orders
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base sm:text-lg font-bold text-foreground">
          My Active Orders (Private)
        </h2>
        <Button
          onClick={loadOrders}
          disabled={loadingRecords}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          {loadingRecords ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {loadingRecords ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* Pending Transactions Banner */}
      {pendingTxs.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-sm text-blue-600 font-semibold mb-1">
            Pending Transactions ({pendingTxs.filter(t => t.status === 'pending').length})
          </p>
          <div className="space-y-1">
            {pendingTxs.slice(0, 3).map(tx => (
              <p key={tx.txId} className="text-xs text-blue-600/80 font-mono">
                {tx.type}: {formatTxId(tx.txId)} - {tx.status}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {fetchError && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-sm text-amber-600">{fetchError}</p>
          <p className="text-xs text-amber-600/80 mt-1">
            Your wallet may need to sync records. Try refreshing after submitting an order.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 pb-4 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground">Active Orders</p>
          <p className="text-base sm:text-lg font-bold text-foreground">
            {activeOrders.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Value</p>
          <p className="text-base sm:text-lg font-bold text-primary">
            {totalValue > 0 ? `$${totalValue.toFixed(2)}` : '--'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Filled</p>
          <p className="text-base sm:text-lg font-bold text-accent">
            {totalFilled > 0 ? totalFilled.toLocaleString() : '--'}
          </p>
        </div>
      </div>

      {/* Orders List */}
      {orders.length === 0 && !loadingRecords ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No orders yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first order to start trading privately
          </p>
        </div>
      ) : loadingRecords ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-muted-foreground">Loading your order records from wallet...</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onCancel={() => handleCancelOrder(order)}
              cancelling={cancelling === order.id}
            />
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
        <p className="text-xs text-foreground leading-relaxed">
          <span className="font-semibold">Privacy Guarantee:</span> Order details
          including exact prices, quantities, and settlement information remain
          encrypted on the Aleo network. Only you can view complete order details
          via your wallet&apos;s view key.
        </p>
      </div>
    </div>
  );
}

interface OrderRowProps {
  order: DisplayOrder;
  onCancel: () => void;
  cancelling: boolean;
}

function OrderRow({ order, onCancel, cancelling }: OrderRowProps) {
  const fillPercent = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
  const isBuy = order.side === 'buy';
  const isActive = order.status !== 'filled';

  const formatTime = (timestamp: number) => {
    if (!timestamp || timestamp <= 0) return 'Unknown';
    const mins = Math.floor((Date.now() - timestamp) / 60000);
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
            <span
              className={`text-xs font-semibold px-2 py-1 rounded ${
                order.status === 'active'
                  ? 'bg-accent/20 text-accent'
                  : order.status === 'filled'
                    ? 'bg-green-500/20 text-green-600'
                    : 'bg-primary/20 text-primary'
              }`}
            >
              {order.status === 'partially-filled'
                ? 'Partially Filled'
                : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
          </div>

          <p className="text-xs text-muted-foreground mb-1">
            Tick Range: ${order.tickRange.min.toFixed(2)} - $
            {order.tickRange.max.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">
            Limit Price: ${order.limitPrice.toFixed(2)} | Qty:{' '}
            <span className="font-mono text-foreground">{order.quantity.toLocaleString()}</span> |{' '}
            {formatTime(order.createdAt)}
          </p>
        </div>

        {isActive && (
          <Button
            onClick={onCancel}
            disabled={cancelling}
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {/* Fill Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">Filled</p>
          <p className="text-xs font-mono text-foreground">
            {order.filled.toLocaleString()}/{order.quantity.toLocaleString()}
          </p>
        </div>
        <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full transition-all ${isBuy ? 'bg-primary' : 'bg-destructive'}`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
