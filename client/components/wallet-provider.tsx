'use client';

import { ReactNode, useMemo, useState, useEffect } from 'react';
import { WalletProvider as AleoWalletProvider } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletModalProvider } from '@demox-labs/aleo-wallet-adapter-reactui';
import { LeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import {
  DecryptPermission,
  WalletAdapterNetwork,
} from '@demox-labs/aleo-wallet-adapter-base';

// Import default wallet adapter styles
import '@demox-labs/aleo-wallet-adapter-reactui/styles.css';

/**
 * WalletProvider component wraps the app to manage Aleo wallet connection globally.
 *
 * Uses the official Aleo Wallet Adapter:
 * - Supports Leo Wallet and other Aleo-compatible wallets
 * - Provides wallet connection modal UI
 * - Handles signing, decryption, and transaction requests
 * - Auto-reconnects on page load if previously connected
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  // Initialize wallet adapters
  const wallets = useMemo(
    () => [
      new LeoWalletAdapter({
        appName: 'Aleo Order Book',
      }),
    ],
    []
  );

  wallets[0].connect(DecryptPermission.NoDecrypt, WalletAdapterNetwork.TestnetBeta)

  return (
    <AleoWalletProvider
      wallets={wallets}
      decryptPermission={DecryptPermission.NoDecrypt}
      network={WalletAdapterNetwork.TestnetBeta}
      autoConnect={true}
    >
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </AleoWalletProvider>
  );
}
