'use client';

import React, { useState } from 'react';
import { useUserRecords, ReceiptRecord, SettlementProofRecord, CancellationProofRecord } from '@/hooks/useUserRecords';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { getTokenPair } from '@/lib/token-pairs';

type Tab = 'active' | 'history' | 'cancelled';

const RecordCard = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-card border border-border rounded-lg p-4 text-sm">{children}</div>
);

const RecordRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-center">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono font-semibold text-foreground text-right">{value}</span>
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="text-center py-12 text-muted-foreground">
    <p>{message}</p>
  </div>
);

export function UserRecords() {
  const { receipts, settlements, cancellations, loading, error, refresh } = useUserRecords();
  const [activeTab, setActiveTab] = useState<Tab>('active');

  const renderReceipt = (record: ReceiptRecord) => {
    const pair = getTokenPair(parseInt(record.pair_id));
    if (!pair) return null;
    const price = (parseInt(record.price) / 10000).toFixed(4);
    const quantity = (parseInt(record.quantity) / 1e6).toFixed(6);
    return (
      <RecordCard key={record.order_id}>
        <div className="space-y-2">
          <div className="flex justify-between items-start">
            <span className={`font-bold ${record.is_buy ? 'text-primary' : 'text-destructive'}`}>
              {record.is_buy ? 'BUY' : 'SELL'} {pair.baseToken.symbol}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(parseInt(record.created_at) * 1000).toLocaleString()}
            </span>
          </div>
          <RecordRow label="Pair" value={pair.name} />
          <RecordRow label="Price" value={`${price} ${pair.quoteToken.symbol}`} />
          <RecordRow label="Quantity" value={`${quantity} ${pair.baseToken.symbol}`} />
          <RecordRow label="Order ID" value={<span className="truncate block">{record.order_id.substring(0, 20)}...</span>} />
        </div>
      </RecordCard>
    );
  };

  const renderSettlement = (record: SettlementProofRecord) => {
    const receivedTokenSymbol = record.received_token === '0field' ? 'ALEO' : 'USDC'; // Placeholder
    const amount = (parseInt(record.received_amount) / (receivedTokenSymbol === 'ALEO' ? 1e6 : 1e6)).toFixed(4); // Assuming 6 decimals
    return (
      <RecordCard key={record.order_id}>
        <div className="space-y-2">
          <div className="flex justify-between items-start">
             <span className="font-bold text-primary">Trade Executed</span>
             <span className="text-xs text-muted-foreground">
              {new Date(parseInt(record.settled_at) * 1000).toLocaleString()}
            </span>
          </div>
          <RecordRow label="Received" value={`${amount} ${receivedTokenSymbol}`} />
          <RecordRow label="Fill Price" value={(parseInt(record.fill_price) / 10000).toFixed(4)} />
          <RecordRow label="Fill Quantity" value={(parseInt(record.fill_quantity) / 1e6).toFixed(6)} />
          <RecordRow label="Order ID" value={<span className="truncate block">{record.order_id.substring(0, 20)}...</span>} />
        </div>
      </RecordCard>
    );
  };

    const renderCancellation = (record: CancellationProofRecord) => {
    const returnedTokenSymbol = record.is_buy ? 'USDC' : 'ALEO'; // Placeholder
    const amount = (parseInt(record.returned_amount) / 1e6).toFixed(4); // Assuming 6 decimals
    return (
      <RecordCard key={record.order_id}>
         <div className="space-y-2">
           <div className="flex justify-between items-start">
              <span className="font-bold text-muted-foreground">Order Cancelled</span>
              <span className="text-xs text-muted-foreground">
                {new Date(parseInt(record.cancelled_at) * 1000).toLocaleString()}
              </span>
            </div>
            <RecordRow label="Tokens Returned" value={`${amount} ${returnedTokenSymbol}`} />
            <RecordRow label="Order ID" value={<span className="truncate block">{record.order_id.substring(0, 20)}...</span>} />
         </div>
      </RecordCard>
    );
  };


  const renderContent = () => {
    if (loading && receipts.length === 0 && settlements.length === 0 && cancellations.length === 0) {
      return (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 text-destructive">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>Error fetching records:</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'active':
        return receipts.length > 0 ? (
          <div className="space-y-3">{receipts.map(renderReceipt)}</div>
        ) : (
          <EmptyState message="No active orders found." />
        );
      case 'history':
        return settlements.length > 0 ? (
          <div className="space-y-3">{settlements.map(renderSettlement)}</div>
        ) : (
          <EmptyState message="No trade history found." />
        );
      case 'cancelled':
        return cancellations.length > 0 ? (
            <div className="space-y-3">{cancellations.map(renderCancellation)}</div>
        ) : (
            <EmptyState message="No cancelled orders found." />
        );
      default:
        return null;
    }
  };

  const TabButton = ({ tab, label }: { tab: Tab; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
        activeTab === tab
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
            <TabButton tab="active" label="Active Orders" />
            <TabButton tab="history" label="Trade History" />
            <TabButton tab="cancelled" label="Cancellations" />
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div>{renderContent()}</div>
    </div>
  );
}
