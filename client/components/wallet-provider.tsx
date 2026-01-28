'use client';

import { ReactNode, useMemo } from 'react';
import { WalletProvider as AleoWalletProvider } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletModalProvider } from '@demox-labs/aleo-wallet-adapter-reactui';
import { LeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import {
  DecryptPermission,
  WalletAdapterNetwork,
} from '@demox-labs/aleo-wallet-adapter-base';

import '@demox-labs/aleo-wallet-adapter-reactui/styles.css';

/**
 * WalletProvider wraps the app with Aleo wallet connection capabilities.
 *
 * Uses the official Aleo Wallet Adapter:
 * - Supports Leo Wallet (primary) and other Aleo-compatible wallets
 * - Provides wallet connection modal UI
 * - Handles signing, decryption, and transaction requests
 * - Auto-reconnects on page load if previously connected
 *
 * DecryptPermission.UponRequest means the wallet will prompt the user
 * each time the dApp requests record decryption, providing better security.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [
      new LeoWalletAdapter({
        appName: 'Pteaker Order Book',
      }),
    ],
    []
  );

  return (
    <AleoWalletProvider
      wallets={wallets}
      decryptPermission={DecryptPermission.UponRequest}
      network={WalletAdapterNetwork.TestnetBeta}
      autoConnect={true}
    >
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </AleoWalletProvider>
  );
}
