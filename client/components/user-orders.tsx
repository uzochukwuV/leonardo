'use client';

import { useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

interface Order {
  id: string;
  side: 'buy' | 'sell';
  tickRange: { min: number; max: number };
  limitPrice: number;
  quantity: number;
  filled: number;
  status: 'active' | 'partially-filled' | 'filled' | 'cancelled';
  createdAt: number;
  filledAmount: number;
}

// Mock user orders
const MOCK_ORDERS: Order[] = [
  {
    id: 'order_1',
    side: 'buy',
    tickRange: { min: 14.95, max: 15.05 },
    limitPrice: 15.0,
    quantity: 1000,
    filled: 250,
    status: 'partially-filled',
    createdAt: Date.now() - 3600000,
    filledAmount: 250,
  },
  {
    id: 'order_2',
    side: 'sell',
    tickRange: { min: 15.5, max: 15.6 },
    limitPrice: 15.55,
    quantity: 2500,
    filled: 500,
    status: 'partially-filled',
    createdAt: Date.now() - 7200000,
    filledAmount: 500,
  },
  {
    id: 'order_3',
    side: 'buy',
    tickRange: { min: 14.85, max: 14.95 },
    limitPrice: 14.9,
    quantity: 5000,
    filled: 0,
    status: 'active',
    createdAt: Date.now() - 1800000,
    filledAmount: 0,
  },
];

export function UserOrders() {
  const { connected } = useWallet();
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const handleCancelOrder = async (orderId: string) => {
    setCancelling(orderId);
    try {
      // Simulate cancel transaction
      await new Promise((resolve) => setTimeout(resolve, 800));
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'cancelled' } : o
        )
      );
    } finally {
      setCancelling(null);
    }
  };

  const totalValue = orders.reduce((sum, o) => sum + o.limitPrice * o.quantity, 0);
  const totalFilled = orders.reduce((sum, o) => sum + o.filledAmount, 0);

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
      <h2 className="text-base sm:text-lg font-bold text-foreground mb-6">
        My Active Orders (Private)
      </h2>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 pb-4 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground">Active Orders</p>
          <p className="text-base sm:text-lg font-bold text-foreground">
            {orders.filter((o) => o.status !== 'cancelled').length}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Value</p>
          <p className="text-base sm:text-lg font-bold text-primary">
            ${totalValue.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Filled</p>
          <p className="text-base sm:text-lg font-bold text-accent">
            ${totalFilled.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Orders Table */}
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No orders yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first order to start trading privately
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onCancel={() => handleCancelOrder(order.id)}
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
          encrypted on the Aleo network. Only you can view complete order details.
        </p>
      </div>
    </div>
  );
}

interface OrderRowProps {
  order: Order;
  onCancel: () => void;
  cancelling: boolean;
}

function OrderRow({ order, onCancel, cancelling }: OrderRowProps) {
  const fillPercent = (order.filled / order.quantity) * 100;
  const isBuy = order.side === 'buy';
  const isActive = order.status !== 'cancelled' && order.status !== 'filled';

  const formatTime = (timestamp: number) => {
    const mins = Math.floor((Date.now() - timestamp) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-3">
        {/* Order Info */}
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
                  : order.status === 'cancelled'
                    ? 'bg-muted/20 text-muted-foreground'
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
            Limit Price: ${order.limitPrice.toFixed(2)} • Qty:{' '}
            <span className="font-mono text-foreground">{order.quantity}</span> •{' '}
            {formatTime(order.createdAt)}
          </p>
        </div>

        {/* Cancel Button */}
        {isActive && (
          <Button
            onClick={onCancel}
            disabled={cancelling}
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Fill Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">Filled</p>
          <p className="text-xs font-mono text-foreground">
            {order.filled}/{order.quantity}
          </p>
        </div>
        <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full transition-all ${
              isBuy ? 'bg-primary' : 'bg-destructive'
            }`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
