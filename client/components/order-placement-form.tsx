'use client';

import React from "react"

import { useState } from 'react';
import { useAleo } from '@/hooks/use-aleo';
import { useOrderBook } from '@/hooks/use-order-book';
import { Button } from '@/components/ui/button';
import { Lock, AlertCircle } from 'lucide-react';

const TICK_SIZE = 0.01;
const BASE_PRICE = 15.0;
const MAX_TICK_RANGE = 0.5;

export function OrderPlacementForm() {
  const { account, connected, loading, executeTransaction } = useAleo();
  const { updateTickOrderCount } = useOrderBook();

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('100');
  const [limitPrice, setLimitPrice] = useState(BASE_PRICE.toString());
  const [tickRangeWidth, setTickRangeWidth] = useState(
    MAX_TICK_RANGE.toString()
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Calculate tick bounds based on limit price and range
  const limit = parseFloat(limitPrice) || BASE_PRICE;
  const rangeWidth = parseFloat(tickRangeWidth) || MAX_TICK_RANGE;
  const tickLower = Math.max(
    BASE_PRICE - rangeWidth / 2,
    limit - rangeWidth / 2
  );
  const tickUpper = tickLower + rangeWidth;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!connected) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      const qty = parseFloat(quantity);
      const price = parseFloat(limitPrice);

      if (!qty || qty <= 0) {
        setError('Please enter a valid quantity');
        return;
      }

      if (!price || price <= 0) {
        setError('Please enter a valid limit price');
        return;
      }

      if (price < tickLower || price > tickUpper) {
        setError('Limit price must be within the tick range');
        return;
      }

      setSubmitting(true);

      // Execute smart contract transition
      await executeTransaction('submit_tick_order', {
        token_pair: 'ALEO_USDC',
        is_buy: side === 'buy',
        tick_lower: Math.floor(tickLower / TICK_SIZE),
        tick_upper: Math.ceil(tickUpper / TICK_SIZE),
        limit_price: price,
        quantity: qty,
      });

      // Update order book
      updateTickOrderCount(Math.floor(limit / TICK_SIZE));

      setSuccess(true);
      setQuantity('');
      setLimitPrice(BASE_PRICE.toString());
      setTickRangeWidth(MAX_TICK_RANGE.toString());

      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <h2 className="text-base sm:text-lg font-bold text-foreground mb-6">
        Place Order
      </h2>

      {!connected && (
        <div className="mb-6 p-4 rounded-lg bg-accent/10 border border-accent/30 flex gap-3">
          <AlertCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Connect your wallet to place orders
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Side Selection */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3">
            Order Side
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                side === 'buy'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                side === 'sell'
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Public Tick Range */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Public Tick Range
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Other traders see this range (exact prices encrypted)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Min</p>
              <input
                type="text"
                value={`$${tickLower.toFixed(2)}`}
                disabled
                className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm font-mono text-muted-foreground"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Max</p>
              <input
                type="text"
                value={`$${tickUpper.toFixed(2)}`}
                disabled
                className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm font-mono text-muted-foreground"
              />
            </div>
          </div>
        </div>

        {/* Range Width */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Tick Range Width (Public)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.01"
              max={MAX_TICK_RANGE}
              step="0.01"
              value={tickRangeWidth}
              onChange={(e) => setTickRangeWidth(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm font-mono font-bold text-accent min-w-fit">
              ${parseFloat(tickRangeWidth).toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Wider ranges provide more privacy
          </p>
        </div>

        {/* Private Limit Price */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            <span className="flex items-center gap-2">
              Exact Limit Price (Private)
              <Lock className="w-4 h-4 text-primary" />
            </span>
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Only you see this value. It's encrypted on-chain.
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1000"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            disabled={!connected}
            placeholder="15.00"
            className="w-full px-4 py-2 rounded-lg bg-input border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <p className="text-xs text-muted-foreground mt-2">
            ${Math.abs(parseFloat(limitPrice) - BASE_PRICE).toFixed(4)} from
            market
          </p>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            <span className="flex items-center gap-2">
              Quantity (Private)
              <Lock className="w-4 h-4 text-primary" />
            </span>
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Only visible after settlement.
          </p>
          <input
            type="number"
            step="1"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={!connected}
            placeholder="100"
            className="w-full px-4 py-2 rounded-lg bg-input border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Estimated value:{' '}
            <span className="font-mono font-bold text-accent">
              ${(parseFloat(quantity) * parseFloat(limitPrice)).toFixed(2)}
            </span>
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
            <p className="text-sm text-primary font-semibold">
              Order placed successfully! Waiting for settlement.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!connected || submitting || loading}
          className={`w-full py-3 font-semibold rounded-lg transition-all ${
            side === 'buy'
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
              : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
          }`}
        >
          {submitting ? (
            'Placing Order...'
          ) : (
            <>
              {side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'} •{' '}
              {(parseFloat(quantity) * parseFloat(limitPrice)).toFixed(2)}{' '}
              USDC
            </>
          )}
        </Button>
      </form>

      {/* Privacy Explainer */}
      <div className="mt-6 p-4 rounded-lg bg-muted/30 border border-border space-y-2">
        <p className="text-xs font-semibold text-foreground flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          How Privacy Works
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
          <li>Your exact price and quantity are encrypted with zero-knowledge</li>
          <li>Others only see that an order exists in the tick range</li>
          <li>Matching happens privately on the Aleo network</li>
          <li>Settlement details visible only to counterparties</li>
        </ul>
      </div>
    </div>
  );
}
