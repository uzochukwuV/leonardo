'use client';

import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * Wallet info display component
 * Shows connection status, wallet name, and public key
 */
export function WalletInfo() {
  const { wallet, publicKey, connected } = useWallet();

  if (!connected || !publicKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Wallet Not Connected
          </CardTitle>
          <CardDescription>
            Connect your Aleo wallet to start trading
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          Wallet Connected
        </CardTitle>
        <CardDescription>
          {wallet?.adapter.name || 'Unknown Wallet'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <p className="text-sm font-medium">Public Key</p>
          <code className="text-xs bg-muted p-2 rounded block mt-1 break-all">
            {publicKey}
          </code>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">Testnet</Badge>
          <Badge variant="default">Active</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
