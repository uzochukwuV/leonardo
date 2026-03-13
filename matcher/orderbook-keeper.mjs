#!/usr/bin/env node

/**
 * Private Orderbook Keeper Bot v1
 * ================================
 *
 * Architecture (v17):
 *   - Users submit orders directly to chain (submit_buy_order, submit_sell_order)
 *   - Order records created on-chain, owned by KEEPER
 *   - Users receive Receipt records as proof
 *   - Users request cancellation via request_cancel() using Receipt
 *   - Keeper scans for Order records and CancellationRequest records
 *   - Keeper matches crossing orders and executes settle_match (returns updated Orders)
 *   - Keeper processes cancellations and creates CancellationProof records
 *
 * Bot Functions:
 *   1. Scans chain for Order records owned by keeper (enhanced with RSS)
 *   2. Scans chain for CancellationRequest records (owned by keeper)
 *   3. Maintains in-memory orderbook (buy/sell queues)
 *   4. Matches crossing orders using advanced algorithms (buy.price >= sell.price)
 *   5. Executes settle_match to complete trades (handles partial fills)
 *   6. Processes cancellation requests and executes cancel functions
 *
 * API endpoints:
 *   GET /api/orders           - All known orders (buy/sell)
 *   GET /api/orderbook        - Formatted order book (bids/asks)
 *   GET /api/trades           - Recent trades
 *   GET /health               - Bot status (includes RSS status)
 *   POST /api/match           - Manually trigger matching
 *   GET /api/rss/status       - Record Scanner Service status
 *   POST /api/rss/find-matches - Find best matches via RSS
 *
 * Environment variables:
 *   PRIVATE_KEY            - Orchestrator/keeper private key
 *   VIEW_KEY               - View key for Record Scanner Service
 *   USE_RECORD_SCANNER     - Enable RSS (true/false)
 *   RSS_API_KEY            - RSS API key
 *   RSS_CONSUMER_ID        - RSS consumer ID
 *   API_PORT               - HTTP port (default: 3002)
 *   FRONTEND_ORIGIN        - CORS origin (default: *)\n */

import 'dotenv/config';
import { execSync } from 'child_process';
import https from 'https';
import http from 'http';
import {
  scanOrderRecords,
  scanCancellationRequestRecords,
  getLatestBlockHeight,
  getMapping,
} from './chain-scanner.mjs';
import { RecordScannerService } from './record-scanner.mjs';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const SNARKOS = process.env.SNARKOS_PATH || 'snarkos';

const CONFIG = {
  // Keys
  privateKey: process.env.PRIVATE_KEY || '',
  viewKey: process.env.VIEW_KEY || '',

  // Program
  programId: process.env.ORDERBOOK_PROGRAM || 'private_orderbook_v17.aleo',
  network: process.env.NETWORK || 'testnet',
  networkId: process.env.NETWORK_ID || '1',

  // Endpoints
  queryEndpoint: process.env.QUERY_ENDPOINT || 'https://api.explorer.provable.com/v1',
  broadcastEndpoint: process.env.BROADCAST_ENDPOINT || 'https://api.explorer.provable.com/v1/testnet/transaction/broadcast',

  // Record Scanner Service
  rssApiKey: process.env.RSS_API_KEY || '',
  rssConsumerId: process.env.RSS_CONSUMER_ID || '',
  useRecordScanner: process.env.USE_RECORD_SCANNER === 'true',
  scannerStartBlock: parseInt(process.env.SCANNER_START_BLOCK || '0'),

  // Intervals
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL || '30000'),
  matchIntervalMs: parseInt(process.env.MATCH_INTERVAL || '10000'),

  // HTTP API
  apiPort: parseInt(process.env.API_PORT || '3002'),
  frontendOrigin: process.env.FRONTEND_ORIGIN || '*',

  // Orchestrator/Treasury (will be fetched from chain)
  orchestratorAddr: process.env.ORCHESTRATOR_ADDR || '',
  treasuryAddr: process.env.TREASURY_ADDR || '',
};

// ═══════════════════════════════════════════════════════════════
// STATE: In-memory order store
// ═══════════════════════════════════════════════════════════════

// Orders indexed by order_id
const orderStore = new Map();
// Separate buy/sell queues for matching
const buyOrders = [];   // sorted by price DESC (best bid first)
const sellOrders = [];  // sorted by price ASC (best ask first)
// Recent trades
const recentTrades = [];
const MAX_TRADES = 100;
// Cancellation requests indexed by order_id
const cancellationRequests = new Map();

let lastScanAt = null;
let lastMatchAt = null;
let botStartedAt = new Date().toISOString();
let botPaused = false;
let isProcessing = false;

// Record Scanner Service instance
let recordScanner = null;
const RecordScanner = RecordScannerService;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function log(tag, msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function logError(tag, msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.error(`[${ts}] [${tag}] ❌ ${msg}`);
}



// Note: getMapping is now imported from chain-scanner.mjs

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ═══════════════════════════════════════════════════════════════
// ORDER PARSING
// ═══════════════════════════════════════════════════════════════

function parseOrderFromPlaintext(plaintext) {
  try {
    // Parse Order record fields from decrypted plaintext (v17 format)
    const ownerMatch = plaintext.match(/owner:\s*(aleo1[a-z0-9]+)/);
    const traderMatch = plaintext.match(/trader:\s*(aleo1[a-z0-9]+)/);
    const orderIdMatch = plaintext.match(/order_id:\s*(\d+field)/);
    const pairIdMatch = plaintext.match(/pair_id:\s*(\d+)u64/);
    const isBuyMatch = plaintext.match(/is_buy:\s*(true|false)/);
    const priceMatch = plaintext.match(/price:\s*(\d+)u64/);
    const quantityMatch = plaintext.match(/quantity:\s*(\d+)u128/);
    const quoteTokenIdMatch = plaintext.match(/quote_token_id:\s*(\d+field)/);
    const escrowAmountMatch = plaintext.match(/escrow_amount:\s*(\d+)u128/);
    const filledMatch = plaintext.match(/filled:\s*(\d+)u128/);
    const createdAtMatch = plaintext.match(/created_at:\s*(\d+)u32/);
    const expiresAtMatch = plaintext.match(/expires_at:\s*(\d+)u32/);

    if (!orderIdMatch || !priceMatch || !quantityMatch) {
      return null;
    }

    return {
      owner: ownerMatch?.[1] || '',
      trader: traderMatch?.[1] || '',
      orderId: orderIdMatch[1],
      pairId: pairIdMatch ? BigInt(pairIdMatch[1]) : 1n,
      isBuy: isBuyMatch?.[1] === 'true',
      price: BigInt(priceMatch[1]),
      quantity: BigInt(quantityMatch[1]),
      quoteTokenId: quoteTokenIdMatch?.[1] || '0field',
      escrowAmount: BigInt(escrowAmountMatch?.[1] || '0'),
      filled: BigInt(filledMatch?.[1] || '0'),
      createdAt: parseInt(createdAtMatch?.[1] || '0'),
      expiresAt: parseInt(expiresAtMatch?.[1] || '0'),
      scannedAt: new Date().toISOString(),
      rawPlaintext: plaintext,
    };
  } catch (err) {
    logError('PARSE', `Failed to parse order: ${err.message}`);
    return null;
  }
}

function parseCancellationRequestFromPlaintext(plaintext) {
  try {
    const ownerMatch = plaintext.match(/owner:\s*(aleo1[a-z0-9]+)/);
    const orderIdMatch = plaintext.match(/order_id:\s*(\d+field)/);
    const traderMatch = plaintext.match(/trader:\s*(aleo1[a-z0-9]+)/);
    const isBuyMatch = plaintext.match(/is_buy:\s*(true|false)/);
    const createdAtMatch = plaintext.match(/created_at:\s*(\d+)u32/);

    if (!orderIdMatch) return null;

    return {
      owner: ownerMatch?.[1] || '',
      orderId: orderIdMatch[1],
      trader: traderMatch?.[1] || '',
      isBuy: isBuyMatch?.[1] === 'true',
      createdAt: parseInt(createdAtMatch?.[1] || '0'),
    };
  } catch (err) {
    logError('PARSE', `Failed to parse cancellation request: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SCANNER (Enhanced with Record Scanner Service)
// ═══════════════════════════════════════════════════════════════

async function scanOrders() {
  // Use Record Scanner Service if available and configured
  if (CONFIG.useRecordScanner && recordScanner) {
    log('SCAN', 'Fetching Order records via Record Scanner Service...');
    try {
      const records = await recordScanner.scanOrderRecords(CONFIG.programId);
      log('SCAN', `Found ${records.length} Order record(s) via RSS`);

      const orders = [];
      for (const record of records) {
        // If plaintext is available, parse it
        if (record.plaintext) {
          const order = parseOrderFromPlaintext(record.plaintext);
          console.log('Parsed order from RSS plaintext:', order);
          if (order) {
            order.recordCiphertext = record.recordCiphertext;
            order.commitment = record.commitment;
            order.blockHeight = record.blockHeight;
            order.transactionId = record.transactionId;
            orders.push(order);
          }
        }
      }

      log('SCAN', `Parsed ${orders.length} valid order(s) via RSS`);
      return orders;
    } catch (err) {
      logError('SCAN', `RSS scan failed: ${err.message}`);
      log('SCAN', 'Falling back to chain scanner...');
      // Fall through to legacy scanning
    }
  }

  // Legacy chain scanning fallback
  log('SCAN', 'Fetching Order records from chain...');
  try {
    const records = await scanOrderRecords(CONFIG.programId, 200);
    log('SCAN', `Found ${records.length} Order record(s)`);

    const orders = [];
    for (const record of records) {
      // If plaintext is available, parse it
      if (record.plaintext) {
        const order = parseOrderFromPlaintext(record.plaintext);
        console.log('Parsed order from chain plaintext:', order);
        if (order) {
          order.recordCiphertext = record.recordCiphertext;
          order.commitment = record.commitment;
          order.blockHeight = record.blockHeight;
          order.transactionId = record.transactionId;
          orders.push(order);
        }
      }
    }

    log('SCAN', `Parsed ${orders.length} valid order(s)`);
    return orders;
  } catch (err) {
    logError('SCAN', `Scan failed: ${err.message}`);
    return [];
  }
}

async function scanCancellationRequests() {
  // Use Record Scanner Service if available and configured
  if (CONFIG.useRecordScanner && recordScanner) {
    log('SCAN', 'Checking for cancellation requests via RSS...');
    try {
      const records = await recordScanner.scanCancellationRequestRecords(CONFIG.programId);
      log('SCAN', `Found ${records.length} CancellationRequest record(s) via RSS`);

      const requests = [];
      for (const record of records) {
        // If plaintext is available, parse it
        if (record.plaintext) {
          const req = parseCancellationRequestFromPlaintext(record.plaintext);
          if (req) {
            req.recordCiphertext = record.recordCiphertext;
            req.commitment = record.commitment;
            req.blockHeight = record.blockHeight;
            req.transactionId = record.transactionId;
            requests.push(req);
          }
        }
      }

      log('SCAN', `Parsed ${requests.length} valid cancellation request(s) via RSS`);
      return requests;
    } catch (err) {
      logError('SCAN', `RSS cancellation scan failed: ${err.message}`);
      log('SCAN', 'Falling back to chain scanner...');
      // Fall through to legacy scanning
    }
  }

  // Legacy chain scanning fallback
  log('SCAN', 'Checking for cancellation requests...');
  try {
    const records = await scanCancellationRequestRecords(CONFIG.programId, 200);
    log('SCAN', `Found ${records.length} CancellationRequest record(s)`);

    const requests = [];
    for (const record of records) {
      // If plaintext is available, parse it
      if (record.plaintext) {
        const req = parseCancellationRequestFromPlaintext(record.plaintext);
        if (req) {
          req.recordCiphertext = record.recordCiphertext;
          req.commitment = record.commitment;
          req.blockHeight = record.blockHeight;
          req.transactionId = record.transactionId;
          requests.push(req);
        }
      }
    }

    log('SCAN', `Parsed ${requests.length} valid cancellation request(s)`);
    return requests;
  } catch (err) {
    logError('SCAN', `Cancellation scan failed: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// ORDER BOOK MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function updateOrderBook(orders) {
  // Clear current queues
  buyOrders.length = 0;
  sellOrders.length = 0;

  // Update store and queues
  for (const order of orders) {
    orderStore.set(order.orderId, order);

    const remaining = order.quantity - order.filled;
    if (remaining <= 0n) continue;

    if (order.isBuy) {
      buyOrders.push(order);
    } else {
      sellOrders.push(order);
    }
  }

  // Sort buy orders by price DESC (best bid first)
  buyOrders.sort((a, b) => Number(b.price - a.price));

  // Sort sell orders by price ASC (best ask first)
  sellOrders.sort((a, b) => Number(a.price - b.price));

  log('BOOK', `Order book: ${buyOrders.length} bids, ${sellOrders.length} asks`);

  if (buyOrders.length > 0) {
    log('BOOK', `  Best bid: ${buyOrders[0].price} (qty: ${buyOrders[0].quantity - buyOrders[0].filled})`);
  }
  if (sellOrders.length > 0) {
    log('BOOK', `  Best ask: ${sellOrders[0].price} (qty: ${sellOrders[0].quantity - sellOrders[0].filled})`);
  }
}

function findMatchingOrders() {
  // Find crossing orders: buy.price >= sell.price
  const matches = [];

  for (const buyOrder of buyOrders) {
    for (const sellOrder of sellOrders) {
      // Check if prices cross
      if (buyOrder.price >= sellOrder.price) {
        // Check same pair and same quote token
        if (buyOrder.pairId !== sellOrder.pairId) continue;
        if (buyOrder.quoteTokenId !== sellOrder.quoteTokenId) continue;

        // Calculate fill quantity (minimum of both remaining quantities)
        const buyRemaining = buyOrder.quantity - buyOrder.filled;
        const sellRemaining = sellOrder.quantity - sellOrder.filled;
        const fillQuantity = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;

        if (fillQuantity > 0n) {
          // Use midpoint price for settlement
          const fillPrice = (buyOrder.price + sellOrder.price) / 2n;

          matches.push({
            buyOrder,
            sellOrder,
            fillQuantity,
            fillPrice,
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Enhanced matching using Record Scanner Service for comprehensive order discovery
 */
async function findBestMatchesViaRSS() {
  if (!CONFIG.useRecordScanner || !recordScanner) {
    return findMatchingOrders(); // Fall back to legacy matching
  }

  try {
    log('MATCH', '🔍 Using RSS to find best matches...');
    const matches = await recordScanner.findBestMatches(CONFIG.programId, 5); // Limit to 5 best matches
    
    if (matches.length > 0) {
      log('MATCH', `✨ RSS found ${matches.length} optimal match(es)`);
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        log('MATCH', `  ${i+1}. Buy ${match.buyOrder.orderId.slice(0,20)}... @ ${match.buyOrder.price} ↔ Sell ${match.sellOrder.orderId.slice(0,20)}... @ ${match.sellOrder.price} (score: ${match.score.toFixed(2)})`);
      }
    } else {
      log('MATCH', 'RSS found no matching orders');
    }
    
    return matches;
  } catch (err) {
    logError('MATCH', `RSS matching failed: ${err.message}`);
    log('MATCH', 'Falling back to legacy matching...');
    return findMatchingOrders();
  }
}

// ═══════════════════════════════════════════════════════════════
// SETTLEMENT (with partial fill support)
// ═══════════════════════════════════════════════════════════════

async function settleMatch(match) {
  const { buyOrder, sellOrder, fillQuantity, fillPrice } = match;
  const timestamp = Math.floor(Date.now() / 1000);

  log('SETTLE', `Settling match:`);
  log('SETTLE', `  Buy:  ${buyOrder.orderId.slice(0, 20)}... @ ${buyOrder.price}`);
  log('SETTLE', `  Sell: ${sellOrder.orderId.slice(0, 20)}... @ ${sellOrder.price}`);
  log('SETTLE', `  Fill: ${fillQuantity} @ ${fillPrice}`);

  // Check that we have record ciphertexts
  if (!buyOrder.recordCiphertext || !sellOrder.recordCiphertext) {
    logError('SETTLE', 'Missing record ciphertext - cannot settle without actual records');
    return false;
  }

  try {
    // Get treasury address from chain
    let treasuryAddr = CONFIG.treasuryAddr;
    if (!treasuryAddr) {
      const treasuryRaw = await getMapping(CONFIG.programId, 'treasury', 'true');
      if (treasuryRaw && treasuryRaw !== 'null') {
        const addrMatch = treasuryRaw.match(/aleo1[a-z0-9]+/);
        if (addrMatch) treasuryAddr = addrMatch[0];
      }
    }

    if (!treasuryAddr) {
      logError('SETTLE', 'Treasury address not found');
      return false;
    }

    // settle_match returns updated Order records (for partial fills)
    // settle_match(buy_order: Order, sell_order: Order, fill_quantity: u128, fill_price: u64, timestamp: u32, treasury_addr: address)
    // -> (Order, Order, SettlementProof, SettlementProof, Future)
    const cmd = [
      `${SNARKOS} developer execute`,
      `--private-key ${CONFIG.privateKey}`,
      `--query ${CONFIG.queryEndpoint}`,
      `--broadcast ${CONFIG.broadcastEndpoint}`,
      `--network ${CONFIG.networkId}`,
      CONFIG.programId,
      'settle_match',
      `"${buyOrder.recordCiphertext}"`,
      `"${sellOrder.recordCiphertext}"`,
      `${fillQuantity}u128`,
      `${fillPrice}u64`,
      `${timestamp}u32`,
      treasuryAddr,
    ].join(' ');

    log('SETTLE', 'Executing settle_match via snarkos...');
    const result = execSync(cmd, {
      timeout: 180000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    log('SETTLE', `✅ Settlement successful!`);

    // Record trade
    const trade = {
      buyOrderId: buyOrder.orderId,
      sellOrderId: sellOrder.orderId,
      buyTrader: buyOrder.trader,
      sellTrader: sellOrder.trader,
      quantity: fillQuantity.toString(),
      price: fillPrice.toString(),
      timestamp: new Date().toISOString(),
    };
    recentTrades.unshift(trade);
    if (recentTrades.length > MAX_TRADES) recentTrades.pop();

    // Update orders with partial fill state
    // In v17, settle_match returns updated Order records
    // Keeper must re-submit these updated records for future matches
    // For now, we update local state; in production, parse returned records from snarkos output
    buyOrder.filled = buyOrder.filled + fillQuantity;
    buyOrder.escrowAmount = buyOrder.escrowAmount - (fillQuantity * fillPrice / 10000n);
    
    sellOrder.filled = sellOrder.filled + fillQuantity;
    sellOrder.escrowAmount = sellOrder.escrowAmount - fillQuantity;

    // If fully filled, remove from store
    if (buyOrder.filled >= buyOrder.quantity) {
      orderStore.delete(buyOrder.orderId);
    }
    if (sellOrder.filled >= sellOrder.quantity) {
      orderStore.delete(sellOrder.orderId);
    }

    return true;
  } catch (err) {
    logError('SETTLE', `Failed: ${err.stderr?.substring(0, 300) || err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// CANCELLATION (Two-Step Process)
// ═══════════════════════════════════════════════════════════════

async function processCancellation(cancellationRequest) {
  const order = orderStore.get(cancellationRequest.orderId);
  if (!order) {
    logError('CANCEL', `Order not found: ${cancellationRequest.orderId}`);
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const cancelFn = order.isBuy ? 'cancel_buy_order' : 'cancel_sell_order';

  log('CANCEL', `Processing cancellation for ${order.isBuy ? 'buy' : 'sell'} order: ${order.orderId.slice(0, 20)}...`);
  log('CANCEL', `  Trader: ${cancellationRequest.trader}`);
  log('CANCEL', `  Remaining escrow: ${order.escrowAmount}`);

  // Check that we have record ciphertexts
  if (!order.recordCiphertext || !cancellationRequest.recordCiphertext) {
    logError('CANCEL', 'Missing record ciphertext - cannot cancel without actual records');
    return false;
  }

  try {
    // cancel_buy_order(order: Order, cancel_req: CancellationRequest, timestamp: u32)
    // cancel_sell_order(order: Order, cancel_req: CancellationRequest, timestamp: u32)
    // Both return (CancellationProof, Future)
    const cmd = [
      `${SNARKOS} developer execute`,
      `--private-key ${CONFIG.privateKey}`,
      `--query ${CONFIG.queryEndpoint}`,
      `--broadcast ${CONFIG.broadcastEndpoint}`,
      `--network ${CONFIG.networkId}`,
      CONFIG.programId,
      cancelFn,
      `"${order.recordCiphertext}"`,
      `"${cancellationRequest.recordCiphertext}"`,
      `${timestamp}u32`,
    ].join(' ');

    execSync(cmd, {
      timeout: 180000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    log('CANCEL', `✅ Order cancelled, tokens refunded to ${cancellationRequest.trader}`);
    orderStore.delete(order.orderId);
    cancellationRequests.delete(cancellationRequest.orderId);
    return true;
  } catch (err) {
    logError('CANCEL', `Failed: ${err.stderr?.substring(0, 200) || err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// HTTP API SERVER
// ═══════════════════════════════════════════════════════════════

function serializeOrder(order) {
  return {
    orderId: order.orderId,
    trader: order.trader,
    pairId: order.pairId.toString(),
    isBuy: order.isBuy,
    price: order.price.toString(),
    quantity: order.quantity.toString(),
    filled: order.filled.toString(),
    remaining: (order.quantity - order.filled).toString(),
    quoteTokenId: order.quoteTokenId,
    escrowAmount: order.escrowAmount.toString(),
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    scannedAt: order.scannedAt,
  };
}

function startApiServer() {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', CONFIG.frontendOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${CONFIG.apiPort}`);
    const json = (data, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // GET /health
    if (url.pathname === '/health' && req.method === 'GET') {
      const rssStatus = recordScanner ? recordScanner.getStatus() : null;
      return json({
        status: 'ok',
        paused: botPaused,
        programId: CONFIG.programId,
        orderCount: orderStore.size,
        buyOrders: buyOrders.length,
        sellOrders: sellOrders.length,
        pendingCancellations: cancellationRequests.size,
        lastScanAt,
        lastMatchAt,
        upSince: botStartedAt,
        recordScanner: {
          enabled: CONFIG.useRecordScanner,
          initialized: !!recordScanner,
          status: rssStatus
        }
      });
    }

    // GET /api/orders - all orders
    if (url.pathname === '/api/orders' && req.method === 'GET') {
      const orders = Array.from(orderStore.values()).map(serializeOrder);
      return json({ orders, lastScanAt });
    }

    // GET /api/orderbook - formatted order book
    if (url.pathname === '/api/orderbook' && req.method === 'GET') {
      const bids = buyOrders.map(o => ({
        price: o.price.toString(),
        quantity: (o.quantity - o.filled).toString(),
        trader: o.trader,
        orderId: o.orderId,
      }));
      const asks = sellOrders.map(o => ({
        price: o.price.toString(),
        quantity: (o.quantity - o.filled).toString(),
        trader: o.trader,
        orderId: o.orderId,
      }));

      const spread = (buyOrders.length > 0 && sellOrders.length > 0)
        ? (sellOrders[0].price - buyOrders[0].price).toString()
        : null;

      return json({
        bids,
        asks,
        spread,
        bestBid: buyOrders[0]?.price.toString() || null,
        bestAsk: sellOrders[0]?.price.toString() || null,
        lastScanAt
      });
    }

    // GET /api/trades - recent trades
    if (url.pathname === '/api/trades' && req.method === 'GET') {
      return json({ trades: recentTrades });
    }

    // POST /api/match - manually trigger matching
    if (url.pathname === '/api/match' && req.method === 'POST') {
      if (isProcessing) {
        return json({ error: 'Already processing' }, 409);
      }
      const result = await matchTick();
      return json({ matched: result });
    }

    // POST /api/bot/pause
    if (url.pathname === '/api/bot/pause' && req.method === 'POST') {
      botPaused = true;
      log('API', '⏸ Bot paused');
      return json({ paused: true });
    }

    // POST /api/bot/resume
    if (url.pathname === '/api/bot/resume' && req.method === 'POST') {
      botPaused = false;
      log('API', '▶️ Bot resumed');
      return json({ paused: false });
    }

    // GET /api/rss/status - Record Scanner Service status
    if (url.pathname === '/api/rss/status' && req.method === 'GET') {
      if (!CONFIG.useRecordScanner) {
        return json({ enabled: false, message: 'Record Scanner Service is disabled' });
      }
      
      if (!recordScanner) {
        return json({ enabled: true, initialized: false, message: 'Record Scanner Service not initialized' });
      }

      const status = recordScanner.getStatus();
      return json({
        enabled: true,
        initialized: true,
        ...status
      });
    }

    // POST /api/rss/find-matches - Trigger RSS best match finding
    if (url.pathname === '/api/rss/find-matches' && req.method === 'POST') {
      if (!recordScanner) {
        return json({ error: 'Record Scanner Service not available' }, 400);
      }

      try {
        const matches = await recordScanner.findBestMatches(CONFIG.programId, 10);
        return json({
          matchCount: matches.length,
          matches: matches.map(match => ({
            buyOrderId: match.buyOrder.orderId,
            sellOrderId: match.sellOrder.orderId,
            fillQuantity: match.fillQuantity.toString(),
            fillPrice: match.fillPrice.toString(),
            score: match.score
          }))
        });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(CONFIG.apiPort, () => {
    log('API', `✅ HTTP server listening on port ${CONFIG.apiPort}`);
    log('API', `   GET http://localhost:${CONFIG.apiPort}/api/orderbook`);
    log('API', `   GET http://localhost:${CONFIG.apiPort}/api/orders`);
    log('API', `   GET http://localhost:${CONFIG.apiPort}/api/trades`);
    log('API', `   GET http://localhost:${CONFIG.apiPort}/health`);
    if (CONFIG.useRecordScanner) {
      log('API', `   GET http://localhost:${CONFIG.apiPort}/api/rss/status`);
      log('API', `   POST http://localhost:${CONFIG.apiPort}/api/rss/find-matches`);
    }
  });

  server.on('error', err => logError('API', `Server error: ${err.message}`));
  return server;
}

// ═══════════════════════════════════════════════════════════════
// MAIN TICKS
// ═══════════════════════════════════════════════════════════════

async function scanTick() {
  if (botPaused) { log('SCAN', 'Bot paused, skipping scan'); return; }

  try {
    const orders = await scanOrders();
    const cancellationReqs = await scanCancellationRequests();
    const blockHeight = await getLatestBlockHeight();
    
    lastScanAt = new Date().toISOString();
    updateOrderBook(orders);

    log('SCAN', `Block height: ${blockHeight}`);

    // Store cancellation requests for processing
    for (const req of cancellationReqs) {
      cancellationRequests.set(req.orderId, req);
      log('SCAN', `Cancellation request found: ${req.orderId.slice(0, 20)}... from ${req.trader.slice(0, 10)}...`);
    }
  } catch (err) {
    logError('SCAN', `Tick error: ${err.message}`);
  }
}

async function matchTick() {
  if (botPaused) { log('MATCH', 'Bot paused, skipping match'); return 0; }
  if (isProcessing) return 0;
  isProcessing = true;

  let matchedCount = 0;

  try {
    // Process matches using enhanced RSS matching or fallback to legacy
    const matches = await findBestMatchesViaRSS();

    if (matches.length === 0) {
      log('MATCH', 'No crossing orders found');
    } else {
      log('MATCH', `Found ${matches.length} potential match(es)`);

      for (const match of matches) {
        const success = await settleMatch(match);
        if (success) {
          matchedCount++;
          // Wait between settlements to avoid nonce issues
          await sleep(5000);
        }
      }
    }

    // Process pending cancellations
    if (cancellationRequests.size > 0) {
      log('MATCH', `Processing ${cancellationRequests.size} cancellation request(s)`);
      for (const cancellationReq of cancellationRequests.values()) {
        const success = await processCancellation(cancellationReq);
        if (success) {
          await sleep(2000);
        }
      }
    }

    lastMatchAt = new Date().toISOString();
  } catch (err) {
    logError('MATCH', `Tick error: ${err.message}`);
  } finally {
    isProcessing = false;
  }

  return matchedCount;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Private Orderbook Keeper Bot v1 (v17)               ║');
  console.log('║             Enhanced with Record Scanner Service            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  log('BOT', `Program: ${CONFIG.programId}`);
  log('BOT', `Network: ${CONFIG.network}`);
  log('BOT', `Scan interval:  ${CONFIG.scanIntervalMs / 1000}s`);
  log('BOT', `Match interval: ${CONFIG.matchIntervalMs / 1000}s`);
  log('BOT', `API port: ${CONFIG.apiPort}`);
  log('BOT', `Record Scanner: ${CONFIG.useRecordScanner ? 'ENABLED' : 'DISABLED'}`);
  console.log('');

  if (!CONFIG.privateKey || CONFIG.privateKey.includes('...')) {
    logError('BOT', 'Missing PRIVATE_KEY in .env');
    process.exit(1);
  }

  // Initialize Record Scanner Service if enabled
  if (CONFIG.useRecordScanner) {
    if (!CONFIG.rssApiKey || !CONFIG.viewKey) {
      logError('BOT', 'Record Scanner enabled but missing RSS_API_KEY or VIEW_KEY in .env');
      log('BOT', 'Continuing with legacy chain scanning only...');
    } else {
      try {
        log('BOT', 'Initializing Record Scanner Service...');
        recordScanner = new RecordScannerService(CONFIG.rssApiKey, CONFIG.rssConsumerId || '', CONFIG.network, CONFIG.viewKey);
        
        log('BOT', `Registering view key with RSS (start block: ${CONFIG.scannerStartBlock})...`);
        await recordScanner.registerViewKey(CONFIG.viewKey, CONFIG.scannerStartBlock);
        
        log('BOT', '✅ Record Scanner Service initialized successfully');
        const status = recordScanner.getStatus();
        log('BOT', `RSS UUID: ${status.uuid}`);
      } catch (err) {
        logError('BOT', `RSS initialization failed: ${err.message}`);
        log('BOT', 'Continuing with legacy chain scanning only...');
        recordScanner = null;
      }
    }
  }

  // Start HTTP API server
  startApiServer();

  // Initial scan
  log('BOT', 'Initial order scan...');
  await scanTick();

  // Initial match attempt
  log('BOT', 'Initial match check...');
  await matchTick();

  // Start intervals
  setInterval(scanTick, CONFIG.scanIntervalMs);
  setInterval(matchTick, CONFIG.matchIntervalMs);

  log('BOT', '✅ Running. Ctrl+C to stop.');
}

main().catch(err => {
  logError('BOT', `Fatal: ${err.message}`);
  process.exit(1);
});
