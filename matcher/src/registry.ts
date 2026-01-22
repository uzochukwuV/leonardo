/**
 * Tick Registry Monitor
 * Fetches and monitors on-chain tick registry for active orders
 */

import axios from 'axios';
import { config } from './config';
import logger from './logger';
import { TickInfo, TickRegistry, TickOrder, OrderBook } from './types';

export class RegistryMonitor {
  private tickRegistry: TickRegistry = {};
  private orderBook: OrderBook = {
    buyOrders: new Map(),
    sellOrders: new Map()
  };
  private lastScanTime: number = 0;

  constructor() {}

  /**
   * Fetch active ticks from on-chain registry
   */
  async fetchTickRegistry(): Promise<TickRegistry> {
    try {
      logger.info('Fetching tick registry from chain...');

      // Query the on-chain tick_registry mapping
      const response = await axios.get(
        `${config.apiUrl}/program/${config.contractProgramId}/mapping/tick_registry`
      );

      const registry: TickRegistry = {};

      if (response.data && Array.isArray(response.data)) {
        for (const entry of response.data) {
          const tickId = entry.key;
          const tickInfo: TickInfo = {
            tick_id: BigInt(tickId),
            token_pair: BigInt(entry.value.token_pair),
            total_buy_quantity: BigInt(entry.value.total_buy_quantity),
            total_sell_quantity: BigInt(entry.value.total_sell_quantity),
            num_orders: parseInt(entry.value.num_orders),
            last_update: parseInt(entry.value.last_update)
          };
          registry[tickId] = tickInfo;
        }
      }

      logger.info(`Fetched ${Object.keys(registry).length} active ticks`);
      this.tickRegistry = registry;
      return registry;

    } catch (error) {
      logger.error('Error fetching tick registry:', error);
      throw error;
    }
  }

  /**
   * Fetch orders for specific tick ranges
   * Note: In production, you'd need to maintain an off-chain database
   * of orders since Leo records are private
   */
  async fetchOrdersForTick(tickId: bigint): Promise<TickOrder[]> {
    // In a real implementation, you would:
    // 1. Maintain an off-chain order database
    // 2. Have users submit order details to your API
    // 3. Or use event emissions (if available in future Leo versions)

    // For now, return empty array - this would be populated from your DB
    logger.debug(`Fetching orders for tick ${tickId}`);
    return [];
  }

  /**
   * Find ticks with overlapping buy and sell orders
   */
  findOverlappingTicks(): bigint[] {
    const overlapping: bigint[] = [];

    for (const [tickId, tickInfo] of Object.entries(this.tickRegistry)) {
      if (tickInfo.total_buy_quantity > 0n && tickInfo.total_sell_quantity > 0n) {
        overlapping.push(BigInt(tickId));
      }
    }

    logger.info(`Found ${overlapping.length} ticks with overlapping orders`);
    return overlapping;
  }

  /**
   * Get tick info for specific tick ID
   */
  getTickInfo(tickId: bigint): TickInfo | undefined {
    return this.tickRegistry[tickId.toString()];
  }

  /**
   * Get all active ticks in a range
   */
  getTicksInRange(tickLower: bigint, tickUpper: bigint): TickInfo[] {
    const ticks: TickInfo[] = [];

    for (const [tickId, tickInfo] of Object.entries(this.tickRegistry)) {
      const id = BigInt(tickId);
      if (id >= tickLower && id <= tickUpper) {
        ticks.push(tickInfo);
      }
    }

    return ticks;
  }

  /**
   * Check if a tick has sufficient liquidity for matching
   */
  hasLiquidity(tickId: bigint, minQuantity: bigint = 0n): boolean {
    const tickInfo = this.getTickInfo(tickId);
    if (!tickInfo) return false;

    return tickInfo.total_buy_quantity >= minQuantity &&
           tickInfo.total_sell_quantity >= minQuantity;
  }

  /**
   * Get total liquidity at a tick
   */
  getTotalLiquidity(tickId: bigint): { buy: bigint; sell: bigint } {
    const tickInfo = this.getTickInfo(tickId);
    return {
      buy: tickInfo?.total_buy_quantity || 0n,
      sell: tickInfo?.total_sell_quantity || 0n
    };
  }

  /**
   * Update order book from user submissions
   * In production, this would be called when users submit orders to your API
   */
  addOrder(order: TickOrder): void {
    const orderId = order.nonce; // Use nonce as unique ID

    if (order.is_buy) {
      this.orderBook.buyOrders.set(orderId, order);
      logger.debug(`Added buy order ${orderId} to order book`);
    } else {
      this.orderBook.sellOrders.set(orderId, order);
      logger.debug(`Added sell order ${orderId} to order book`);
    }
  }

  /**
   * Remove order from order book (after fill or cancel)
   */
  removeOrder(orderId: string, isBuy: boolean): void {
    if (isBuy) {
      this.orderBook.buyOrders.delete(orderId);
    } else {
      this.orderBook.sellOrders.delete(orderId);
    }
    logger.debug(`Removed ${isBuy ? 'buy' : 'sell'} order ${orderId}`);
  }

  /**
   * Get all buy orders in tick range
   */
  getBuyOrdersInRange(tickLower: bigint, tickUpper: bigint): TickOrder[] {
    const orders: TickOrder[] = [];

    for (const order of this.orderBook.buyOrders.values()) {
      // Check if order's tick range overlaps with target range
      if (order.tick_lower <= tickUpper && order.tick_upper >= tickLower) {
        // Order is not fully filled
        if (order.filled < order.quantity) {
          orders.push(order);
        }
      }
    }

    return orders;
  }

  /**
   * Get all sell orders in tick range
   */
  getSellOrdersInRange(tickLower: bigint, tickUpper: bigint): TickOrder[] {
    const orders: TickOrder[] = [];

    for (const order of this.orderBook.sellOrders.values()) {
      // Check if order's tick range overlaps with target range
      if (order.tick_lower <= tickUpper && order.tick_upper >= tickLower) {
        // Order is not fully filled
        if (order.filled < order.quantity) {
          orders.push(order);
        }
      }
    }

    return orders;
  }

  /**
   * Get order book statistics
   */
  getStats(): { totalBuyOrders: number; totalSellOrders: number; activeTicks: number } {
    return {
      totalBuyOrders: this.orderBook.buyOrders.size,
      totalSellOrders: this.orderBook.sellOrders.size,
      activeTicks: Object.keys(this.tickRegistry).length
    };
  }

  /**
   * Clear stale data
   */
  clear(): void {
    this.tickRegistry = {};
    this.orderBook.buyOrders.clear();
    this.orderBook.sellOrders.clear();
    logger.info('Cleared registry and order book');
  }
}
