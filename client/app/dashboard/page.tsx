'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/header';
import { OrderPlacementForm } from '@/components/order-placement-form';
import { UserOrders } from '@/components/user-orders';
import { useTradingPairs } from '@/hooks/use-trading-pairs';

export default function Dashboard() {
  const { pairs, loading: loadingPairs, error: pairsError } = useTradingPairs();
  const [selectedPairId, setSelectedPairId] = useState<number | null>(null);

  // Auto-select first pair when pairs load
  useEffect(() => {
    if (pairs.length > 0 && selectedPairId === null) {
      setSelectedPairId(pairs[0].id);
    }
  }, [pairs, selectedPairId]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Private Trading</h1>
          <p className="text-sm text-muted-foreground">
            Place orders and manage your positions privately on Aleo
          </p>
          {pairsError && (
            <p className="text-sm text-destructive mt-1">{pairsError}</p>
          )}
        </div>

        {/* Main layout: order form left, user orders right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order Placement */}
          <div>
            <OrderPlacementForm
              pairs={pairs}
              selectedPairId={selectedPairId ?? 0}
              onPairChange={setSelectedPairId}
              loadingPairs={loadingPairs}
            />
          </div>

          {/* User's Orders (Receipts) */}
          <div>
            <UserOrders />
          </div>
        </div>

        {/* Privacy Info */}
        <div className="mt-8 rounded-lg border border-border bg-card/50 p-6">
          <h2 className="font-semibold text-foreground mb-4">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-muted-foreground">
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">1. Place Order</h3>
              <p>Submit your buy or sell order. Your order details are encrypted and private.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">2. Receive Receipt</h3>
              <p>You receive a Receipt record as proof of your order. Only you can see it.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">3. Automatic Settlement</h3>
              <p>When prices cross, orders are matched and settled. You receive a SettlementProof.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-card/50 mt-8">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <p>
            Private order book on{' '}
            <a
              href="https://aleo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Aleo
            </a>
          </p>
          <div className="flex gap-6">
            <a href="/" className="hover:text-primary">
              Home
            </a>
            <a href="/create-pair" className="hover:text-primary">
              Create Pair
            </a>
            <a href="#" className="hover:text-primary">
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
