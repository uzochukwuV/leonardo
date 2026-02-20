'use client';

import { useState } from 'react';
import { Header } from '@/components/header';
import { OrderBookDisplay } from '@/components/order-book-display';
import { OrderPlacementForm } from '@/components/order-placement-form';
import { RecentTrades } from '@/components/recent-trades';
import { OrderBookStats } from '@/components/order-book-stats';
import { useOrderBookData } from '@/hooks/use-order-book-data';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { config } from '@/lib/config';

export default function Dashboard() {
  const [selectedPairId, setSelectedPairId] = useState<number>(config.DEFAULT_TOKEN_PAIR);
  const [prefillPrice, setPrefillPrice] = useState<number | undefined>(undefined);

  // Single fetch for the whole page — all panels share this data
  const orderBookData = useOrderBookData(selectedPairId);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Trading Dashboard</h1>
            <p className="text-sm text-muted-foreground">Private tick-based order book on Aleo</p>
          </div>
          <Link href="/user-dashboard">
            <Button variant="outline" size="sm">My Orders</Button>
          </Link>
        </div>

        {/* Live stats bar */}
        <div className="mb-6">
          <OrderBookStats selectedPairId={selectedPairId} data={orderBookData} />
        </div>

        {/* Main layout: order book left, form right */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 mb-6">
          <OrderBookDisplay
            selectedPairId={selectedPairId}
            onPriceClick={(price) => setPrefillPrice(price)}
            data={orderBookData}
          />
          <OrderPlacementForm
            selectedPairId={selectedPairId}
            onPairChange={setSelectedPairId}
            prefillPrice={prefillPrice}
            onPrefillConsumed={() => setPrefillPrice(undefined)}
          />
        </div>

        {/* Recent trades below */}
        <RecentTrades selectedPairId={selectedPairId} data={orderBookData} />
      </main>

      <footer className="border-t border-border bg-card/50 mt-8">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <p>Private order book on <a href="https://aleo.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Aleo</a></p>
          <div className="flex gap-6">
            <a href="/" className="hover:text-primary">Home</a>
            <a href="#" className="hover:text-primary">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
