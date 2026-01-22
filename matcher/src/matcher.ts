/**
 * Matching Engine
 * Finds profitable matches between buy and sell orders
 */

import { config } from './config';
import logger from './logger';
import { TickOrder, MatchCandidate } from './types';
import { RegistryMonitor } from './registry';

export class MatchingEngine {
  private registry: RegistryMonitor;

  // Matching constants
  private readonly TICK_SIZE = 100n; // 100 basis points per tick
  private readonly BASIS_POINTS_PER_DOLLAR = 10000n;
  private readonly MATCHER_FEE_BPS = 5n; // 0.05% = 5 basis points

  constructor(registry: RegistryMonitor) {
    this.registry = registry;
  }

  /**
   * Find all possible matches in the order book
   */
  async findMatches(): Promise<MatchCandidate[]> {
    const matches: MatchCandidate[] = [];

    // Get all overlapping ticks
    const overlappingTicks = this.registry.findOverlappingTicks();

    logger.info(`Scanning ${overlappingTicks.length} overlapping ticks for matches`);

    for (const tickId of overlappingTicks) {
      const tickMatches = await this.findMatchesAtTick(tickId);
      matches.push(...tickMatches);
    }

    // Sort by profitability (highest first)
    matches.sort((a, b) => b.profitability - a.profitability);

    logger.info(`Found ${matches.length} potential matches`);
    return matches;
  }

  /**
   * Find matches at a specific tick
   */
  private async findMatchesAtTick(tickId: bigint): Promise<MatchCandidate[]> {
    const matches: MatchCandidate[] = [];

    // Get tick price range
    const tickLower = tickId;
    const tickUpper = tickId;

    // Get buy and sell orders that overlap this tick
    const buyOrders = this.registry.getBuyOrdersInRange(tickLower, tickUpper);
    const sellOrders = this.registry.getSellOrdersInRange(tickLower, tickUpper);

    logger.debug(`Tick ${tickId}: ${buyOrders.length} buy orders, ${sellOrders.length} sell orders`);

    // Find all valid pairs
    for (const buyOrder of buyOrders) {
      for (const sellOrder of sellOrders) {
        const match = this.evaluateMatch(buyOrder, sellOrder);
        if (match) {
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Evaluate if two orders can be matched
   */
  private evaluateMatch(buyOrder: TickOrder, sellOrder: TickOrder): MatchCandidate | null {
    // Basic validation
    if (buyOrder.token_pair !== sellOrder.token_pair) {
      return null; // Different trading pairs
    }

    if (buyOrder.owner === sellOrder.owner) {
      return null; // Same owner (self-trading)
    }

    // Find overlapping tick range
    const overlapLower = buyOrder.tick_lower > sellOrder.tick_lower
      ? buyOrder.tick_lower
      : sellOrder.tick_lower;
    const overlapUpper = buyOrder.tick_upper < sellOrder.tick_upper
      ? buyOrder.tick_upper
      : sellOrder.tick_upper;

    if (overlapLower > overlapUpper) {
      return null; // No overlap
    }

    // Check if prices cross (buy price >= sell price)
    if (buyOrder.limit_price < sellOrder.limit_price) {
      return null; // Prices don't cross
    }

    // Calculate overlap ticks
    const overlapTicks: bigint[] = [];
    for (let tick = overlapLower; tick <= overlapUpper; tick++) {
      overlapTicks.push(tick);
    }

    // Calculate execution quantity (limited by smaller order)
    const buyRemaining = buyOrder.quantity - buyOrder.filled;
    const sellRemaining = sellOrder.quantity - sellOrder.filled;
    const executionQuantity = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;

    if (executionQuantity === 0n) {
      return null; // Nothing to execute
    }

    // Calculate execution price (midpoint of buy and sell limit prices)
    const executionPrice = (buyOrder.limit_price + sellOrder.limit_price) / 2n;

    // Verify execution price is within overlap range
    const minAllowedPrice = overlapLower * this.TICK_SIZE;
    const maxAllowedPrice = overlapUpper * this.TICK_SIZE;

    if (executionPrice < minAllowedPrice || executionPrice > maxAllowedPrice) {
      logger.warn(`Price ${executionPrice} outside range [${minAllowedPrice}, ${maxAllowedPrice}]`);
      return null;
    }

    // Calculate matcher fee
    const totalValue = (executionQuantity * executionPrice) / this.BASIS_POINTS_PER_DOLLAR;
    const matcherFee = (totalValue * this.MATCHER_FEE_BPS) / this.BASIS_POINTS_PER_DOLLAR;

    // Calculate profitability score
    const priceSpread = buyOrder.limit_price - sellOrder.limit_price;
    const profitability = Number(priceSpread) + Number(matcherFee);

    // Check minimum profitability
    if (profitability < config.minProfitBasisPoints) {
      return null;
    }

    return {
      buyOrder,
      sellOrder,
      overlapTicks,
      expectedQuantity: executionQuantity,
      expectedPrice: executionPrice,
      profitability
    };
  }

  /**
   * Validate that a match is still valid before execution
   */
  async validateMatch(match: MatchCandidate): Promise<boolean> {
    // Re-check that orders haven't been filled or cancelled
    const buyStillValid = this.isOrderValid(match.buyOrder);
    const sellStillValid = this.isOrderValid(match.sellOrder);

    if (!buyStillValid || !sellStillValid) {
      logger.info('Match no longer valid - orders changed');
      return false;
    }

    // Verify tick liquidity still exists
    for (const tick of match.overlapTicks) {
      if (!this.registry.hasLiquidity(tick, 1n)) {
        logger.info(`Match no longer valid - tick ${tick} has no liquidity`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check if an order is still valid for matching
   */
  private isOrderValid(order: TickOrder): boolean {
    // Order must not be fully filled
    if (order.filled >= order.quantity) {
      return false;
    }

    // Tick range must be valid
    const tickRange = order.tick_upper - order.tick_lower;
    if (tickRange > BigInt(config.maxTickRange)) {
      return false;
    }

    // Price must be within tick range
    const minPrice = order.tick_lower * this.TICK_SIZE;
    const maxPrice = order.tick_upper * this.TICK_SIZE;
    if (order.limit_price < minPrice || order.limit_price > maxPrice) {
      return false;
    }

    return true;
  }

  /**
   * Calculate settlement details for a match
   */
  calculateSettlement(match: MatchCandidate): {
    baseAmount: bigint;
    quoteAmount: bigint;
    matcherFee: bigint;
  } {
    const baseAmount = match.expectedQuantity;
    const quoteAmount = (match.expectedQuantity * match.expectedPrice) / this.BASIS_POINTS_PER_DOLLAR;
    const matcherFee = (quoteAmount * this.MATCHER_FEE_BPS) / this.BASIS_POINTS_PER_DOLLAR;

    return {
      baseAmount,
      quoteAmount,
      matcherFee
    };
  }

  /**
   * Get statistics about matching performance
   */
  getStats(): {
    tickSize: bigint;
    matcherFeeBps: bigint;
    minProfitBps: number;
  } {
    return {
      tickSize: this.TICK_SIZE,
      matcherFeeBps: this.MATCHER_FEE_BPS,
      minProfitBps: config.minProfitBasisPoints
    };
  }
}
