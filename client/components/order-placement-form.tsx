'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Button } from '@/components/ui/button';
import {
  getAllActiveTokenPairs,
  getTokenPair,
  calculateEscrowAmount,
  priceToBasisPoints,
} from '@/lib/token-pairs';
import { config } from '@/lib/config';
import { Lock, AlertCircle, CheckCircle2, Loader2, Wallet, ChevronDown } from 'lucide-react';
import { useSubmitOrder } from '@/hooks/use-submit-order';

interface OrderPlacementFormProps {
  selectedPairId: number;
  onPairChange: (id: number) => void;
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
  selectedPairId,
  onPairChange,
  prefillPrice,
  onPrefillConsumed,
}: OrderPlacementFormProps) {
  const { address } = useWallet();
  const { setVisible } = useWalletModal();
  const connected = !!address;

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [limitPrice, setLimitPrice] = useState(config.BASE_PRICE.toString());
  const [quantity, setQuantity] = useState('');
  const [rangeWidth, setRangeWidth] = useState('0.50');
  const [expiresAt, setExpiresAt] = useState(0);
  const [showPairs, setShowPairs] = useState(false);

  const { submitOrder, step, stepLabel, txId, error, reset } = useSubmitOrder();
  const submitting = step !== 'idle' && step !== 'done';
  const success = step === 'done';

  const pair = getTokenPair(selectedPairId);
  const activePairs = getAllActiveTokenPairs();

  // Consume prefill price from order book click
  useEffect(() => {
    if (prefillPrice !== undefined && prefillPrice > 0) {
      setLimitPrice(prefillPrice.toFixed(4));
      onPrefillConsumed?.();
    }
  }, [prefillPrice, onPrefillConsumed]);

  if (!pair) return null;

  const isBuy = side === 'buy';
  const escrowToken = isBuy ? pair.quoteToken : pair.baseToken;
  const price = parseFloat(limitPrice) || 0;
  const qty = parseFloat(quantity) || 0;
  const rw = parseFloat(rangeWidth) || 0.5;

  const tickLowerUsd = Math.max(pair.minPrice / 10000, price - rw / 2);
  const tickUpperUsd = tickLowerUsd + rw;

  // Live escrow calculation
  const quantityRaw = BigInt(Math.floor(qty * Math.pow(10, pair.baseToken.decimals)));
  const priceBps = BigInt(priceToBasisPoints(price));
  const escrowRaw =
    price > 0 && qty > 0 ? calculateEscrowAmount(isBuy, quantityRaw, priceBps) : 0n;
  const escrowDisplay = (Number(escrowRaw) / Math.pow(10, escrowToken.decimals)).toFixed(4);
  const valueUsd = (qty * price).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    if (!price || price <= 0 || !qty || qty <= 0) return;

    const result = await submitOrder({
      pairId: selectedPairId,
      isBuy,
      tickLowerUsd,
      tickUpperUsd,
      limitPriceUsd: price,
      quantity: qty,
      expiresAt,
    });

    if (result) {
      setQuantity('');
      setTimeout(reset, 12_000);
    }
  };

  // Step indicator items
  const stepItems = [
    { id: 'approving', label: `Approve ${escrowToken.symbol}` },
    { id: 'submitting', label: 'Submit order' },
    { id: 'polling', label: 'Confirming' },
  ];

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Place Order</h2>
      </div>

      {/* Step indicator — visible during submission */}
      {submitting && (
        <div className="px-4 py-2 bg-primary/5 border-b border-border">
          <div className="flex items-center gap-1 flex-wrap">
            {stepItems.map((s, i) => {
              const isDone =
                (s.id === 'approving' && (step === 'submitting' || step === 'polling')) ||
                (s.id === 'submitting' && step === 'polling');
              const isActive = s.id === step;
              return (
                <React.Fragment key={s.id}>
                  <div
                    className={`flex items-center gap-1 text-xs font-medium ${
                      isDone
                        ? 'text-primary'
                        : isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                    ) : isActive ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-muted-foreground/40 inline-block" />
                    )}
                    {s.label}
                  </div>
                  {i < stepItems.length - 1 && (
                    <span className="text-muted-foreground/40 text-xs">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
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
              <span>{pair.baseToken.icon}</span>
              {pair.name}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                showPairs ? 'rotate-180' : ''
              }`}
            />
          </button>
          {showPairs && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
              {activePairs.map((p) => (
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
                  <span>{p.baseToken.icon}</span>
                  {p.name}
                  <span className="ml-auto text-xs text-muted-foreground">
                    tick {(p.tickSize / 10000).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
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
                className={`py-2.5 rounded-lg font-bold text-sm capitalize transition-all ${
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

        {/* Limit Price — private */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            <span className="flex items-center gap-1">
              Limit Price ({pair.quoteToken.symbol}/{pair.baseToken.symbol})
              <Lock className="w-3 h-3" />
              <span className="font-normal normal-case text-muted-foreground/50">(encrypted)</span>
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.0001"
              min={pair.minPrice / 10000}
              max={pair.maxPrice / 10000}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              disabled={!connected || submitting}
              placeholder={config.BASE_PRICE.toString()}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
            />
          </div>
          {price > 0 && (
            <p className="text-xs text-muted-foreground/50 mt-1">
              Public range: {tickLowerUsd.toFixed(2)} – {tickUpperUsd.toFixed(2)} {pair.quoteToken.symbol}
            </p>
          )}
        </div>

        {/* Quantity — private */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            <span className="flex items-center gap-1">
              Quantity ({pair.baseToken.symbol})
              <Lock className="w-3 h-3" />
              <span className="font-normal normal-case text-muted-foreground/50">(encrypted)</span>
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
        </div>

        {/* Range Width — public */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
            Price Range Width{' '}
            <span className="font-normal normal-case text-muted-foreground/50">(public)</span>
          </label>
          <p className="text-xs text-muted-foreground/50 mb-2">
            Wider = more privacy. Others see your order in ±{(rw / 2).toFixed(2)} {pair.quoteToken.symbol} of your price.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.01"
              max={((pair.maxTickRange * pair.tickSize) / 10000).toString()}
              step="0.01"
              value={rangeWidth}
              onChange={(e) => setRangeWidth(e.target.value)}
              className="flex-1 accent-primary"
            />
            <span className="text-xs font-mono font-bold text-primary w-20 text-right">
              ±{(rw / 2).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Expiry */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            Expiry
          </label>
          <div className="grid grid-cols-4 gap-1">
            {EXPIRY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setExpiresAt(opt.value)}
                className={`py-1.5 text-xs rounded-lg border transition-colors ${
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
              <span className="text-muted-foreground">Public range</span>
              <span className="font-mono text-right text-muted-foreground">
                {tickLowerUsd.toFixed(2)}–{tickUpperUsd.toFixed(2)} {pair.quoteToken.symbol}
              </span>
            </div>
          </div>
        )}

        {/* 2-step notice */}
        {connected && !submitting && !success && (
          <p className="text-xs text-muted-foreground/60 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Requires 2 wallet confirmations: approve escrow, then submit order.
          </p>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex gap-2 items-start">
            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-primary font-semibold">Order placed on-chain!</p>
              {txId && (
                <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{txId}</p>
              )}
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
          <form onSubmit={handleSubmit}>
            <Button
              type="submit"
              disabled={submitting || !qty || !price}
              className={`w-full font-bold py-3 transition-all ${
                isBuy
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
              }`}
            >
              {submitting ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {stepLabel[step]}
                </span>
              ) : (
                `${isBuy ? 'Buy' : 'Sell'} ${pair.baseToken.symbol}`
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
