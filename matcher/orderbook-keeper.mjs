#!/usr/bin/env node

/**
 * Private Orderbook Keeper Bot v2
 * ================================
 * Discovers orders automatically by scanning for keeper-owned
 * Order records. No frontend POST required.
 *
 * FLOW:
 *   1. Derive view key from PRIVATE_KEY
 *   2. Register view key with Provable scanner (once, saved to .keeper-state.json)
 *   3. Poll scanner for unspent Order and CancellationRequest records
 *   4. Decrypt each → extract order fields
 *   5. Match crossing orders (buy.price >= sell.price)
 *   6. Execute settle_match for matched pairs
 *   7. Process cancellation requests
 *
 * ENV (.env):
 *   PRIVATE_KEY            — keeper wallet private key (required)
 *   PROVABLE_API_KEY       — raw API key from POST /consumers (required)
 *   PROVABLE_CONSUMER_ID   — consumer.id from POST /consumers (required)
 *   ORDERBOOK_PROGRAM      — defaults to private_orderbook_v17.aleo
 *   TOKEN_PROGRAM          — defaults to mock_usdc_orderbook.aleo
 *   SNARKOS_PATH           — path to snarkos binary (default: snarkos)
 *   QUERY_ENDPOINT         — Aleo explorer API base URL
 *   BROADCAST_ENDPOINT     — Aleo broadcast endpoint
 *   NETWORK_ID             — network ID (default: 1)
 *   SCAN_INTERVAL          — how often to scan (default: 30000ms)
 *   MATCH_INTERVAL         — how often to match (default: 10000ms)
 *   API_PORT               — HTTP status API port (default: 3002)
 *   SCANNER_START_BLOCK    — block to start scanning from
 *
 * INSTALL SDK:
 *   npm install @provablehq/sdk
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Account } from '@provablehq/sdk/testnet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '.keeper-state.json');
const SNARKOS = process.env.SNARKOS_PATH || 'snarkos';

const CONFIG = {
  privateKey:         process.env.PRIVATE_KEY || '',
  provableApiKey:     process.env.PROVABLE_API_KEY || process.env.RSS_API_KEY || '',
  provableConsumerId: process.env.PROVABLE_CONSUMER_ID || process.env.RSS_CONSUMER_ID || '',
  programId:          process.env.ORDERBOOK_PROGRAM || 'private_orderbook_v17.aleo',
  tokenProgram:       process.env.TOKEN_PROGRAM || 'mock_usdc_orderbook.aleo',
  networkId:          process.env.NETWORK_ID || '1',
  queryEndpoint:      process.env.QUERY_ENDPOINT || 'https://api.explorer.provable.com/v1',
  broadcastEndpoint:  process.env.BROADCAST_ENDPOINT || 'https://api.explorer.provable.com/v1/testnet/transaction/broadcast',
  scanIntervalMs:     parseInt(process.env.SCAN_INTERVAL || '30000'),
  matchIntervalMs:    parseInt(process.env.MATCH_INTERVAL || '10000'),
  apiPort:            parseInt(process.env.API_PORT || '3002'),
  provableBase:       'https://api.provable.com',
  scannerBase:        'https://api.provable.com/scanner/testnet',
  frontendOrigin:     process.env.FRONTEND_ORIGIN || '*',
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const orderStore = new Map();           // orderId → order object
const cancellationRequests = new Map(); // orderId → cancellation request
const settledOrderIds = new Set();      // persisted across restarts
const recentTrades = [];
const MAX_TRADES = 100;

let currentBlock = 0n;
let isProcessing = false;
let scannerReady = false;
let apiJwt = '';
let scannerUuid = '';
let keeperAccount = null;
const botStarted = new Date().toISOString();
let lastScanAt = null;
let lastMatchAt = null;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const ts = () => new Date().toISOString().substring(11, 19);
const log = (t, m) => console.log(`[${ts()}] [${t}] ${m}`);
const err = (t, m) => console.error(`[${ts()}] [${t}] ERROR: ${m}`);

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (!scannerUuid && s.uuid) scannerUuid = s.uuid;
      if (Array.isArray(s.settledOrderIds)) s.settledOrderIds.forEach(id => settledOrderIds.add(id));
      log('STATE', `Loaded state: UUID=${scannerUuid?.substring(0, 8)}..., settled=${settledOrderIds.size}`);
    }
  } catch { /* ignore */ }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      uuid: scannerUuid,
      settledOrderIds: [...settledOrderIds],
    }, null, 2));
  } catch { /* ignore */ }
}

function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', headers = {}, body } = opts;
    const parsed = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
    };
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(options, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function fetchWithHeaders(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', headers = {}, body } = opts;
    const parsed = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
    };
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(options, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch { json = data; }
        resolve({ json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// RECORD PLAINTEXT PARSER
// ═══════════════════════════════════════════════════════════════

function parsePlaintext(text) {
  if (!text) return {};
  const result = {};
  const re = /(\w+)\s*:\s*([^,}\s]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    result[m[1]] = m[2].replace(/\.(private|public)$/, '');
  }
  return result;
}

function numVal(val) {
  return val ? val.replace(/[a-z][a-z0-9]*$/, '') : '0';
}

// ═══════════════════════════════════════════════════════════════
// BLOCK HEIGHT
// ═══════════════════════════════════════════════════════════════

async function fetchBlockHeight() {
  try {
    const raw = await fetchJson(`${CONFIG.queryEndpoint}/testnet/block/height/latest`);
    currentBlock = BigInt(typeof raw === 'number' ? raw : String(raw).trim());
  } catch (e) {
    err('BLOCK', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROVABLE AUTH
// ═══════════════════════════════════════════════════════════════

async function issueJwt() {
  log('AUTH', 'Requesting JWT...');
  const { json, headers } = await fetchWithHeaders(
    `${CONFIG.provableBase}/jwts/${CONFIG.provableConsumerId}`,
    { method: 'POST', headers: { 'X-Provable-API-Key': CONFIG.provableApiKey } },
  );
  const token = headers['authorization'] || headers['x-provable-jwt'] || headers['x-jwt'] || headers['token'];
  if (!token) throw new Error(`JWT not found in response headers. Body: ${JSON.stringify(json)}`);
  apiJwt = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  log('AUTH', `JWT issued (exp: ${json?.exp ?? 'unknown'})`);
}

// ═══════════════════════════════════════════════════════════════
// PROVABLE SCANNER — REGISTER VIEW KEY (first run)
// ═══════════════════════════════════════════════════════════════

async function ensureUuid(viewKey) {
  if (scannerUuid) {
    log('SCANNER', `UUID: ${scannerUuid}`);
    return;
  }

  const startBlock = process.env.SCANNER_START_BLOCK
    ? parseInt(process.env.SCANNER_START_BLOCK)
    : Math.max(0, Number(currentBlock) - 20000);

  log('SCANNER', `Registering view key (start=${startBlock})...`);
  const res = await fetchJson(`${CONFIG.scannerBase}/register`, {
    method: 'POST',
    headers: { Authorization: apiJwt },
    body: { view_key: viewKey, start: startBlock },
  });

  if (!res?.uuid) throw new Error(`Scanner registration failed: ${JSON.stringify(res)}`);
  scannerUuid = res.uuid;
  log('SCANNER', `UUID: ${scannerUuid} — saved to ${STATE_FILE}`);
  saveState();
}

// ═══════════════════════════════════════════════════════════════
// PROVABLE SCANNER — FETCH ORDER RECORDS
// ═══════════════════════════════════════════════════════════════

async function fetchOrderRecords() {
  const body = {
    uuid: scannerUuid.trim(),
    decrypt: true,
    unspent: true,
    filter: {
      programs: [CONFIG.programId],
      records: ['Order'],
      functions: ['submit_buy_order', 'submit_sell_order'],
    },
    response_filter: {
      record_ciphertext: true,
      record_name: true,
      record_plaintext: true,
      transaction_id: true,
      block_height: true,
      spent: true,
    },
  };

  const res = await fetchJson(`${CONFIG.scannerBase}/records/owned`, {
    method: 'POST',
    headers: { Authorization: apiJwt },
    body,
  });

  if (!Array.isArray(res)) {
    err('SCANNER', `Unexpected response: ${JSON.stringify(res).substring(0, 200)}`);
    return [];
  }
  return res;
}

async function fetchCancellationRecords() {
  const body = {
    uuid: scannerUuid.trim(),
    decrypt: true,
    unspent: true,
    filter: {
      programs: [CONFIG.programId],
      records: ['CancellationRequest'],
      functions: ['request_cancel'],
    },
    response_filter: {
      record_ciphertext: true,
      record_name: true,
      record_plaintext: true,
      transaction_id: true,
      block_height: true,
      spent: true,
    },
  };

  const res = await fetchJson(`${CONFIG.scannerBase}/records/owned`, {
    method: 'POST',
    headers: { Authorization: apiJwt },
    body,
  });

  if (!Array.isArray(res)) {
    err('SCANNER', `Unexpected response: ${JSON.stringify(res).substring(0, 200)}`);
    return [];
  }
  return res;
}

// ═══════════════════════════════════════════════════════════════
// ORDER PARSING
// ═══════════════════════════════════════════════════════════════

function parseOrderFromPlaintext(plaintextStr, rec) {
  const plain = parsePlaintext(plaintextStr);

  const orderId = plain.order_id;
  if (!orderId) return null;

  return {
    orderId,
    owner: plain.owner || '',
    trader: plain.trader || '',
    pairId: BigInt(numVal(plain.pair_id) || '1'),
    isBuy: plain.is_buy === 'true',
    price: BigInt(numVal(plain.price) || '0'),
    quantity: BigInt(numVal(plain.quantity) || '0'),
    quoteTokenId: plain.quote_token_id || '0field',
    escrowAmount: BigInt(numVal(plain.escrow_amount) || '0'),
    filled: BigInt(numVal(plain.filled) || '0'),
    createdAt: parseInt(numVal(plain.created_at) || '0'),
    expiresAt: parseInt(numVal(plain.expires_at) || '0'),
    plaintext: plaintextStr.replace(/\s+/g, ' ').trim(),
    recordCiphertext: rec.record_ciphertext,
    commitment: rec.commitment,
    blockHeight: rec.block_height,
    transactionId: rec.transaction_id,
    scannedAt: new Date().toISOString(),
  };
}

function parseCancellationFromPlaintext(plaintextStr, rec) {
  const plain = parsePlaintext(plaintextStr);

  const orderId = plain.order_id;
  if (!orderId) return null;

  return {
    orderId,
    owner: plain.owner || '',
    trader: plain.trader || '',
    isBuy: plain.is_buy === 'true',
    createdAt: parseInt(numVal(plain.created_at) || '0'),
    plaintext: plaintextStr.replace(/\s+/g, ' ').trim(),
    recordCiphertext: rec.record_ciphertext,
    blockHeight: rec.block_height,
    transactionId: rec.transaction_id,
  };
}

// ═══════════════════════════════════════════════════════════════
// GET MAPPING VALUE
// ═══════════════════════════════════════════════════════════════

async function getMapping(programId, mappingName, key) {
  try {
    const url = `${CONFIG.queryEndpoint}/testnet/program/${programId}/mapping/${mappingName}/${encodeURIComponent(key)}`;
    const res = await fetchJson(url);
    return typeof res === 'string' ? res : JSON.stringify(res);
  } catch (e) {
    err('MAPPING', `Failed to fetch ${mappingName}[${key}]: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SETTLEMENT
// ═══════════════════════════════════════════════════════════════

async function settleMatch(buyOrder, sellOrder) {
  const buyRemaining = buyOrder.quantity - buyOrder.filled;
  const sellRemaining = sellOrder.quantity - sellOrder.filled;
  const fillQuantity = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;
  const fillPrice = (buyOrder.price + sellOrder.price) / 2n;
  const timestamp = Math.floor(Date.now() / 1000);

  log('SETTLE', `Settling match:`);
  log('SETTLE', `  Buy:  ${buyOrder.orderId.substring(0, 20)}... @ ${buyOrder.price}`);
  log('SETTLE', `  Sell: ${sellOrder.orderId.substring(0, 20)}... @ ${sellOrder.price}`);
  log('SETTLE', `  Fill: ${fillQuantity} @ ${fillPrice}`);

  if (!buyOrder.plaintext || !sellOrder.plaintext) {
    err('SETTLE', 'Missing plaintext - cannot settle');
    return false;
  }

  try {
    // Get treasury address from chain
    let treasuryAddr = process.env.TREASURY_ADDR;
    if (!treasuryAddr) {
      const treasuryRaw = await getMapping(CONFIG.programId, 'treasury', 'true');
      if (treasuryRaw && treasuryRaw !== 'null') {
        const addrMatch = treasuryRaw.match(/aleo1[a-z0-9]+/);
        if (addrMatch) treasuryAddr = addrMatch[0];
      }
    }

    if (!treasuryAddr) {
      err('SETTLE', 'Treasury address not found');
      return false;
    }

    const cmd = [
      `${SNARKOS} developer execute`,
      `--private-key "${CONFIG.privateKey}"`,
      `--query "${CONFIG.queryEndpoint}"`,
      `--broadcast "${CONFIG.broadcastEndpoint}"`,
      `--network ${CONFIG.networkId}`,
      CONFIG.programId,
      'settle_match',
      `"${buyOrder.plaintext}"`,
      `"${sellOrder.plaintext}"`,
      `${fillQuantity}u128`,
      `${fillPrice}u64`,
      `${timestamp}u32`,
      treasuryAddr,
    ].join(' ');

    log('SETTLE', 'Executing settle_match via snarkos...');
    const output = execSync(cmd + ' 2>&1', { timeout: 300000, encoding: 'utf8' });
    const txId = output.match(/at1[a-z0-9]{58}/)?.[0] || 'unknown';

    log('SETTLE', `Settlement successful! TX: ${txId}`);

    // Record trade
    recentTrades.unshift({
      buyOrderId: buyOrder.orderId,
      sellOrderId: sellOrder.orderId,
      buyTrader: buyOrder.trader,
      sellTrader: sellOrder.trader,
      quantity: fillQuantity.toString(),
      price: fillPrice.toString(),
      timestamp: new Date().toISOString(),
      txId,
    });
    if (recentTrades.length > MAX_TRADES) recentTrades.pop();

    // Mark as settled if fully filled
    if (buyRemaining <= fillQuantity) {
      settledOrderIds.add(buyOrder.orderId);
    }
    if (sellRemaining <= fillQuantity) {
      settledOrderIds.add(sellOrder.orderId);
    }
    saveState();

    return true;
  } catch (e) {
    const msg = (e.stdout || '') + (e.stderr || '') || e.message;
    err('SETTLE', `Failed: ${msg.substring(0, 400)}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// CANCELLATION
// ═══════════════════════════════════════════════════════════════

async function processCancellation(cancellation) {
  const order = orderStore.get(cancellation.orderId);
  if (!order) {
    err('CANCEL', `Order not found: ${cancellation.orderId}`);
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const cancelFn = order.isBuy ? 'cancel_buy_order' : 'cancel_sell_order';

  log('CANCEL', `Processing cancellation for ${order.isBuy ? 'buy' : 'sell'} order: ${order.orderId.substring(0, 20)}...`);

  if (!order.plaintext || !cancellation.plaintext) {
    err('CANCEL', 'Missing plaintext - cannot cancel');
    return false;
  }

  try {
    const cmd = [
      `${SNARKOS} developer execute`,
      `--private-key "${CONFIG.privateKey}"`,
      `--query "${CONFIG.queryEndpoint}"`,
      `--broadcast "${CONFIG.broadcastEndpoint}"`,
      `--network ${CONFIG.networkId}`,
      CONFIG.programId,
      cancelFn,
      `"${order.plaintext}"`,
      `"${cancellation.plaintext}"`,
      `${timestamp}u32`,
    ].join(' ');

    const output = execSync(cmd + ' 2>&1', { timeout: 300000, encoding: 'utf8' });
    const txId = output.match(/at1[a-z0-9]{58}/)?.[0] || 'unknown';

    log('CANCEL', `Order cancelled! TX: ${txId}`);

    settledOrderIds.add(order.orderId);
    orderStore.delete(order.orderId);
    cancellationRequests.delete(cancellation.orderId);
    saveState();

    return true;
  } catch (e) {
    const msg = (e.stdout || '') + (e.stderr || '') || e.message;
    err('CANCEL', `Failed: ${msg.substring(0, 400)}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// SCAN + PROCESS LOOP
// ═══════════════════════════════════════════════════════════════

async function scanAndProcess() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    await fetchBlockHeight();
    log('SCAN', `block=${currentBlock} — fetching Order records...`);

    // Fetch order records
    const rawOrders = await fetchOrderRecords();
    log('SCAN', `Scanner returned ${rawOrders.length} Order record(s)`);

    // Clear and rebuild order store
    orderStore.clear();
    const buyOrders = [];
    const sellOrders = [];

    for (const rec of rawOrders) {
      let plaintextStr;
      try {
        if (rec.record_plaintext) {
          plaintextStr = rec.record_plaintext;
        } else if (rec.record_ciphertext && keeperAccount) {
          const decrypted = keeperAccount.decryptRecord(rec.record_ciphertext);
          plaintextStr = decrypted ? (typeof decrypted.toString === 'function' ? decrypted.toString() : String(decrypted)) : null;
        }
      } catch (e) {
        err('SCAN', `Failed to decrypt: ${e.message}`);
        continue;
      }

      if (!plaintextStr) continue;

      const order = parseOrderFromPlaintext(plaintextStr, rec);
      if (!order) continue;

      // Skip already settled orders
      if (settledOrderIds.has(order.orderId)) continue;

      // Skip fully filled orders
      const remaining = order.quantity - order.filled;
      if (remaining <= 0n) continue;

      orderStore.set(order.orderId, order);

      if (order.isBuy) {
        buyOrders.push(order);
      } else {
        sellOrders.push(order);
      }
    }

    // Sort for optimal matching
    buyOrders.sort((a, b) => Number(b.price - a.price));   // DESC - best bid first
    sellOrders.sort((a, b) => Number(a.price - b.price));  // ASC - best ask first

    log('SCAN', `Order book: ${buyOrders.length} bids, ${sellOrders.length} asks`);
    if (buyOrders.length > 0) {
      log('SCAN', `  Best bid: ${buyOrders[0].price} (qty: ${buyOrders[0].quantity - buyOrders[0].filled})`);
    }
    if (sellOrders.length > 0) {
      log('SCAN', `  Best ask: ${sellOrders[0].price} (qty: ${sellOrders[0].quantity - sellOrders[0].filled})`);
    }

    // Find and execute matches
    let matchCount = 0;
    for (const buyOrder of buyOrders) {
      for (const sellOrder of sellOrders) {
        // Check crossing condition
        if (buyOrder.price < sellOrder.price) continue;
        if (buyOrder.pairId !== sellOrder.pairId) continue;
        if (buyOrder.quoteTokenId !== sellOrder.quoteTokenId) continue;

        // Check remaining quantities
        const buyRemaining = buyOrder.quantity - buyOrder.filled;
        const sellRemaining = sellOrder.quantity - sellOrder.filled;
        if (buyRemaining <= 0n || sellRemaining <= 0n) continue;

        log('MATCH', `Found crossing orders:`);
        log('MATCH', `  Buy:  ${buyOrder.orderId.substring(0, 20)}... @ ${buyOrder.price}`);
        log('MATCH', `  Sell: ${sellOrder.orderId.substring(0, 20)}... @ ${sellOrder.price}`);

        const success = await settleMatch(buyOrder, sellOrder);
        if (success) {
          matchCount++;
          await new Promise(r => setTimeout(r, 5000)); // pause between settlements
        }
      }
    }

    // Fetch and process cancellation requests
    const rawCancellations = await fetchCancellationRecords();
    log('SCAN', `Scanner returned ${rawCancellations.length} CancellationRequest record(s)`);

    for (const rec of rawCancellations) {
      let plaintextStr;
      try {
        if (rec.record_plaintext) {
          plaintextStr = rec.record_plaintext;
        } else if (rec.record_ciphertext && keeperAccount) {
          const decrypted = keeperAccount.decryptRecord(rec.record_ciphertext);
          plaintextStr = decrypted ? (typeof decrypted.toString === 'function' ? decrypted.toString() : String(decrypted)) : null;
        }
      } catch (e) {
        continue;
      }

      if (!plaintextStr) continue;

      const cancellation = parseCancellationFromPlaintext(plaintextStr, rec);
      if (!cancellation) continue;

      cancellationRequests.set(cancellation.orderId, cancellation);
    }

    // Process pending cancellations
    if (cancellationRequests.size > 0) {
      log('CANCEL', `Processing ${cancellationRequests.size} cancellation request(s)`);
      for (const cancellation of cancellationRequests.values()) {
        const success = await processCancellation(cancellation);
        if (success) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    lastScanAt = new Date().toISOString();
    lastMatchAt = new Date().toISOString();

    // Summary
    log('SCAN', `store: ${orderStore.size} orders | ${matchCount} matched | ${cancellationRequests.size} cancellations pending`);
  } catch (e) {
    err('SCAN', e.message);
  } finally {
    isProcessing = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// HTTP API SERVER (Minimal - Privacy Preserving)
// ═══════════════════════════════════════════════════════════════
// Note: This is a PRIVATE orderbook. Order details are NOT exposed publicly.
// Users query their own records directly from wallet using requestRecords().
// The keeper only exposes health status for monitoring.

function startApiServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', CONFIG.frontendOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${CONFIG.apiPort}`);
    const json = (data, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
    };

    // GET /health - Basic keeper status (no private order data)
    if (req.method === 'GET' && url.pathname === '/health') {
      return json({
        status: scannerReady ? 'ok' : 'initializing',
        programId: CONFIG.programId,
        currentBlock: currentBlock.toString(),
        scannerReady,
        lastScanAt,
        lastMatchAt,
        upSince: botStarted,
      });
    }

    // GET /api/stats - Aggregated stats only (no individual order details)
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      return json({
        totalTrades: recentTrades.length,
        pendingOrders: orderStore.size,
        lastTradeAt: recentTrades[0]?.timestamp || null,
        lastScanAt,
      });
    }

    res.writeHead(404); res.end();
  });

  server.listen(CONFIG.apiPort, () => {
    log('API', `Listening on :${CONFIG.apiPort}`);
    log('API', `  GET  /health`);
    log('API', `  GET  /api/stats`);
    log('API', ``);
    log('API', `Note: Order data is private. Users query records via wallet.`);
  });
  server.on('error', e => err('API', e.message));
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Private Orderbook Keeper Bot v2 (Record Scanner)    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!CONFIG.privateKey) { err('BOT', 'PRIVATE_KEY not set'); process.exit(1); }
  if (!CONFIG.provableApiKey) { err('BOT', 'PROVABLE_API_KEY / RSS_API_KEY not set'); process.exit(1); }
  if (!CONFIG.provableConsumerId) { err('BOT', 'PROVABLE_CONSUMER_ID / RSS_CONSUMER_ID not set'); process.exit(1); }

  keeperAccount = new Account({ privateKey: CONFIG.privateKey });
  const viewKeyObj = keeperAccount.viewKey();
  const viewKey = typeof viewKeyObj.to_string === 'function'
    ? viewKeyObj.to_string()
    : String(viewKeyObj);
  log('BOT', `View key: ${viewKey.substring(0, 20)}...`);

  loadState();

  log('BOT', `Program  : ${CONFIG.programId}`);
  log('BOT', `Network  : ${CONFIG.networkId}`);
  log('BOT', `Scan     : ${CONFIG.scanIntervalMs / 1000}s`);
  log('BOT', `Match    : ${CONFIG.matchIntervalMs / 1000}s`);
  console.log('');

  startApiServer();

  // Scanner setup
  try {
    await issueJwt();
    await fetchBlockHeight();
    await ensureUuid(viewKey);
    scannerReady = true;
    log('BOT', 'Scanner ready.');
  } catch (e) {
    err('BOT', `Scanner setup failed: ${e.message} — will retry on next tick`);
  }

  // Refresh JWT every 12h
  setInterval(async () => {
    try { await issueJwt(); } catch (e) { err('AUTH', `JWT refresh failed: ${e.message}`); }
  }, 12 * 60 * 60 * 1000);

  // Initial scan
  await scanAndProcess();

  // Scan loop
  setInterval(async () => {
    if (!scannerReady) {
      try {
        await issueJwt();
        await fetchBlockHeight();
        await ensureUuid(viewKey);
        scannerReady = true;
        log('BOT', 'Scanner ready (recovered).');
      } catch (e) {
        err('BOT', `Scanner retry failed: ${e.message}`);
        return;
      }
    }
    await scanAndProcess();
  }, CONFIG.scanIntervalMs);
}

main().catch(e => { err('FATAL', e.message); process.exit(1); });
