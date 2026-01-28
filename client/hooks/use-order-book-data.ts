/**
 * Re-export from use-order-book for backward compatibility.
 * All order book data logic is now in use-order-book.ts.
 */
export { useOrderBook as useOrderBookData } from './use-order-book';
export type { TickDisplayInfo, RecentTrade, MarketStats } from './use-order-book';
