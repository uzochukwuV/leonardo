'use client';

import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useWalletModal } from '@demox-labs/aleo-wallet-adapter-reactui';
import { Button } from '@/components/ui/button';
import { Wallet, LogOut } from 'lucide-react';

/**
 * Wallet connect button component
 * Shows "Connect Wallet" when disconnected
 * Shows address and disconnect option when connected
 */
export function WalletConnectButton() {
  const { wallet, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  const handleClick = () => {
    if (publicKey) {
      // Already connected - disconnect
      disconnect();
    } else {
      // Not connected - show wallet modal
      setVisible(true);
    }
  };

  const formatAddress = (address: string) => {
    const start = address.substring(0, 8);
    const end = address.substring(address.length - 6);
    return `${start}...${end}`;
  };

  return (
    <Button
      onClick={handleClick}
      disabled={connecting}
      variant={publicKey ? 'outline' : 'default'}
      className="gap-2"
    >
      {connecting ? (
        <>Connecting...</>
      ) : publicKey ? (
        <>
          <Wallet className="h-4 w-4" />
          {formatAddress(publicKey)}
          <LogOut className="h-4 w-4 ml-1" />
        </>
      ) : (
        <>
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </>
      )}
    </Button>
  );
}
