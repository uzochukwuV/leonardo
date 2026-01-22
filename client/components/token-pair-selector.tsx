'use client';

import { useState } from 'react';
import { getAllActiveTokenPairs, TokenPair } from '@/lib/token-pairs';
import { ChevronDown, Check } from 'lucide-react';

interface TokenPairSelectorProps {
  selectedPairId: number;
  onSelectPair: (pairId: number) => void;
}

export function TokenPairSelector({ selectedPairId, onSelectPair }: TokenPairSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activePairs = getAllActiveTokenPairs();
  const selectedPair = activePairs.find((p) => p.id === selectedPairId) || activePairs[0];

  const handleSelect = (pair: TokenPair) => {
    onSelectPair(pair.id);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Selected Pair Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-background border border-border hover:border-primary/50 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center -space-x-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-bold border-2 border-background">
              {selectedPair.baseToken.icon}
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-background"
              style={{ backgroundColor: selectedPair.quoteToken.color }}
            >
              {selectedPair.quoteToken.icon}
            </div>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-foreground">{selectedPair.name}</p>
            <p className="text-xs text-muted-foreground">
              {selectedPair.baseToken.name} / {selectedPair.quoteToken.name}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Options */}
          <div className="absolute top-full left-0 right-0 mt-2 rounded-lg border border-border bg-card shadow-xl overflow-hidden z-20">
            {activePairs.map((pair) => {
              const isSelected = pair.id === selectedPairId;
              return (
                <button
                  key={pair.id}
                  type="button"
                  onClick={() => handleSelect(pair)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-primary/10 transition-colors ${
                    isSelected ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center -space-x-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold border-2 border-card">
                        {pair.baseToken.icon}
                      </div>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-card"
                        style={{ backgroundColor: pair.quoteToken.color }}
                      >
                        {pair.quoteToken.icon}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">{pair.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Tick: ${(pair.tickSize / 10000).toFixed(4)}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
