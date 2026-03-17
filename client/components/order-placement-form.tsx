'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Button } from '@/components/ui/button';
import {
  calculateEscrowAmount,
  priceToBasisPoints,
} from '@/lib/token-pairs';
import { config } from '@/lib/config';
import { Lock, AlertCircle, CheckCircle2, Loader2, Wallet, ChevronDown, Wifi, WifiOff, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { useSubmitOrder } from '@/hooks/use-submit-order';
import { useTokenBalances } from '@/hooks/use-token-balances';
import { TradingPair } from '@/hooks/use-trading-pairs';
import { usePairPrices } from '@/hooks/use-pair-prices';

interface OrderPlacementFormProps {
  pairs: TradingPair[];
  selectedPairId: number;
  onPairChange: (id: number) => void;
  loadingPairs?: boolean;
  prefillPrice?: number;
  onPrefillConsumed?: () => void;
}

const EXPIRY_OPTIONS = [
  { label: 'No expiry', value: 0 },
  { label: '~10 min', value: 30 },
  { label: '~1 hour', value: 180 },
  { label: '~1 day', value: 4320 },
] as const;

export function OrderPlacementForm({
  pairs,
  selectedPairId,
  onPairChange,
  loadingPairs = false,
  prefillPrice,
  onPrefillConsumed,
}: OrderPlacementFormProps) {
  const { address } = useWallet();
  const { setVisible } = useWalletModal();
  const connected = !!address;

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [limitPrice, setLimitPrice] = useState(config.BASE_PRICE.toString());
  const [quantity, setQuantity] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [showPairs, setShowPairs] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalCompleted, setApprovalCompleted] = useState(false);

  // Fetch best bid/ask from keeper
  const { getBestBid, getBestAsk, getMidPrice } = usePairPrices();

  const {
    approveQuoteTokens,
    submitOrder,
    step,
    stepLabel,
    txId,
    approvalTxId,
    error,
    reset,
    orchestratorAddr,
    loadingOrchestrator,
  } = useSubmitOrder();

  const { refresh: refreshBalances } = useTokenBalances();

  const submitting = step !== 'idle' && step !== 'done';
  const success = step === 'done';

  // Get selected pair from props
  const pair = useMemo(() => pairs.find(p => p.id === selectedPairId), [pairs, selectedPairId]);

  // Get best prices for selected pair
  const bestBid = pair ? getBestBid(pair.id) : null;
  const bestAsk = pair ? getBestAsk(pair.id) : null;
  const midPrice = pair ? getMidPrice(pair.id) : null;

  // Consume prefill price from order book click
  useEffect(() => {
    if (prefillPrice !== undefined && prefillPrice > 0) {
      setLimitPrice(prefillPrice.toFixed(4));
      onPrefillConsumed?.();
    }
  }, [prefillPrice, onPrefillConsumed]);

  const isBuy = side === 'buy';
  const price = parseFloat(limitPrice) || 0;
  const qty = parseFloat(quantity) || 0;

  // Determine if approval is needed for buy orders
  // Always require approval for buy orders with non-native quote tokens (no allowance checking)
  useEffect(() => {
    // If approval was just completed, don't require it again
    if (approvalCompleted) {
      setNeedsApproval(false);
      return;
    }

    // Basic validation
    if (!connected || !pair || !address) {
      setNeedsApproval(false);
      return;
    }

    // Sell orders don't need token approval (they escrow base token directly)
    if (!isBuy) {
      setNeedsApproval(false);
      return;
    }

    // For buy orders, check if quote token is native ALEO (no approval needed)
    const isNativeQuote = pair.quoteToken.tokenId === '0field';
    if (isNativeQuote) {
      setNeedsApproval(false);
      return;
    }

    // Need valid quantity and price to proceed
    if (qty <= 0 || price <= 0) {
      setNeedsApproval(false);
      return;
    }

    // For buy orders with non-native quote tokens, always require approval first
    setNeedsApproval(true);
  }, [isBuy, qty, price, connected, pair, address, approvalCompleted]);

  // Reset approval state when side or pair changes
  const resetFormState = useCallback(() => {
    reset();
    setQuantity('');
    setApprovalCompleted(false);
  }, [reset]);

  useEffect(() => {
    resetFormState();
  }, [side, selectedPairId, resetFormState]);


  if (!pair) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        {loadingPairs ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading trading pairs...</p>
          </div>
        ) : pairs.length === 0 ? (
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No trading pairs available</p>
            <a href="/create-pair" className="text-sm text-primary hover:underline">
              Create a new pair
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a trading pair</p>
        )}
      </div>
    );
  }

  const escrowToken = isBuy ? pair.quoteToken : pair.baseToken;

  // Live escrow calculation
  const quantityRaw = BigInt(Math.floor(qty * Math.pow(10, pair.baseToken.decimals)));
  const priceBps = BigInt(priceToBasisPoints(price));
  const escrowRaw =
    price > 0 && qty > 0 ? calculateEscrowAmount(isBuy, quantityRaw, priceBps) : 0n;
  const escrowDisplay = (Number(escrowRaw) / Math.pow(10, escrowToken.decimals)).toFixed(4);
  const valueUsd = (qty * price).toFixed(2);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price || price <= 0 || !qty || qty <= 0) return;

    const txId = await approveQuoteTokens({
      pairId: selectedPairId,
      isBuy,
      limitPriceUsd: price,
      quantity: qty,
      expiresAt,
    });

    // After successful approval, mark it and skip future allowance checks
    if (txId) {
      setApprovalCompleted(true);
      setNeedsApproval(false);
      // Refresh balances to get updated allowance (async, don't wait)
      refreshBalances();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price || price <= 0 || !qty || qty <= 0) return;

    const result = await submitOrder({
      pairId: selectedPairId,
      isBuy,
      limitPriceUsd: price,
      quantity: qty,
      expiresAt,
    });

    if (result) {
      setQuantity('');
      setApprovalCompleted(false);
      setTimeout(reset, 12_000);
    }
  };

  const canSubmit = connected && !loadingOrchestrator && orchestratorAddr && qty > 0 && price > 0;

  // Show approval button only if: needs approval AND approval not yet completed
  const showApprovalButton = isBuy && needsApproval && !approvalCompleted && !approvalTxId;

  const getButtonText = () => {
    if (submitting) {
      return (
        <span className="flex items-center gap-2 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          {stepLabel[step]}
        </span>
      );
    }
    if (loadingOrchestrator) {
      return (
        <span className="flex items-center gap-2 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </span>
      );
    }
    if (showApprovalButton) {
      return `Approve ${pair.quoteToken.symbol} to continue`;
    }
    return `${isBuy ? 'Buy' : 'Sell'} ${pair.baseToken.symbol}`;
  };

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Place Order</h2>
        {orchestratorAddr ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Wifi className="w-3 h-3" /> Connected
          </span>
        ) : loadingOrchestrator ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <WifiOff className="w-3 h-3" /> Offline
          </span>
        )}
      </div>

      {/* Step indicator */}
      {submitting && (
        <div className="px-4 py-2 bg-primary/5 border-b border-border">
          <p className="text-xs text-foreground font-semibold">{stepLabel[step]}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Token Pair dropdown */}
        <div className="relative">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            Token Pair
          </label>
          <button
            type="button"
            onClick={() => setShowPairs((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-input text-sm font-semibold hover:bg-muted/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              {pair.name}
              {loadingPairs && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                showPairs ? 'rotate-180' : ''
              }`}
            />
          </button>
          {showPairs && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden max-h-64 overflow-y-auto">
              {pairs.map((p: TradingPair) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPairChange(p.id);
                    setShowPairs(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left ${
                    p.id === selectedPairId
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground'
                  }`}
                >
                  {p.name}
                  <span className="ml-auto text-xs text-muted-foreground">
                    ID: {p.id}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Best Prices from Keeper */}
        {(bestBid !== null || bestAsk !== null) && (
          <div className="rounded-lg bg-muted/20 border border-border p-2.5 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Info className="w-3 h-3" />
              <span>Market Prices</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {bestBid !== null && (
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">Best Bid:</span>
                  <span className="font-mono text-primary">${bestBid.toFixed(4)}</span>
                </div>
              )}
              {bestAsk !== null && (
                <div className="flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-destructive" />
                  <span className="text-muted-foreground">Best Ask:</span>
                  <span className="font-mono text-destructive">${bestAsk.toFixed(4)}</span>
                </div>
              )}
            </div>
            {midPrice !== null && (
              <p className="text-muted-foreground mt-1">
                Mid: <span className="font-mono">${midPrice.toFixed(4)}</span>
                {isBuy && bestAsk !== null && (
                  <button
                    type="button"
                    onClick={() => setLimitPrice(bestAsk.toFixed(4))}
                    className="ml-2 text-primary hover:underline"
                  >
                    Use best ask for instant fill
                  </button>
                )}
                {!isBuy && bestBid !== null && (
                  <button
                    type="button"
                    onClick={() => setLimitPrice(bestBid.toFixed(4))}
                    className="ml-2 text-primary hover:underline"
                  >
                    Use best bid for instant fill
                  </button>
                )}
              </p>
            )}
          </div>
        )}

        {/* Pair Info */}
        <div className="rounded-lg bg-muted/10 border border-border p-2 text-xs">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-muted-foreground block">Tick Size</span>
              <span className="font-mono">{pair.tickSize} bps</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Base</span>
              <span className="font-mono">{pair.baseToken.symbol}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Quote</span>
              <span className="font-mono">{pair.quoteToken.symbol}</span>
            </div>
          </div>
        </div>

        {/* Buy / Sell */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            Side
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['buy', 'sell'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                disabled={submitting}
                className={`py-2.5 rounded-lg font-bold text-sm capitalize transition-all disabled:opacity-50 ${
                  side === s
                    ? s === 'buy'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-destructive text-destructive-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Limit Price */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            <span className="flex items-center gap-1">
              Limit Price ({pair.quoteToken.symbol}/{pair.baseToken.symbol})
              <Lock className="w-3 h-3" />
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.0001"
              min={config.MIN_PRICE_BPS / 10000}
              max={config.MAX_PRICE_BPS / 10000}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              disabled={!connected || submitting}
              placeholder={config.BASE_PRICE.toString()}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Price in basis points: {priceToBasisPoints(price)} bps
          </p>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            <span className="flex items-center gap-1">
              Quantity ({pair.baseToken.symbol})
              <Lock className="w-3 h-3" />
            </span>
          </label>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={!connected || submitting}
            placeholder="0.000000"
            className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Raw: {quantityRaw.toString()} microcredits
          </p>
        </div>

        {/* Expiry */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            Expiry (blocks)
          </label>
          <div className="grid grid-cols-4 gap-1">
            {EXPIRY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setExpiresAt(opt.value)}
                disabled={submitting}
                className={`py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
                  expiresAt === opt.value
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live order summary */}
        {qty > 0 && price > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Order Summary</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-muted-foreground">Order value</span>
              <span className="font-mono font-bold text-foreground text-right">
                {valueUsd} {pair.quoteToken.symbol}
              </span>
              <span className="text-muted-foreground">Escrow required</span>
              <span
                className={`font-mono font-bold text-right ${
                  isBuy ? 'text-primary' : 'text-destructive'
                }`}
              >
                {escrowDisplay} {escrowToken.symbol}
              </span>
              <span className="text-muted-foreground">Escrow raw</span>
              <span className="font-mono text-right text-muted-foreground">
                {escrowRaw.toString()}u128
              </span>
            </div>
          </div>
        )}

        {/* Info notice */}
        {connected && !submitting && !success && (
          <p className="text-xs text-muted-foreground/60 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {isBuy
              ? `Buy orders require ${pair.quoteToken.symbol} approval to token_registry.aleo, then submit.`
              : "Sell orders escrow ALEO directly. You'll receive a Receipt record as proof."}
          </p>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {approvalTxId && !txId && (
          <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 flex gap-2 items-start">
            <CheckCircle2 className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-sky-500 font-semibold">Token approved successfully!</p>
              <p className="text-xs text-muted-foreground mt-1">Click the button below to submit your buy order.</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{approvalTxId}</p>
            </div>
          </div>
        )}

        {success && txId && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex gap-2 items-start">
            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-primary font-semibold">Order placed on-chain!</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{txId}</p>
            </div>
          </div>
        )}
      </div>

      {/* Fixed submit button */}
      <div className="p-4 border-t border-border">
        {!connected ? (
          <Button type="button" onClick={() => setVisible(true)} className="w-full gap-2">
            <Wallet className="w-4 h-4" />
            Connect Wallet to Trade
          </Button>
        ) : (
          <form onSubmit={showApprovalButton ? handleApprove : handleSubmit}>
            <Button
              type="submit"
              disabled={!canSubmit || submitting || !pair.isActive}
              className={`w-full font-bold py-3 transition-all ${
                isBuy
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
              }`}
            >
              {getButtonText()}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
