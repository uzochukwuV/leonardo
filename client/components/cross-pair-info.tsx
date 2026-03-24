'use client';

/**
 * CrossPairInfo Component
 *
 * Shows available cross-pair trading routes via the USDCx bridge.
 * Users can estimate what they'd receive by selling on one pair
 * and having the keeper automatically route through USDCx.
 *
 * Example: Sell ALEO on ALEO/USDCx → Receive TKNB from TKNB/USDCx
 */

import { useState, useMemo, useEffect, ChangeEvent } from 'react';
import { ArrowRight, RefreshCw, Info } from 'lucide-react';
import { useTradingPairs } from '@/hooks/use-trading-pairs';
import { usePairPrices } from '@/hooks/use-pair-prices';

const USDCX_TOKEN_ID = '7000field';
const SETTLER_FEE_BPS = 10n; // 0.10%
const PROTOCOL_FEE_BPS = 5n; // 0.05%

interface CrossPairInfoProps {
  className?: string;
}

export function CrossPairInfo({ className }: CrossPairInfoProps) {
  const { pairs, loading: loadingPairs } = useTradingPairs();
  const { getBestBid, getBestAsk, loading: loadingPrices } = usePairPrices();
  const [sellAmount, setSellAmount] = useState('1');
  const [selectedLeg1, setSelectedLeg1] = useState<number | null>(null);
  const [selectedLeg2, setSelectedLeg2] = useState<number | null>(null);

  // Filter to USDCx pairs only
  const usdcxPairs = useMemo(() => {
    return pairs.filter(p => p.quoteToken.tokenId === USDCX_TOKEN_ID);
  }, [pairs]);

  // Get prices for selected pairs
  const leg1Bid = selectedLeg1 ? getBestBid(selectedLeg1) : null;
  const leg2Ask = selectedLeg2 ? getBestAsk(selectedLeg2) : null;

  // Auto-select first two different pairs
  useEffect(() => {
    if (usdcxPairs.length >= 2 && selectedLeg1 === null) {
      setSelectedLeg1(usdcxPairs[0].id);
      setSelectedLeg2(usdcxPairs[1].id);
    }
  }, [usdcxPairs, selectedLeg1]);

  const leg1Pair = usdcxPairs.find(p => p.id === selectedLeg1);
  const leg2Pair = usdcxPairs.find(p => p.id === selectedLeg2);

  // Calculate estimated output
  const estimate = useMemo(() => {
    if (!leg1Pair || !leg2Pair || !sellAmount) return null;

    const amount = parseFloat(sellAmount);
    if (isNaN(amount) || amount <= 0) return null;

    // Use best bid for leg1 (selling), best ask for leg2 (buying)
    if (leg1Bid === null || leg2Ask === null) return null;

    const leg1PriceBn = BigInt(Math.floor(leg1Bid * 10000));
    const leg2PriceBn = BigInt(Math.floor(leg2Ask * 10000));

    if (leg1PriceBn <= 0n || leg2PriceBn <= 0n) {
      return null;
    }

    const leg1Price = leg1PriceBn;
    const leg2Price = leg2PriceBn;

    // Convert to microcredits (6 decimals)
    const sellAmountRaw = BigInt(Math.floor(amount * 1e6));

    // USDCx from leg1 = sellAmount * leg1Price / 10000
    const usdcxFromLeg1 = (sellAmountRaw * leg1Price) / 10000n;

    // Deduct fees
    const settlerFee = (usdcxFromLeg1 * SETTLER_FEE_BPS) / 10000n;
    const protocolFee = (usdcxFromLeg1 * PROTOCOL_FEE_BPS) / 10000n;
    const bridgeAmount = usdcxFromLeg1 - settlerFee - protocolFee;

    // Output from leg2 = bridgeAmount * 10000 / leg2Price
    const outputRaw = (bridgeAmount * 10000n) / leg2Price;

    // Convert back to human readable (assuming 6 decimals)
    const outputAmount = Number(outputRaw) / 1e6;
    const bridgeUsdcx = Number(bridgeAmount) / 1e6;
    const totalFees = Number(settlerFee + protocolFee) / 1e6;

    return {
      outputAmount: outputAmount.toFixed(6),
      bridgeUsdcx: bridgeUsdcx.toFixed(6),
      totalFees: totalFees.toFixed(6),
      leg1PriceUsd: leg1Bid.toFixed(4),
      leg2PriceUsd: leg2Ask.toFixed(4),
    };
  }, [leg1Pair, leg2Pair, sellAmount, leg1Bid, leg2Ask]);

  if (loadingPairs) {
    return (
      <div className={`rounded-lg border border-border bg-card/50 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading pairs...
        </div>
      </div>
    );
  }

  if (usdcxPairs.length < 2) {
    return (
      <div className={`rounded-lg border border-border bg-card/50 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Info className="w-4 h-4" />
          Cross-pair trading requires at least 2 USDCx pairs
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-card/50 p-4 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Cross-Pair Swap (via USDCx Bridge)
        </h3>
        <span className="text-xs text-muted-foreground">Automatic routing</span>
      </div>

      <div className="text-xs text-muted-foreground">
        Trade between any USDCx pairs atomically. The keeper automatically finds the best route.
      </div>

      {/* Pair Selection */}
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
        {/* Leg 1: Sell */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sell on</label>
          <select
            value={selectedLeg1 ?? ''}
            onChange={(e) => setSelectedLeg1(Number(e.target.value))}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
          >
            {usdcxPairs.map(p => (
              <option key={p.id} value={p.id} disabled={p.id === selectedLeg2}>
                {p.name} ({p.baseToken.symbol})
              </option>
            ))}
          </select>
        </div>

        <ArrowRight className="w-4 h-4 text-muted-foreground mt-5" />

        {/* Leg 2: Receive */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Receive from</label>
          <select
            value={selectedLeg2 ?? ''}
            onChange={(e) => setSelectedLeg2(Number(e.target.value))}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
          >
            {usdcxPairs.map(p => (
              <option key={p.id} value={p.id} disabled={p.id === selectedLeg1}>
                {p.name} ({p.baseToken.symbol})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Amount Input */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Amount to sell ({leg1Pair?.baseToken.symbol || 'Token'})
        </label>
        <input
          type="number"
          value={sellAmount}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSellAmount(e.target.value)}
          placeholder="Enter amount"
          min="0"
          step="0.01"
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Estimate Display */}
      {estimate && (
        <div className="bg-background/50 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You sell:</span>
            <span className="font-mono">{sellAmount} {leg1Pair?.baseToken.symbol}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>@ ${estimate.leg1PriceUsd}/unit</span>
            <span>→ {estimate.bridgeUsdcx} USDCx bridge</span>
          </div>
          <div className="border-t border-border my-2" />
          <div className="flex justify-between">
            <span className="text-muted-foreground">You receive:</span>
            <span className="font-mono text-primary">{estimate.outputAmount} {leg2Pair?.baseToken.symbol}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>@ ${estimate.leg2PriceUsd}/unit</span>
            <span>Fees: {estimate.totalFees} USDCx</span>
          </div>
        </div>
      )}

      {!estimate && sellAmount && (
        <div className="bg-background/50 rounded-lg p-3 text-sm text-muted-foreground text-center">
          No price data available. Place orders on both pairs to enable cross-pair trading.
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>How it works:</strong></p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Place a sell order on the first pair (e.g., ALEO/USDCx)</li>
          <li>Keeper finds matching buy orders and routes through USDCx</li>
          <li>You receive tokens from the second pair atomically</li>
        </ol>
      </div>
    </div>
  );
}
