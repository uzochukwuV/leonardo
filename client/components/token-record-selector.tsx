'use client';

import React, { useState } from 'react';
import { useOrderBookContext, type TokenRecord } from '@/contexts/order-book-context';
import { Button } from '@/components/ui/button';
import { RefreshCw, Coins, Check, AlertCircle, Loader2 } from 'lucide-react';

interface TokenRecordSelectorProps {
  selectedRecord: TokenRecord | null;
  onSelectRecord: (record: TokenRecord | null) => void;
  requiredTokenId?: string;
  minAmount?: bigint;
}

export function TokenRecordSelector({
  selectedRecord,
  onSelectRecord,
  requiredTokenId,
  minAmount = BigInt(0),
}: TokenRecordSelectorProps) {
  const { tokenRecords, loadingTokenRecords, refreshTokenRecords } = useOrderBookContext();
  const [expanded, setExpanded] = useState(false);

  // Filter records by token ID if specified
  const filteredRecords = requiredTokenId
    ? tokenRecords.filter(r => r.tokenId === requiredTokenId || r.tokenId.replace('field', '') === requiredTokenId.replace('field', ''))
    : tokenRecords;

  // Filter by minimum amount
  const eligibleRecords = filteredRecords.filter(r => {
    try {
      return BigInt(r.amount) >= minAmount;
    } catch {
      return false;
    }
  });

  const formatAmount = (amount: string): string => {
    try {
      const val = BigInt(amount);
      // Assume 6 decimals for display
      const whole = val / BigInt(1_000_000);
      const frac = val % BigInt(1_000_000);
      if (frac === BigInt(0)) {
        return whole.toString();
      }
      return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
    } catch {
      return amount;
    }
  };

  const formatTokenId = (tokenId: string): string => {
    const id = tokenId.replace('field', '');
    if (id.length > 12) {
      return `${id.slice(0, 6)}...${id.slice(-4)}`;
    }
    return id;
  };

  if (loadingTokenRecords) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading token records...</span>
        </div>
      </div>
    );
  }

  if (tokenRecords.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">No Token Records Found</p>
            <p className="text-xs text-muted-foreground mt-1">
              You need token records from token_registry.aleo to place orders with escrow.
              Make sure you have tokens in your wallet.
            </p>
            <Button
              onClick={refreshTokenRecords}
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh Records
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (eligibleRecords.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Insufficient Balance</p>
            <p className="text-xs text-muted-foreground mt-1">
              No token records with sufficient balance found.
              {minAmount > BigInt(0) && ` Required: ${formatAmount(minAmount.toString())} tokens.`}
            </p>
            <Button
              onClick={refreshTokenRecords}
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh Records
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" />
          Select Token Record for Escrow
        </label>
        <Button
          onClick={refreshTokenRecords}
          variant="ghost"
          size="sm"
          className="gap-1 h-7 text-xs"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>

      {selectedRecord ? (
        <div className="p-3 rounded-lg border-2 border-primary bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Selected</span>
            </div>
            <Button
              onClick={() => onSelectRecord(null)}
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
            >
              Change
            </Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Amount:</span>
              <span className="ml-1 font-mono font-bold text-accent">
                {formatAmount(selectedRecord.amount)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Token ID:</span>
              <span className="ml-1 font-mono text-foreground">
                {formatTokenId(selectedRecord.tokenId)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <Button
            onClick={() => setExpanded(!expanded)}
            variant="outline"
            className="w-full justify-between"
          >
            <span>Select a token record ({eligibleRecords.length} available)</span>
            <span className="text-muted-foreground">{expanded ? '▲' : '▼'}</span>
          </Button>

          {expanded && (
            <div className="space-y-2 max-h-48 overflow-y-auto p-1">
              {eligibleRecords.map((record) => (
                <button
                  key={record.id}
                  onClick={() => {
                    onSelectRecord(record);
                    setExpanded(false);
                  }}
                  className="w-full p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-foreground">
                      {formatAmount(record.amount)} tokens
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      ID: {formatTokenId(record.tokenId)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {record.owner.slice(0, 20)}...
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        The selected token record will be locked as escrow until your order is filled or cancelled.
      </p>
    </div>
  );
}
