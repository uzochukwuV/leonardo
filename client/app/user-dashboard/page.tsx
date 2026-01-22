'use client';

import { Header } from '@/components/header';
import { UserOrders } from '@/components/user-orders';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function UserDashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-10 max-w-7xl mx-auto w-full">
        {/* Header Section */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">My Orders</h1>
            <p className="text-muted-foreground">View your active orders and trading history</p>
          </div>
          <Link href="/dashboard">
            <Button className="gap-2">
              Place New Order <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Orders Section */}
        <div className="grid gap-8 mb-8">
          <UserOrders />
        </div>

        {/* Info Section */}
        <div className="rounded-lg border border-border bg-card/50 p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Order Privacy</h2>
          <div className="grid md:grid-cols-2 gap-6 text-sm text-muted-foreground">
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">What's Private</h3>
              <ul className="space-y-2 list-disc list-inside">
                <li>Your exact limit price</li>
                <li>Your order quantity</li>
                <li>Your order timing</li>
                <li>Your identity from other traders</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">What's Public</h3>
              <ul className="space-y-2 list-disc list-inside">
                <li>Tick range of your order</li>
                <li>Order side (buy/sell)</li>
                <li>Settlement events (not orders)</li>
                <li>Network consensus</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-16">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              Track your orders on{' '}
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
              <Link href="/" className="hover:text-primary transition-colors">
                Home
              </Link>
              <Link href="/dashboard" className="hover:text-primary transition-colors">
                Trading
              </Link>
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
