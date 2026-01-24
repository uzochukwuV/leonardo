'use client';

import React, { useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletAdapterNetwork, Transaction } from '@demox-labs/aleo-wallet-adapter-base';
import { Button } from '@/components/ui/button';
import { TokenPairSelector } from '@/components/token-pair-selector';
import { getTokenPair, priceToBasisPoints, priceToTick, calculateEscrowAmount } from '@/lib/token-pairs';
import { config } from '@/lib/config';
import { Lock, AlertCircle } from 'lucide-react';

export function OrderPlacementForm() {
  const { publicKey, connected, requestTransaction, wallet } = useWallet();

  const [selectedPairId, setSelectedPairId] = useState<number>(config.DEFAULT_TOKEN_PAIR);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('100');
  const [limitPrice, setLimitPrice] = useState(config.BASE_PRICE.toString());
  const [tickRangeWidth, setTickRangeWidth] = useState((config.MAX_TICK_RANGE * config.TICK_SIZE / 10000).toString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);

  const selectedPair = getTokenPair(selectedPairId);

  if (!selectedPair) {
    return <div>Invalid token pair</div>;
  }

  // Calculate tick bounds based on limit price and range
  const limit = parseFloat(limitPrice) || config.BASE_PRICE;
  const rangeWidth = parseFloat(tickRangeWidth) || (config.MAX_TICK_RANGE * config.TICK_SIZE / 10000);
  const tickLower = Math.max(selectedPair.minPrice / 10000, limit - rangeWidth / 2);
  const tickUpper = tickLower + rangeWidth;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setTxId(null);

    if (!connected || !publicKey) {
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

      // Convert to contract format
      const tokenPairId = selectedPairId;
      const isBuy = side === 'buy';
      const tickLowerId = priceToTick(tickLower, selectedPair.tickSize);
      const tickUpperId = priceToTick(tickUpper, selectedPair.tickSize);
      const limitPriceBps = priceToBasisPoints(price);
      const quantityRaw = Math.floor(qty * Math.pow(10, selectedPair.baseToken.decimals));
      const escrowAmount = calculateEscrowAmount(isBuy, quantityRaw, limitPriceBps);

      // Get current timestamp (in seconds, convert to u32)
      const timestamp = Math.floor(Date.now() / 1000);

      // Create transaction inputs
      const inputs = [
        `${tokenPairId}u64`,           // token_pair_id
        `${isBuy}`,                     // is_buy
        `${tickLowerId}u64`,            // tick_lower
        `${tickUpperId}u64`,            // tick_upper
        `${timestamp}u32`,              // timestamp
        `${limitPriceBps}u64`,          // limit_price
        `${quantityRaw}u64`,            // quantity
      ];

      console.log('Submitting order:', {
        tokenPairId,
        isBuy,
        tickLowerId,
        tickUpperId,
        limitPriceBps,
        quantityRaw,
        inputs,
      });

      // Create and submit transaction
      const transaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.TestnetBeta,
        config.CONTRACT_PROGRAM_ID,
        'submit_tick_order',
        inputs,
        config.DEFAULT_FEE
      );

      if (!requestTransaction) {
        throw new Error('Wallet does not support transaction requests');
      }

      const transactionId = await requestTransaction(transaction);

      setSuccess(true);
      setTxId(transactionId);
      setQuantity('');
      setLimitPrice(config.BASE_PRICE.toString());
      setTickRangeWidth((config.MAX_TICK_RANGE * config.TICK_SIZE / 10000).toString());

      setTimeout(() => {
        setSuccess(false);
        setTxId(null);
      }, 10000);
    } catch (err) {
      console.error('Order submission error:', err);
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
        {/* Token Pair Selection */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3">
            Token Pair
          </label>
          <TokenPairSelector
            selectedPairId={selectedPairId}
            onSelectPair={setSelectedPairId}
          />
        </div>

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
              max={(config.MAX_TICK_RANGE * config.TICK_SIZE / 10000).toString()}
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
            min={(selectedPair.minPrice / 10000).toString()}
            max={(selectedPair.maxPrice / 10000).toString()}
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            disabled={!connected}
            placeholder={config.BASE_PRICE.toString()}
            className="w-full px-4 py-2 rounded-lg bg-input border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <p className="text-xs text-muted-foreground mt-2">
            ${Math.abs(parseFloat(limitPrice) - config.BASE_PRICE).toFixed(4)} from market
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
              ${(parseFloat(quantity || '0') * parseFloat(limitPrice || '0')).toFixed(2)} {selectedPair.quoteToken.symbol}
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
            {txId && (
              <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                TX: {txId}
              </p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!connected || submitting}
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
              {(parseFloat(quantity || '0') * parseFloat(limitPrice || '0')).toFixed(2)}{' '}
              {selectedPair.quoteToken.symbol}
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
