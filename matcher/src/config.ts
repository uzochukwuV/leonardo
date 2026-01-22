/**
 * Configuration loader for the matcher service
 */

import dotenv from 'dotenv';
import { Config } from './types';

dotenv.config();

export function loadConfig(): Config {
  const config: Config = {
    network: process.env.ALEO_NETWORK || 'testnet3',
    apiUrl: process.env.ALEO_API_URL || 'https://api.explorer.aleo.org/v1',
    matcherPrivateKey: process.env.MATCHER_PRIVATE_KEY || '',
    matcherAddress: process.env.MATCHER_ADDRESS || '',
    contractProgramId: process.env.CONTRACT_PROGRAM_ID || 'sl.aleo',
    scanInterval: parseInt(process.env.SCAN_INTERVAL_MS || '5000', 10),
    minProfitBasisPoints: parseInt(process.env.MIN_PROFIT_BASIS_POINTS || '10', 10),
    maxTickRange: parseInt(process.env.MAX_TICK_RANGE || '50', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || './logs/matcher.log',
    maxConcurrentMatches: parseInt(process.env.MAX_CONCURRENT_MATCHES || '5', 10),
    batchSize: parseInt(process.env.BATCH_SIZE || '100', 10),
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: Config): void {
  const errors: string[] = [];

  if (!config.matcherPrivateKey) {
    errors.push('MATCHER_PRIVATE_KEY is required');
  }

  if (!config.matcherAddress) {
    errors.push('MATCHER_ADDRESS is required');
  }

  if (config.scanInterval < 1000) {
    errors.push('SCAN_INTERVAL_MS must be at least 1000ms');
  }

  if (config.minProfitBasisPoints < 0) {
    errors.push('MIN_PROFIT_BASIS_POINTS must be non-negative');
  }

  if (config.maxTickRange < 1 || config.maxTickRange > 100) {
    errors.push('MAX_TICK_RANGE must be between 1 and 100');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

export const config = loadConfig();
