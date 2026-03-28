'use client';

import { ReactNode, useMemo } from 'react';
import { AleoWalletProvider as ProvableWalletProvider } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { PuzzleWalletAdapter } from '@provablehq/aleo-wallet-adaptor-puzzle';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import { Network } from '@provablehq/aleo-types';
import { PuzzleWalletProvider } from '@puzzlehq/sdk';
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css';
import { config } from '@/lib/config';

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [
      new PuzzleWalletAdapter({ appName: 'Pteaker Order Book' }),
      new ShieldWalletAdapter({ appName: 'Pteaker Order Book' }),
      new LeoWalletAdapter({ appName: 'Pteaker Order Book' }),
    ],
    []
  );

  return (
    // PuzzleWalletProvider sets up React Query + WebSocket context that
    // useRecords / useEvents require (window.aleo.puzzleWalletClient).
    // <PuzzleWalletProvider>
      <ProvableWalletProvider
        wallets={wallets}
        decryptPermission={DecryptPermission.OnChainHistory}
        network={config.NETWORK === 'testnet' ? Network.TESTNET : Network.MAINNET}
        autoConnect
         programs={[config.CONTRACT_PROGRAM_ID, 'token_registry.aleo', 'credits.aleo', 'test_usdcx_stablecoin.aleo']}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </ProvableWalletProvider>
    // </PuzzleWalletProvider>
  );
}
