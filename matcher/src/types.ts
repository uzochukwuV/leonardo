/**
 * Type definitions for the matcher service
 */

export interface TickOrder {
  owner: string;
  token_pair: bigint;
  tick_lower: bigint;
  tick_upper: bigint;
  is_buy: boolean;
  quantity: bigint;
  limit_price: bigint;
  token_id: string;
  escrowed_amount: bigint;
  filled: bigint;
  timestamp: number;
  nonce: string;
}

export interface TickInfo {
  tick_id: bigint;
  token_pair: bigint;
  total_buy_quantity: bigint;
  total_sell_quantity: bigint;
  num_orders: number;
  last_update: number;
}

export interface MatchCandidate {
  buyOrder: TickOrder;
  sellOrder: TickOrder;
  overlapTicks: bigint[];
  expectedQuantity: bigint;
  expectedPrice: bigint;
  profitability: number;
}

export interface Settlement {
  buyer: string;
  seller: string;
  token_pair: bigint;
  quantity: bigint;
  price: bigint;
  timestamp: number;
  matcher_fee: bigint;
}

export interface Config {
  network: string;
  apiUrl: string;
  matcherPrivateKey: string;
  matcherAddress: string;
  contractProgramId: string;
  scanInterval: number;
  minProfitBasisPoints: number;
  maxTickRange: number;
  logLevel: string;
  logFile: string;
  maxConcurrentMatches: number;
  batchSize: number;
}

export interface TickRegistry {
  [tickId: string]: TickInfo;
}

export interface OrderBook {
  buyOrders: Map<string, TickOrder>;
  sellOrders: Map<string, TickOrder>;
}
