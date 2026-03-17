'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, Wallet, ChevronDown, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useTokenBalances } from '@/hooks/use-token-balances';
import { config } from '@/lib/config';

export function Header() {
  const { wallet, address, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Live price from chain
  // Token balances
  const { balances, loading: balancesLoading, refresh: refreshBalances } = useTokenBalances();

  const shortAddress = address
    ? `${address.slice(0, 8)}...${address.slice(-8)}`
    : '';

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent">
            <span className="text-primary-foreground font-bold text-sm">Ⓟ</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Pteaker</h1>
            <p className="text-xs text-muted-foreground">Zero-Knowledge Trading</p>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Trading
          </Link>
          <Link href="/create-pair" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Create Pair
          </Link>
          {connected && (
            <Link href="/user-dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              My Orders
            </Link>
          )}
          <a href="https://aleo.org" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Docs
          </a>
        </div>

        {/* Live Market Info */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Last Price</p>
            <p className="text-sm font-mono text-primary">
              {/* {lastPrice > 0 ? `$${lastPrice.toFixed(2)}` : '—'} */}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Network</p>
            <p className="text-sm font-mono text-accent capitalize">{config.NETWORK}</p>
          </div>
        </div>

        {/* Wallet Button */}
        <div className="relative flex items-center gap-2">
          {!connected ? (
            <Button
              onClick={() => setVisible(true)}
              disabled={connecting}
              className="gap-2"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">
                {connecting ? 'Connecting...' : 'Connect Wallet'}
              </span>
              <span className="sm:hidden">{connecting ? '...' : 'Connect'}</span>
            </Button>
          ) : (
            <div className="relative" ref={menuRef}>
              <Button
                onClick={() => setShowMenu(!showMenu)}
                variant="outline"
                className="gap-2"
              >
                <span className="inline-flex w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="hidden sm:inline">{shortAddress}</span>
                <span className="sm:hidden text-xs">Connected</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
              </Button>

              {showMenu && (
                <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-card shadow-xl overflow-hidden z-50">
                  {/* Wallet Info */}
                  <div className="p-4 border-b border-border space-y-3 bg-gradient-to-br from-primary/5 to-accent/5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        Connected Wallet
                      </p>
                      {wallet && (
                        <span className="text-xs font-medium text-primary">
                          {wallet.adapter.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3 bg-background rounded-lg">
                      <code className="text-xs font-mono text-foreground truncate flex-1">
                        {address}
                      </code>
                      <button
                        onClick={copyAddress}
                        title={copied ? 'Copied!' : 'Copy address'}
                        className="p-1.5 hover:bg-primary/10 rounded transition-colors"
                      >
                        <Copy className={`w-4 h-4 ${copied ? 'text-green-500' : 'text-primary'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Token Balances */}
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        Balances
                      </p>
                      <button
                        onClick={(e) => { e.stopPropagation(); refreshBalances(); }}
                        className="p-1 hover:bg-primary/10 rounded transition-colors"
                        title="Refresh balances"
                      >
                        <RefreshCw className={`w-3 h-3 text-muted-foreground ${balancesLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {Object.values(balances).map((bal) => (
                        <div
                          key={bal.token.symbol}
                          className="flex items-center justify-between p-2 bg-background rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{bal.token.icon}</span>
                            <div>
                              <p className="text-xs font-medium text-foreground">
                                {bal.token.symbol}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {bal.token.name}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            {bal.loading ? (
                              <p className="text-xs text-muted-foreground">Loading...</p>
                            ) : bal.error ? (
                              <p className="text-xs text-destructive">Error</p>
                            ) : (
                              <p className="text-sm font-mono text-foreground">
                                {bal.formatted}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      {Object.keys(balances).length === 0 && !balancesLoading && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          No tokens found
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Network Badge */}
                  <div className="px-4 py-3 border-b border-border bg-background/50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs font-medium text-muted-foreground capitalize">
                        Aleo {config.NETWORK}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-3 space-y-1">
                    <Link href="/user-dashboard" className="block">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-sm h-9"
                        onClick={() => setShowMenu(false)}
                      >
                        <Wallet className="w-4 h-4 mr-2" />
                        My Orders
                      </Button>
                    </Link>
                    <a
                      href={`https://explorer.aleo.org/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button variant="ghost" className="w-full justify-start gap-2 text-sm h-9">
                        <ExternalLink className="w-4 h-4" />
                        View on Explorer
                      </Button>
                    </a>
                  </div>

                  {/* Disconnect */}
                  <div className="border-t border-border p-3 bg-background/50">
                    <button
                      onClick={() => { disconnect(); setShowMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded transition-colors font-medium flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4 rotate-180" />
                      Disconnect Wallet
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
