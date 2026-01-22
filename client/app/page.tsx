'use client';

import { Header } from '@/components/header';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 max-w-7xl mx-auto w-full">
        {/* Hero Section */}
        <div className="mb-16 text-center space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground text-balance">
              Private Tick-Based Order Book
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto text-balance">
              The first truly private trading platform on{' '}
              <span className="text-primary font-semibold">Aleo</span> blockchain.
              Trade with zero-knowledge proofs. Keep your orders encrypted.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/dashboard">
              <Button size="lg" className="gap-2">
                Start Trading <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/user-dashboard">
              <Button size="lg" variant="outline">
                View My Orders
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="p-6 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground text-lg">Complete Privacy</h3>
            <p className="text-sm text-muted-foreground">
              Your order prices and quantities are encrypted. Only tick ranges are visible to the network.
            </p>
          </div>

          <div className="p-6 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground text-lg">Zero-Knowledge Proofs</h3>
            <p className="text-sm text-muted-foreground">
              Verified settlements without revealing sensitive order details to anyone.
            </p>
          </div>

          <div className="p-6 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground text-lg">Regulatory Compliant</h3>
            <p className="text-sm text-muted-foreground">
              Built on Aleo for privacy-preserving compliant financial services.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-16 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">How Pteaker Works</h2>
            <p className="text-muted-foreground">A 5-step process for private trading</p>
          </div>

          <div className="grid md:grid-cols-5 gap-4">
            {[
              { step: 1, title: 'Set Tick Range', desc: 'Public range visible to all' },
              { step: 2, title: 'Encrypt Order', desc: 'Price & quantity encrypted' },
              { step: 3, title: 'Submit', desc: 'Order to network' },
              { step: 4, title: 'Match', desc: 'Private matching engine' },
              { step: 5, title: 'Settle', desc: 'At midpoint price' },
            ].map((item, idx) => (
              <div key={idx} className="relative">
                <div className="p-4 rounded-lg border border-border bg-card/50 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                    <span className="font-bold text-primary">{item.step}</span>
                  </div>
                  <h4 className="font-semibold text-foreground text-sm">{item.title}</h4>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                {idx < 4 && (
                  <div className="hidden md:block absolute top-1/3 -right-2 w-4 h-0.5 bg-primary/30" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="mb-16 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Privacy Benefits</h2>
            <p className="text-muted-foreground">Trade confidently on Aleo</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-1">
                  <svg className="w-3 h-3 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Front-Running Protection</h4>
                  <p className="text-sm text-muted-foreground">Encrypted order details prevent front-running</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-1">
                  <svg className="w-3 h-3 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Competitive Intelligence</h4>
                  <p className="text-sm text-muted-foreground">Your quantities and timing stay confidential</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-1">
                  <svg className="w-3 h-3 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Regulatory Ready</h4>
                  <p className="text-sm text-muted-foreground">Compliance without sacrificing privacy</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center mt-1">
                  <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Fair Price Discovery</h4>
                  <p className="text-sm text-muted-foreground">Tick-level transparency maintains market integrity</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center mt-1">
                  <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Verifiable Proofs</h4>
                  <p className="text-sm text-muted-foreground">All settlements verified with zero-knowledge proofs</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center mt-1">
                  <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Fully On-Chain</h4>
                  <p className="text-sm text-muted-foreground">Powered by Aleo smart contracts</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Ready to Trade Privately?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Connect your Aleo wallet and start placing orders on the first private tick-based order book.
          </p>
          <Link href="/dashboard">
            <Button size="lg" className="gap-2">
              Launch Dashboard <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-16">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              Built on{' '}
              <a
                href="https://aleo.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Aleo
              </a>{' '}
              • Privacy by design
            </p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-primary transition-colors">
                Docs
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                GitHub
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                Discord
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
