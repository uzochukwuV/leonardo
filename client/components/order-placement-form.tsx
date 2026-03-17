'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { getTokenPairInfo } from '@/lib/aleo-service';
import { Lock, AlertCircle, CheckCircle2, Loader2, Wallet, ChevronDown, Wifi, WifiOff, Info } from 'lucide-react';
import { useSubmitOrder } from '@/hooks/use-submit-order';
import { useTokenBalances } from '@/hooks/use-token-balances';

interface OrderPlacementFormProps {
  selectedPairId: number;
  onPairChange: (id: number) => void;
  prefillPrice?: number;
  onPrefillConsumed?: () => void;
}

interface OnChainPairInfo {
  quote_token_id: string;
  tick_size: number;
  is_active: boolean;
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
  const [expiresAt, setExpiresAt] = useState(0);
  const [showPairs, setShowPairs] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalCompleted, setApprovalCompleted] = useState(false);

  // On-chain pair info
  const [onChainPair, setOnChainPair] = useState<OnChainPairInfo | null>(null);
  const [loadingPairInfo, setLoadingPairInfo] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

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

  const { balances, loading: loadingBalances, refresh: refreshBalances } = useTokenBalances();

  const submitting = step !== 'idle' && step !== 'done';
  const success = step === 'done';

  const pair = getTokenPair(selectedPairId);

  // Fetch on-chain pair info when pair changes
  useEffect(() => {
    let mounted = true;

    async function fetchPairInfo() {
      setLoadingPairInfo(true);
      setPairError(null);
      setOnChainPair(null);

      try {
        const info = await getTokenPairInfo(selectedPairId);
        if (!mounted) return;

        if (info) {
          setOnChainPair(info);
          if (!info.is_active) {
            setPairError('This trading pair is not active on-chain');
          }
        } else {
          setPairError('Pair not found on-chain. It may not be registered yet.');
        }
      } catch (err) {
        if (mounted) {
          setPairError('Failed to fetch pair info from chain');
        }
      } finally {
        if (mounted) {
          setLoadingPairInfo(false);
        }
      }
    }

    fetchPairInfo();
    return () => { mounted = false; };
  }, [selectedPairId]);

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

  // Check for approval requirement (skip if approval just completed)
  useEffect(() => {
    // If approval was just completed, don't reset needsApproval
    if (approvalCompleted) {
      setNeedsApproval(false);
      return;
    }

    if (!connected || !pair || !isBuy || loadingBalances || !address) {
      setNeedsApproval(false);
      return;
    }

    const quoteToken = balances.find(b => b.token.tokenId === pair.quoteToken.tokenId);
    const quantityRaw = BigInt(Math.floor(qty * Math.pow(10, pair.baseToken.decimals)));
    const priceBps = BigInt(priceToBasisPoints(price));
    const requiredEscrow = calculateEscrowAmount(isBuy, quantityRaw, priceBps);

    if (requiredEscrow > 0n) {
      const allowance = quoteToken?.allowances?.[config.CONTRACT_PROGRAM_ID] || 0n;
      setNeedsApproval(allowance < requiredEscrow);
    } else {
      setNeedsApproval(false);
    }
  }, [isBuy, qty, price, connected, pair, balances, loadingBalances, address, approvalCompleted]);

  // Reset approval state when side or pair changes
  const resetFormState = useCallback(() => {
    reset();
    setQuantity('');
    setApprovalCompleted(false);
  }, [reset]);

  useEffect(() => {
    resetFormState();
  }, [side, selectedPairId, resetFormState]);


  if (!pair) return null;

  const activePairs = getAllActiveTokenPairs();
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
    if (loadingOrchestrator || loadingBalances) {
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
              <span>{pair.baseToken.icon}</span>
              {pair.name}
              {loadingPairInfo && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
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
                    ID: {p.id}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* On-chain pair info */}
        {onChainPair && !pairError && (
          <div className="rounded-lg bg-muted/20 border border-border p-2.5 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Info className="w-3 h-3" />
              <span>On-chain Info</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 text-xs">
              <span className="text-muted-foreground">Quote Token:</span>
              <span className="font-mono">{onChainPair.quote_token_id}</span>
              <span className="text-muted-foreground">Tick Size:</span>
              <span className="font-mono">{onChainPair.tick_size} bps</span>
              <span className="text-muted-foreground">Status:</span>
              <span className={onChainPair.is_active ? 'text-primary' : 'text-destructive'}>
                {onChainPair.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        )}

        {pairError && (
          <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-xs text-destructive">{pairError}</p>
          </div>
        )}

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
              min={pair.minPrice / 10000}
              max={pair.maxPrice / 10000}
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
              disabled={!canSubmit || submitting || (isBuy && loadingBalances) || (pairError && !onChainPair)}
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
