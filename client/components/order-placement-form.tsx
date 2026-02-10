'use client';

import React, { useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletAdapterNetwork, Transaction } from '@demox-labs/aleo-wallet-adapter-base';
import { Button } from '@/components/ui/button';
import { TokenPairSelector } from '@/components/token-pair-selector';
import { TokenRecordSelector } from '@/components/token-record-selector';
import { useOrderBookContext, type TokenRecord } from '@/contexts/order-book-context';
import { getTokenPair, priceToBasisPoints, priceToTick, calculateEscrowAmount } from '@/lib/token-pairs';
import { config } from '@/lib/config';
import { monitorTransaction } from '@/lib/transaction-utils';
import { aleoService } from '@/lib/aleo-service';
import { Lock, AlertCircle, Shield, Loader2, ExternalLink } from 'lucide-react';

export function OrderPlacementForm() {
  const { publicKey, connected, requestTransaction } = useWallet();
  const { addPendingOrder, updateOrderStatus, selectedPairId, setSelectedPairId } = useOrderBookContext();

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('100');
  const [limitPrice, setLimitPrice] = useState(config.BASE_PRICE.toString());
  const [tickRangeWidth, setTickRangeWidth] = useState((config.MAX_TICK_RANGE * config.TICK_SIZE / 10000).toString());
  const [escrowMode, setEscrowMode] = useState(false);
  const [selectedTokenRecord, setSelectedTokenRecord] = useState<TokenRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);

  const selectedPair = getTokenPair(selectedPairId);

  if (!selectedPair) {
    return <div className="p-4 text-destructive">Invalid token pair</div>;
  }

  // Calculate tick bounds based on limit price and range
  const limit = parseFloat(limitPrice) || config.BASE_PRICE;
  const rangeWidth = parseFloat(tickRangeWidth) || (config.MAX_TICK_RANGE * config.TICK_SIZE / 10000);
  const tickLower = Math.max(selectedPair.minPrice / 10000, limit - rangeWidth / 2);
  const tickUpper = tickLower + rangeWidth;

  // Calculate escrow amount for display
  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(limitPrice) || 0;
  const quantityRaw = Math.floor(qty * Math.pow(10, selectedPair.baseToken.decimals));
  const limitPriceBps = priceToBasisPoints(price);
  const escrowAmount = calculateEscrowAmount(side === 'buy', quantityRaw, limitPriceBps);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setTxId(null);

    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    if (!requestTransaction) {
      setError('Wallet does not support transactions');
      return;
    }

    try {
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

      if (escrowMode && !selectedTokenRecord) {
        setError('Please select a token record for escrow');
        return;
      }

      setSubmitting(true);

      // Convert to contract format
      const tickLowerId = priceToTick(tickLower, selectedPair.tickSize);
      const tickUpperId = priceToTick(tickUpper, selectedPair.tickSize);
      const timestamp = Math.floor(Date.now() / 1000);
      const isBuy = side === 'buy';

      let inputs: string[];
      let functionName: string;

      if (escrowMode && selectedTokenRecord) {
        // Use submit_tick_order_with_escrow with token record
        functionName = 'submit_tick_order_with_escrow';
        inputs = [
          `${selectedPairId}u64`,
          `${isBuy}`,
          `${tickLowerId}u64`,
          `${tickUpperId}u64`,
          `${timestamp}u32`,
          `${limitPriceBps}u64`,
          `${quantityRaw}u64`,
          selectedTokenRecord.plaintext, // Pass the full record plaintext
        ];
      } else {
        // Use submit_tick_order (testing mode without escrow)
        functionName = 'submit_tick_order';
        inputs = [
          `${selectedPairId}u64`,
          `${isBuy}`,
          `${tickLowerId}u64`,
          `${tickUpperId}u64`,
          `${timestamp}u32`,
          `${limitPriceBps}u64`,
          `${quantityRaw}u64`,
        ];
      }

      console.log(`Submitting order via ${functionName}:`, {
        selectedPairId,
        isBuy,
        tickLowerId,
        tickUpperId,
        limitPriceBps,
        quantityRaw,
        escrowMode,
        inputs,
      });

      // Create and submit transaction
      const transaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.TestnetBeta,
        config.CONTRACT_PROGRAM_ID,
        functionName,
        inputs,
        config.DEFAULT_FEE
      );

      const transactionId = await requestTransaction(transaction);

      // Add to pending orders immediately for UI feedback
      addPendingOrder({
        txId: transactionId,
        side,
        tickLower: tickLowerId,
        tickUpper: tickUpperId,
        limitPrice: price,
        quantity: quantityRaw,
      });

      setSuccess(true);
      setTxId(transactionId);

      // Reset form
      setQuantity('100');
      setLimitPrice(config.BASE_PRICE.toString());
      setTickRangeWidth((config.MAX_TICK_RANGE * config.TICK_SIZE / 10000).toString());
      setSelectedTokenRecord(null);

      // Monitor transaction in background
      monitorTransaction(transactionId, (status) => {
        if (status.status === 'confirmed') {
          updateOrderStatus(transactionId, 'confirmed');
        } else if (status.status === 'rejected') {
          updateOrderStatus(transactionId, 'failed');
        }
      });

      // Clear success after 15 seconds
      setTimeout(() => {
        setSuccess(false);
        setTxId(null);
      }, 15000);
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

        {/* Escrow Mode Toggle */}
        <div className="p-4 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className={`w-5 h-5 ${escrowMode ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm font-semibold text-foreground">Escrow Mode</p>
                <p className="text-xs text-muted-foreground">
                  Lock tokens as collateral for your order
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEscrowMode(!escrowMode);
                if (escrowMode) {
                  setSelectedTokenRecord(null);
                }
              }}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                escrowMode ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  escrowMode ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {escrowMode && (
            <div className="mt-4 pt-4 border-t border-border">
              <TokenRecordSelector
                selectedRecord={selectedTokenRecord}
                onSelectRecord={setSelectedTokenRecord}
                minAmount={BigInt(escrowAmount)}
              />
            </div>
          )}
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
            Only you see this value. It&apos;s encrypted on-chain.
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
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>
              Estimated value:{' '}
              <span className="font-mono font-bold text-accent">
                ${(qty * price).toFixed(2)} {selectedPair.quoteToken.symbol}
              </span>
            </span>
            {escrowMode && (
              <span>
                Escrow required:{' '}
                <span className="font-mono font-bold text-primary">
                  {(escrowAmount / 1_000_000).toFixed(2)}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && txId && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
            <p className="text-sm text-primary font-semibold mb-2">
              Order submitted successfully!
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Your order has been added to the order book. Transaction is being processed.
            </p>
            <a
              href={aleoService.getExplorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <span className="font-mono">{txId.slice(0, 20)}...</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!connected || submitting || (escrowMode && !selectedTokenRecord)}
          className={`w-full py-3 font-semibold rounded-lg transition-all ${
            side === 'buy'
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
              : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
          }`}
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Placing Order...
            </span>
          ) : (
            <>
              {side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
              {escrowMode && ' (with Escrow)'}
              {' • '}
              ${(qty * price).toFixed(2)} {selectedPair.quoteToken.symbol}
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
