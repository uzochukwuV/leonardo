/**
 * Aleo Blockchain Service
 * Handles querying the Aleo blockchain for order book data
 */

import { config } from './config';

const ALEO_TESTNET_API = 'https://api.explorer.aleo.org/v1/testnet';

export interface OnChainTickInfo {
  tickId: number;
  tokenPairId: number;
  buyOrderCount: number;
  sellOrderCount: number;
  lastUpdateHeight: number;
}

export interface OnChainOrder {
  orderId: string;
  owner: string;
  tokenPairId: number;
  isBuy: boolean;
  tickLower: number;
  tickUpper: number;
  quantity: number; // This will be encrypted/hashed on-chain
  status: 'active' | 'filled' | 'cancelled';
  createdAt: number;
}

export interface Settlement {
  settlementId: string;
  buyOrderId: string;
  sellOrderId: string;
  executionPrice: number; // In basis points
  timestamp: number;
  blockHeight: number;
}

/**
 * Aleo Service for querying blockchain data
 */
export class AleoService {
  private baseUrl: string;
  private programId: string;

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.baseUrl = network === 'testnet'
      ? ALEO_TESTNET_API
      : 'https://api.explorer.aleo.org/v1/mainnet';
    this.programId = config.CONTRACT_PROGRAM_ID;
  }

  /**
   * Get program mappings
   * This fetches the on-chain state stored in program mappings
   */
  async getMapping(mappingName: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/program/${this.programId}/mapping/${mappingName}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch mapping ${mappingName}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching mapping ${mappingName}:`, error);
      return null;
    }
  }

  /**
   * Get tick registry data for a specific token pair
   * Fetches the tick_registry mapping which contains tick-level order counts
   */
  async getTickRegistry(tokenPairId: number): Promise<Map<number, OnChainTickInfo>> {
    try {
      const tickRegistry = await this.getMapping('tick_registry');

      if (!tickRegistry) {
        return new Map();
      }

      const ticks = new Map<number, OnChainTickInfo>();

      // Parse the mapping entries
      // The key format is: {token_pair_id}_{tick_id}
      // The value contains: buy_count, sell_count, last_update_height
      for (const [key, value] of Object.entries(tickRegistry)) {
        const [pairId, tickId] = key.split('_').map(Number);

        if (pairId === tokenPairId) {
          ticks.set(tickId, {
            tickId,
            tokenPairId: pairId,
            buyOrderCount: (value as any).buy_order_count || 0,
            sellOrderCount: (value as any).sell_order_count || 0,
            lastUpdateHeight: (value as any).last_update_height || 0,
          });
        }
      }

      return ticks;
    } catch (error) {
      console.error('Error fetching tick registry:', error);
      return new Map();
    }
  }

  /**
   * Get recent settlements for a token pair
   * This queries the settlements mapping to get trade history
   */
  async getRecentSettlements(tokenPairId: number, limit: number = 20): Promise<Settlement[]> {
    try {
      const settlements = await this.getMapping('settlements');

      if (!settlements) {
        return [];
      }

      const settlementList: Settlement[] = [];

      for (const [key, value] of Object.entries(settlements)) {
        const settlement = value as any;

        if (settlement.token_pair_id === tokenPairId) {
          settlementList.push({
            settlementId: key,
            buyOrderId: settlement.buy_order_id,
            sellOrderId: settlement.sell_order_id,
            executionPrice: settlement.execution_price,
            timestamp: settlement.timestamp || Date.now(),
            blockHeight: settlement.block_height || 0,
          });
        }
      }

      // Sort by timestamp descending and limit
      return settlementList
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      console.error('Error fetching settlements:', error);
      return [];
    }
  }

  /**
   * Get program transitions (for tracking order submissions)
   * This queries recent transactions to the program
   */
  async getProgramTransitions(limit: number = 50): Promise<any[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/program/${this.programId}/transitions?limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch transitions: ${response.statusText}`);
      }

      const data = await response.json();
      return data.transitions || [];
    } catch (error) {
      console.error('Error fetching program transitions:', error);
      return [];
    }
  }

  /**
   * Get order by ID
   * Fetches a specific order from the orders mapping
   */
  async getOrder(orderId: string): Promise<OnChainOrder | null> {
    try {
      const orders = await this.getMapping('orders');

      if (!orders || !orders[orderId]) {
        return null;
      }

      const order = orders[orderId];

      return {
        orderId,
        owner: order.owner,
        tokenPairId: order.token_pair_id,
        isBuy: order.is_buy,
        tickLower: order.tick_lower,
        tickUpper: order.tick_upper,
        quantity: order.quantity, // Note: This may be hashed/encrypted
        status: order.status,
        createdAt: order.created_at || Date.now(),
      };
    } catch (error) {
      console.error(`Error fetching order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Get user's orders
   * Fetches all orders belonging to a specific address
   */
  async getUserOrders(userAddress: string): Promise<OnChainOrder[]> {
    try {
      const orders = await this.getMapping('orders');

      if (!orders) {
        return [];
      }

      const userOrders: OnChainOrder[] = [];

      for (const [orderId, order] of Object.entries(orders)) {
        const orderData = order as any;

        if (orderData.owner === userAddress) {
          userOrders.push({
            orderId,
            owner: orderData.owner,
            tokenPairId: orderData.token_pair_id,
            isBuy: orderData.is_buy,
            tickLower: orderData.tick_lower,
            tickUpper: orderData.tick_upper,
            quantity: orderData.quantity,
            status: orderData.status,
            createdAt: orderData.created_at || Date.now(),
          });
        }
      }

      return userOrders.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Error fetching user orders:', error);
      return [];
    }
  }

  /**
   * Get transaction status
   * Check if a transaction has been confirmed
   */
  async getTransactionStatus(transactionId: string): Promise<'pending' | 'confirmed' | 'failed'> {
    try {
      const response = await fetch(
        `${this.baseUrl}/transaction/${transactionId}`
      );

      if (!response.ok) {
        return 'pending';
      }

      const data = await response.json();

      if (data.status === 'accepted') {
        return 'confirmed';
      } else if (data.status === 'rejected') {
        return 'failed';
      }

      return 'pending';
    } catch (error) {
      console.error(`Error fetching transaction status for ${transactionId}:`, error);
      return 'pending';
    }
  }

  /**
   * Get latest block height
   */
  async getLatestBlockHeight(): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/latest/height`);

      if (!response.ok) {
        throw new Error('Failed to fetch latest block height');
      }

      const data = await response.json();
      return data.height || 0;
    } catch (error) {
      console.error('Error fetching latest block height:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const aleoService = new AleoService('testnet');
