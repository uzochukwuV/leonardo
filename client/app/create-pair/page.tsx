'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/header';
import { useAvailableTokens, TokenOption } from '@/hooks/use-available-tokens';
import { useRegisterPair } from '@/hooks/use-register-pair';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { config } from '@/lib/config';

export default function CreatePairPage() {
  const { connected } = useWallet();
  const { tokens, verifiedTokens, loading: tokensLoading, error: tokensError } = useAvailableTokens();
  const { registerPair, step, stepLabel, txId, error, reset, isLoading } = useRegisterPair();

  const [baseTokenId, setBaseTokenId] = useState<string>('');
  const [quoteTokenId, setQuoteTokenId] = useState<string>('');
  const [tickSize, setTickSize] = useState<number>(100); // Default $0.01
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [useManualInput, setUseManualInput] = useState(false);

  // Token list to show (verified only or all)
  const tokenList = showAllTokens ? tokens : verifiedTokens;

  // Validate manual token ID format (should be like "123field" or "0field")
  const isValidTokenId = (id: string) => /^\d+field$/.test(id.trim());

  // Get selected tokens for display
  const selectedBase = useMemo(() =>
    tokens.find(t => t.id === baseTokenId),
    [tokens, baseTokenId]
  );
  const selectedQuote = useMemo(() =>
    tokens.find(t => t.id === quoteTokenId),
    [tokens, quoteTokenId]
  );

  // Validation
  const baseValid = useManualInput ? isValidTokenId(baseTokenId) : !!baseTokenId;
  const quoteValid = useManualInput ? isValidTokenId(quoteTokenId) : !!quoteTokenId;
  const canSubmit = connected && baseValid && quoteValid && baseTokenId !== quoteTokenId && tickSize > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    await registerPair({
      baseTokenId,
      quoteTokenId,
      tickSize,
    });
  };

  const handleReset = () => {
    reset();
    setBaseTokenId('');
    setQuoteTokenId('');
    setTickSize(100);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Create Trading Pair</h1>
          <p className="text-sm text-muted-foreground">
            Register a new token pair on the private orderbook
          </p>
        </div>

        {/* Info Card */}
        <div className="rounded-lg border border-border bg-card p-4 mb-6">
          <h3 className="font-medium text-foreground mb-2">How it works</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>1. Select a base token (what you're trading)</li>
            <li>2. Select a quote token (what you're pricing in)</li>
            <li>3. Set the tick size (minimum price increment)</li>
            <li>4. Submit transaction to register the pair on-chain</li>
          </ul>
        </div>

        {/* Token Loading State */}
        {tokensLoading && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading available tokens...</p>
          </div>
        )}

        {tokensError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 mb-6">
            <p className="text-destructive">{tokensError}</p>
          </div>
        )}

        {/* Create Pair Form */}
        {!tokensLoading && !tokensError && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            {/* Input Mode Toggle */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setUseManualInput(false)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    !useManualInput
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Select from List
                </button>
                <button
                  onClick={() => setUseManualInput(true)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    useManualInput
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Enter Token ID
                </button>
              </div>
              {!useManualInput && (
                <button
                  onClick={() => setShowAllTokens(!showAllTokens)}
                  className="text-sm text-primary hover:underline"
                >
                  {showAllTokens ? 'Verified Only' : `All (${tokens.length})`}
                </button>
              )}
            </div>

            {/* Base Token Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Base Token
              </label>
              {useManualInput ? (
                <>
                  <input
                    type="text"
                    value={baseTokenId}
                    onChange={(e) => setBaseTokenId(e.target.value)}
                    disabled={isLoading}
                    placeholder="e.g., 0field for ALEO, 1field, 7002field..."
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter the token ID as a field literal (e.g., &quot;0field&quot; for native ALEO)
                  </p>
                  {baseTokenId && !isValidTokenId(baseTokenId) && (
                    <p className="mt-1 text-xs text-destructive">
                      Invalid format. Use format: [number]field (e.g., 0field, 123field)
                    </p>
                  )}
                </>
              ) : (
                <>
                  <select
                    value={baseTokenId}
                    onChange={(e) => setBaseTokenId(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select base token...</option>
                    {tokenList.map((token) => (
                      <option key={`base-${token.id}-${token.symbol}`} value={token.id}>
                        {token.symbol} - {token.name} {token.verified ? '(Verified)' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedBase && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Program: {selectedBase.programName} | Decimals: {selectedBase.decimals}
                      {selectedBase.price && ` | Price: $${selectedBase.price}`}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Quote Token Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Quote Token
              </label>
              {useManualInput ? (
                <>
                  <input
                    type="text"
                    value={quoteTokenId}
                    onChange={(e) => setQuoteTokenId(e.target.value)}
                    disabled={isLoading}
                    placeholder="e.g., 1field for USDC, 7002field..."
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter the quote token ID (what you price the base token in)
                  </p>
                  {quoteTokenId && !isValidTokenId(quoteTokenId) && (
                    <p className="mt-1 text-xs text-destructive">
                      Invalid format. Use format: [number]field (e.g., 1field, 7002field)
                    </p>
                  )}
                </>
              ) : (
                <>
                  <select
                    value={quoteTokenId}
                    onChange={(e) => setQuoteTokenId(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select quote token...</option>
                    {tokenList
                      .filter(t => t.id !== baseTokenId) // Exclude selected base
                      .map((token) => (
                        <option key={`quote-${token.id}-${token.symbol}`} value={token.id}>
                          {token.symbol} - {token.name} {token.verified ? '(Verified)' : ''}
                        </option>
                      ))}
                  </select>
                  {selectedQuote && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Program: {selectedQuote.programName} | Decimals: {selectedQuote.decimals}
                      {selectedQuote.price && ` | Price: $${selectedQuote.price}`}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Tick Size */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Tick Size (basis points)
              </label>
              <input
                type="number"
                min={1}
                max={10000}
                value={tickSize}
                onChange={(e) => setTickSize(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isLoading}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                100 = $0.01 | 1000 = $0.10 | 10000 = $1.00
              </p>
            </div>

            {/* Pair Preview */}
            {baseTokenId && quoteTokenId && (
              <div className="rounded-md bg-muted/50 p-4">
                <h4 className="font-medium text-foreground mb-2">Pair Preview</h4>
                <div className="text-sm space-y-1">
                  {selectedBase && selectedQuote ? (
                    <p>
                      <span className="text-muted-foreground">Name:</span>{' '}
                      <span className="font-mono">{selectedBase.symbol}/{selectedQuote.symbol}</span>
                    </p>
                  ) : (
                    <p>
                      <span className="text-muted-foreground">Pair:</span>{' '}
                      <span className="font-mono text-xs">{baseTokenId} / {quoteTokenId}</span>
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Base Token ID:</span>{' '}
                    <span className="font-mono text-xs">{baseTokenId}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Quote Token ID:</span>{' '}
                    <span className="font-mono text-xs">{quoteTokenId}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Min Price Step:</span>{' '}
                    <span className="font-mono">${(tickSize / 10000).toFixed(4)}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/50 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Success Display */}
            {step === 'done' && txId && (
              <div className="rounded-md bg-green-500/10 border border-green-500/50 p-3">
                <p className="text-sm text-green-600 dark:text-green-400">
                  Pair registered successfully!
                </p>
                <a
                  href={`${config.EXPLORER_URL}/transaction/${txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  View transaction
                </a>
              </div>
            )}

            {/* Step Status */}
            {stepLabel[step] && step !== 'done' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                {stepLabel[step]}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              {step === 'done' ? (
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                >
                  Create Another Pair
                </button>
              ) : (
                <>
                  {!connected ? (
                    <p className="text-sm text-muted-foreground">
                      Connect your wallet to create a pair
                    </p>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit || isLoading}
                      className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Processing...' : 'Register Pair'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Links */}
        <div className="mt-6 flex gap-4 text-sm text-muted-foreground">
          <a href="/dashboard" className="hover:text-primary">
            Back to Trading
          </a>
          <span>|</span>
          <a
            href={`https://explorer.provable.com/program/${config.CONTRACT_PROGRAM_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary"
          >
            View Contract
          </a>
        </div>
      </main>
    </div>
  );
}
