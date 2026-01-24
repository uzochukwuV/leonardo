'use client';

import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * Wallet info display component
 * Shows connection status, wallet name, and public key
 */
export function WalletInfo() {
  const { wallet, publicKey, connected } = useWallet();

  if (!connected || !publicKey) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <XCircle className="h-5 w-5 text-destructive" />
          <h3 className="text-lg font-bold text-foreground">Wallet Not Connected</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect your Aleo wallet to start trading
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="h-5 w-5 text-green-500" />
        <h3 className="text-lg font-bold text-foreground">Wallet Connected</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {wallet?.adapter.name || 'Unknown Wallet'}
      </p>
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Public Key</p>
          <code className="text-xs bg-muted p-2 rounded block mt-1 break-all font-mono">
            {publicKey}
          </code>
        </div>
        <div className="flex gap-2">
          <span className="text-xs px-2 py-1 rounded border border-border bg-background">Testnet</span>
          <span className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground">Active</span>
        </div>
      </div>
    </div>
  );
}
