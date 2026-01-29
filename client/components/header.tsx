'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useWalletModal } from '@demox-labs/aleo-wallet-adapter-reactui';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, Wallet, ChevronDown } from 'lucide-react';
import Link from 'next/link';

export function Header() {
  const { wallet, publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const shortAddress = publicKey
    ? `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`
    : '';

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Close menu when clicking outside
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
        {/* Logo & Navigation */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent">
            <span className="text-primary-foreground font-bold text-sm">Ⓟ</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Pteaker</h1>
            <p className="text-xs text-muted-foreground">
              Zero-Knowledge Trading
            </p>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Trading
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

        {/* Market Info */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Network</p>
            <p className="text-sm font-mono text-primary">Aleo Testnet</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Program</p>
            <p className="text-sm font-mono text-accent truncate max-w-[140px]">private_orderbook_v1</p>
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
              <span className="sm:hidden">
                {connecting ? '...' : 'Connect'}
              </span>
            </Button>
          ) : (
            <div className="relative" ref={menuRef}>
              <Button
                onClick={() => setShowMenu(!showMenu)}
                variant="outline"
                className="gap-2"
              >
                <span className="inline-flex w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
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
                        {publicKey}
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

                  {/* Network Badge */}
                  <div className="px-4 py-3 border-b border-border bg-background/50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-xs font-medium text-muted-foreground">
                        Aleo Testnet
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
                      href={`https://explorer.provable.com/address/${publicKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 text-sm h-9"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on Explorer
                      </Button>
                    </a>
                  </div>

                  {/* Disconnect */}
                  <div className="border-t border-border p-3 bg-background/50">
                    <button
                      onClick={() => {
                        disconnect();
                        setShowMenu(false);
                      }}
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
