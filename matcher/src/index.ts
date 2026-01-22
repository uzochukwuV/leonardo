/**
 * Main Matcher Service Entry Point
 * Continuously scans for matches and executes settlements
 */

import { config } from './config';
import logger from './logger';
import { RegistryMonitor } from './registry';
import { MatchingEngine } from './matcher';
import { SettlementExecutor } from './executor';

class MatcherService {
  private registry: RegistryMonitor;
  private matcher: MatchingEngine;
  private executor: SettlementExecutor;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.registry = new RegistryMonitor();
    this.matcher = new MatchingEngine(this.registry);
    this.executor = new SettlementExecutor();
  }

  /**
   * Start the matcher service
   */
  async start(): Promise<void> {
    logger.info('Starting Matcher Service...', {
      network: config.network,
      contract: config.contractProgramId,
      scanInterval: config.scanInterval,
      minProfit: config.minProfitBasisPoints
    });

    this.isRunning = true;

    // Initial scan
    await this.scanAndMatch();

    // Set up periodic scanning
    this.scanInterval = setInterval(
      () => this.scanAndMatch(),
      config.scanInterval
    );

    logger.info('Matcher Service started successfully');
  }

  /**
   * Stop the matcher service
   */
  async stop(): Promise<void> {
    logger.info('Stopping Matcher Service...');

    this.isRunning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    // Wait for pending settlements
    const pending = this.executor.getPendingSettlements();
    if (pending.length > 0) {
      logger.info(`Waiting for ${pending.length} pending settlements...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    logger.info('Matcher Service stopped');
  }

  /**
   * Main matching loop
   */
  private async scanAndMatch(): Promise<void> {
    if (!this.isRunning) return;

    try {
      logger.debug('Starting scan cycle...');

      // Step 1: Fetch latest tick registry
      await this.registry.fetchTickRegistry();

      // Step 2: Find potential matches
      const matches = await this.matcher.findMatches();

      if (matches.length === 0) {
        logger.debug('No matches found in this cycle');
        this.printStats();
        return;
      }

      logger.info(`Found ${matches.length} potential matches`);

      // Step 3: Execute matches (limited by max concurrent)
      const toExecute = matches.slice(0, config.maxConcurrentMatches);

      const results = await Promise.allSettled(
        toExecute.map(match => this.executeMatch(match))
      );

      // Count successes
      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.length - successful;

      logger.info(`Execution complete: ${successful} succeeded, ${failed} failed`);

      this.printStats();

    } catch (error) {
      logger.error('Error in scan cycle:', error);
    }
  }

  /**
   * Execute a single match
   */
  private async executeMatch(match: any): Promise<boolean> {
    try {
      // Validate match is still valid
      const isValid = await this.matcher.validateMatch(match);
      if (!isValid) {
        logger.info('Match no longer valid, skipping');
        return false;
      }

      // Execute settlement
      const success = await this.executor.executeSettlement(match);

      if (success) {
        logger.info('Match executed successfully', {
          buyer: match.buyOrder.owner.substring(0, 15) + '...',
          seller: match.sellOrder.owner.substring(0, 15) + '...',
          quantity: match.expectedQuantity.toString(),
          price: match.expectedPrice.toString()
        });
      }

      return success;

    } catch (error) {
      logger.error('Error executing match:', error);
      return false;
    }
  }

  /**
   * Print service statistics
   */
  private printStats(): void {
    const registryStats = this.registry.getStats();
    const matcherStats = this.matcher.getStats();
    const executorStats = this.executor.getStats();

    logger.info('=== Matcher Service Statistics ===', {
      registry: {
        activeTicks: registryStats.activeTicks,
        buyOrders: registryStats.totalBuyOrders,
        sellOrders: registryStats.totalSellOrders
      },
      matcher: {
        tickSize: matcherStats.tickSize.toString(),
        matcherFeeBps: matcherStats.matcherFeeBps.toString(),
        minProfitBps: matcherStats.minProfitBps
      },
      executor: {
        totalSettlements: executorStats.totalSettlements,
        pendingSettlements: executorStats.pendingCount,
        totalVolume: executorStats.totalVolume.toString(),
        totalFeesEarned: executorStats.totalFees.toString()
      }
    });
  }

  /**
   * Health check endpoint
   */
  getHealth(): { status: string; uptime: number; stats: any } {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      uptime: process.uptime(),
      stats: {
        registry: this.registry.getStats(),
        matcher: this.matcher.getStats(),
        executor: this.executor.getStats()
      }
    };
  }
}

// Main execution
async function main() {
  const service = new MatcherService();

  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await service.stop();
    process.exit(0);
  });

  // Uncaught error handlers
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start the service
  try {
    await service.start();
  } catch (error) {
    logger.error('Failed to start matcher service:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { MatcherService };
