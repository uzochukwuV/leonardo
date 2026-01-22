'use client';

import { Header } from '@/components/header';
import { OrderBookDisplay } from '@/components/order-book-display';
import { OrderPlacementForm } from '@/components/order-placement-form';
import { RecentTrades } from '@/components/recent-trades';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-10 max-w-7xl mx-auto w-full">
        {/* Header Section */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Trading Dashboard</h1>
            <p className="text-muted-foreground">Order book with private tick-based matching</p>
          </div>
          <Link href="/user-dashboard">
            <Button variant="outline" size="sm">
              My Orders
            </Button>
          </Link>
        </div>

        {/* Main Trading Interface */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Left Column - Order Book */}
          <div className="lg:col-span-2">
            <OrderBookDisplay />
          </div>

          {/* Right Column - Order Form */}
          <div>
            <OrderPlacementForm />
          </div>
        </div>

        {/* Recent Trades Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Recent Settlement Events</h2>
          <RecentTrades />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-16">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              Private tick-based order book on{' '}
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
              <a href="/" className="hover:text-primary transition-colors">
                Home
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                Docs
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
