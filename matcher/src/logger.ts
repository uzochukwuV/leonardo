/**
 * Logging configuration using Winston
 */

import winston from 'winston';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Ensure log directory exists
const logDir = path.dirname(config.logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'orderbook-matcher' },
  transports: [
    // Write all logs to file
    new winston.transports.File({ filename: config.logFile }),
    // Write errors to separate file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    })
  ]
});

// Also log to console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

export default logger;
