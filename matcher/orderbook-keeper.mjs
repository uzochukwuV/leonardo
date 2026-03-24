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

// USDCx routing: when token_id == 7000field, use USDCx-specific functions
const USDCX_TOKEN_ID = '7000field';

const CONFIG = {
  privateKey:         process.env.PRIVATE_KEY || '',
  provableApiKey:     process.env.PROVABLE_API_KEY || process.env.RSS_API_KEY || '',
  provableConsumerId: process.env.PROVABLE_CONSUMER_ID || process.env.RSS_CONSUMER_ID || '',
  programId:          process.env.ORDERBOOK_PROGRAM || 'private_orderbook_v19.aleo',
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

// Per-pair order book stats (exposed via API)
// pairId → { bestBid, bestAsk, bidCount, askCount, spread, midPrice }
const pairStats = new Map();

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

    // Determine which settlement function to use based on token IDs
    // - settle_match: ALEO base, token_registry quote
    // - settle_match_usdcx: ALEO base, USDCx quote (7000field)
    // - settle_match_usdcx_base: USDCx base, token_registry quote
    const isUsdcxQuote = buyOrder.quoteTokenId === USDCX_TOKEN_ID;
    // Note: For USDCx base detection, we'd need to check pair's base_token_id
    // For now, we detect based on quote token since most pairs are ALEO/X

    let settleFn = 'settle_match';
    if (isUsdcxQuote) {
      settleFn = 'settle_match_usdcx';
      log('SETTLE', 'Using settle_match_usdcx (USDCx quote token)');
    }

    const cmd = [
      `${SNARKOS} developer execute`,
      `--private-key "${CONFIG.privateKey}"`,
      `--query "${CONFIG.queryEndpoint}"`,
      `--broadcast "${CONFIG.broadcastEndpoint}"`,
      `--network ${CONFIG.networkId}`,
      CONFIG.programId,
      settleFn,
      `"${buyOrder.plaintext}"`,
      `"${sellOrder.plaintext}"`,
      `${fillQuantity}u128`,
      `${fillPrice}u64`,
      `${timestamp}u32`,
      treasuryAddr,
    ].join(' ');

    log('SETTLE', `Executing ${settleFn} via snarkos...`);
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
// CROSS-PAIR SETTLEMENT
// Atomic settlement across two pairs via USDCx bridge
// User sells ALEO → receives target token (e.g., TKNB)
// via ALEO/USDCx + TKNB/USDCx pairs
// ═══════════════════════════════════════════════════════════════

async function settleCrossPair(userSellOrder, cp1BuyOrder, cp2SellOrder, leg2BaseTokenId) {
  // User sells base token (ALEO) on leg1, receives base token (TKNB) from leg2
  // CP1 buys ALEO with USDCx on leg1
  // CP2 sells TKNB for USDCx on leg2

  const leg1FillQty = (() => {
    const userRemaining = userSellOrder.quantity - userSellOrder.filled;
    const cp1Remaining = cp1BuyOrder.quantity - cp1BuyOrder.filled;
    return userRemaining < cp1Remaining ? userRemaining : cp1Remaining;
  })();

  const leg1Price = (userSellOrder.price + cp1BuyOrder.price) / 2n;

  // Calculate USDCx bridged (after fees)
  const usdcxFromLeg1 = (leg1FillQty * leg1Price) / 10000n;
  const settlerFeeBps = 10n; // 0.10%
  const protocolFeeBps = 5n; // 0.05%
  const settlerFee = (usdcxFromLeg1 * settlerFeeBps) / 10000n;
  const protocolFee = (usdcxFromLeg1 * protocolFeeBps) / 10000n;
  const bridgeAmount = usdcxFromLeg1 - settlerFee - protocolFee;

  // Calculate leg2 fill quantity based on bridge amount and CP2's price
  // bridgeAmount = (leg2FillQty * leg2Price) / 10000
  // leg2FillQty = (bridgeAmount * 10000) / leg2Price
  const leg2Price = cp2SellOrder.price;
  const leg2FillQty = (bridgeAmount * 10000n) / leg2Price;

  // Validate CP2 has enough
  const cp2Remaining = cp2SellOrder.quantity - cp2SellOrder.filled;
  if (leg2FillQty > cp2Remaining) {
    log('CROSS', `CP2 doesn't have enough quantity (need ${leg2FillQty}, have ${cp2Remaining})`);
    return false;
  }

  if (leg2FillQty <= 0n) {
    log('CROSS', `Invalid leg2 fill quantity: ${leg2FillQty}`);
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  log('CROSS', `Settling cross-pair match:`);
  log('CROSS', `  User sells: ${leg1FillQty} @ ${leg1Price} (pair ${userSellOrder.pairId})`);
  log('CROSS', `  CP1 buys: ALEO with ${usdcxFromLeg1} USDCx`);
  log('CROSS', `  CP2 sells: ${leg2FillQty} @ ${leg2Price} (pair ${cp2SellOrder.pairId})`);
  log('CROSS', `  Bridge: ${bridgeAmount} USDCx (fees: ${settlerFee} settler, ${protocolFee} protocol)`);
  log('CROSS', `  User receives: ${leg2FillQty} of token ${leg2BaseTokenId}`);

  if (!userSellOrder.plaintext || !cp1BuyOrder.plaintext || !cp2SellOrder.plaintext) {
    err('CROSS', 'Missing plaintext - cannot settle');
    return false;
  }

  try {
    let treasuryAddr = process.env.TREASURY_ADDR;
    if (!treasuryAddr) {
      const treasuryRaw = await getMapping(CONFIG.programId, 'treasury', 'true');
      if (treasuryRaw && treasuryRaw !== 'null') {
        const addrMatch = treasuryRaw.match(/aleo1[a-z0-9]+/);
        if (addrMatch) treasuryAddr = addrMatch[0];
      }
    }

    if (!treasuryAddr) {
      err('CROSS', 'Treasury address not found');
      return false;
    }

    const cmd = [
      `${SNARKOS} developer execute`,
      `--private-key "${CONFIG.privateKey}"`,
      `--query "${CONFIG.queryEndpoint}"`,
      `--broadcast "${CONFIG.broadcastEndpoint}"`,
      `--network ${CONFIG.networkId}`,
      CONFIG.programId,
      'settle_cross_pair',
      `"${userSellOrder.plaintext}"`,
      `"${cp1BuyOrder.plaintext}"`,
      `"${cp2SellOrder.plaintext}"`,
      `${leg1FillQty}u128`,
      `${leg1Price}u64`,
      `${leg2FillQty}u128`,
      `${leg2Price}u64`,
      leg2BaseTokenId,
      `${timestamp}u32`,
      treasuryAddr,
    ].join(' ');

    log('CROSS', `Executing settle_cross_pair via snarkos...`);
    const output = execSync(cmd + ' 2>&1', { timeout: 300000, encoding: 'utf8' });
    const txId = output.match(/at1[a-z0-9]{58}/)?.[0] || 'unknown';

    log('CROSS', `Cross-pair settlement successful! TX: ${txId}`);

    // Record trade
    recentTrades.unshift({
      type: 'cross_pair',
      userOrderId: userSellOrder.orderId,
      cp1OrderId: cp1BuyOrder.orderId,
      cp2OrderId: cp2SellOrder.orderId,
      leg1Quantity: leg1FillQty.toString(),
      leg1Price: leg1Price.toString(),
      leg2Quantity: leg2FillQty.toString(),
      leg2Price: leg2Price.toString(),
      bridgeAmount: bridgeAmount.toString(),
      timestamp: new Date().toISOString(),
      txId,
    });
    if (recentTrades.length > MAX_TRADES) recentTrades.pop();

    // Mark as settled if fully filled
    const userRemaining = userSellOrder.quantity - userSellOrder.filled;
    const cp1Remaining = cp1BuyOrder.quantity - cp1BuyOrder.filled;
    const cp2RemainingAfter = cp2Remaining - leg2FillQty;

    if (leg1FillQty >= userRemaining) {
      settledOrderIds.add(userSellOrder.orderId);
    }
    if (leg1FillQty >= cp1Remaining) {
      settledOrderIds.add(cp1BuyOrder.orderId);
    }
    if (cp2RemainingAfter <= 0n) {
      settledOrderIds.add(cp2SellOrder.orderId);
    }
    saveState();

    return true;
  } catch (e) {
    const msg = (e.stdout || '') + (e.stderr || '') || e.message;
    err('CROSS', `Failed: ${msg.substring(0, 400)}`);
    return false;
  }
}

// Helper to fetch pair info from chain
async function getPairInfo(pairId) {
  try {
    const raw = await getMapping(CONFIG.programId, 'token_pairs', `${pairId}u64`);
    if (!raw || raw === 'null') return null;

    // Parse the TokenPair struct from mapping response
    // Format: { base_token_id: 0field, quote_token_id: 7000field, tick_size: 100u64, is_active: true }
    const baseMatch = raw.match(/base_token_id:\s*([^\s,}]+)/);
    const quoteMatch = raw.match(/quote_token_id:\s*([^\s,}]+)/);
    const isActiveMatch = raw.match(/is_active:\s*(true|false)/);

    return {
      pairId,
      baseTokenId: baseMatch ? baseMatch[1] : null,
      quoteTokenId: quoteMatch ? quoteMatch[1] : null,
      isActive: isActiveMatch ? isActiveMatch[1] === 'true' : false,
    };
  } catch (e) {
    err('PAIR', `Failed to get pair ${pairId}: ${e.message}`);
    return null;
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

  // Determine which cancel function to use based on token IDs
  // - cancel_buy_order: Refund token_registry tokens
  // - cancel_buy_order_usdcx: Refund USDCx (quote token)
  // - cancel_sell_order: Refund ALEO (base token)
  // - cancel_sell_order_usdcx: Refund USDCx (base token)
  let cancelFn;
  if (order.isBuy) {
    // Buy order: refund quote token
    cancelFn = order.quoteTokenId === USDCX_TOKEN_ID
      ? 'cancel_buy_order_usdcx'
      : 'cancel_buy_order';
  } else {
    // Sell order: refund base token
    // For USDCx base, we'd need pair info; for now assume ALEO base unless explicitly marked
    // TODO: Add baseTokenId to order parsing for proper routing
    cancelFn = 'cancel_sell_order';
  }

  log('CANCEL', `Processing cancellation for ${order.isBuy ? 'buy' : 'sell'} order using ${cancelFn}: ${order.orderId.substring(0, 20)}...`);

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
    pairStats.clear();

    // Group orders by pairId: Map<pairId, { buys: [], sells: [] }>
    const ordersByPair = new Map();

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

      // Group by pairId
      const pairKey = order.pairId.toString();
      if (!ordersByPair.has(pairKey)) {
        ordersByPair.set(pairKey, { buys: [], sells: [] });
      }
      const pairOrders = ordersByPair.get(pairKey);
      if (order.isBuy) {
        pairOrders.buys.push(order);
      } else {
        pairOrders.sells.push(order);
      }
    }

    // Process each pair: sort, compute stats, and match
    let totalBids = 0;
    let totalAsks = 0;
    let matchCount = 0;

    for (const [pairKey, { buys, sells }] of ordersByPair) {
      // Sort orders for this pair
      buys.sort((a, b) => Number(b.price - a.price));   // DESC - best bid first
      sells.sort((a, b) => Number(a.price - b.price)); // ASC - best ask first

      totalBids += buys.length;
      totalAsks += sells.length;

      // Compute pair stats (best bid/ask for frontend)
      const bestBid = buys.length > 0 ? buys[0] : null;
      const bestAsk = sells.length > 0 ? sells[0] : null;

      const stats = {
        pairId: pairKey,
        bestBid: bestBid ? {
          price: bestBid.price.toString(),
          quantity: (bestBid.quantity - bestBid.filled).toString(),
        } : null,
        bestAsk: bestAsk ? {
          price: bestAsk.price.toString(),
          quantity: (bestAsk.quantity - bestAsk.filled).toString(),
        } : null,
        bidCount: buys.length,
        askCount: sells.length,
        spread: (bestBid && bestAsk) ? (bestAsk.price - bestBid.price).toString() : null,
        midPrice: (bestBid && bestAsk) ? ((bestBid.price + bestAsk.price) / 2n).toString() : null,
        updatedAt: new Date().toISOString(),
      };
      pairStats.set(pairKey, stats);

      // Log pair stats
      log('SCAN', `Pair ${pairKey}: ${buys.length} bids, ${sells.length} asks`);
      if (bestBid) log('SCAN', `  Best bid: ${bestBid.price} (qty: ${bestBid.quantity - bestBid.filled})`);
      if (bestAsk) log('SCAN', `  Best ask: ${bestAsk.price} (qty: ${bestAsk.quantity - bestAsk.filled})`);
      if (stats.spread) log('SCAN', `  Spread: ${stats.spread} | Mid: ${stats.midPrice}`);

      // Match crossing orders within this pair
      for (const buyOrder of buys) {
        for (const sellOrder of sells) {
          // Check crossing condition
          if (buyOrder.price < sellOrder.price) continue;
          if (buyOrder.quoteTokenId !== sellOrder.quoteTokenId) continue;

          // Check remaining quantities
          const buyRemaining = buyOrder.quantity - buyOrder.filled;
          const sellRemaining = sellOrder.quantity - sellOrder.filled;
          if (buyRemaining <= 0n || sellRemaining <= 0n) continue;

          log('MATCH', `Found crossing orders in pair ${pairKey}:`);
          log('MATCH', `  Buy:  ${buyOrder.orderId.substring(0, 20)}... @ ${buyOrder.price}`);
          log('MATCH', `  Sell: ${sellOrder.orderId.substring(0, 20)}... @ ${sellOrder.price}`);

          const success = await settleMatch(buyOrder, sellOrder);
          if (success) {
            matchCount++;
            await new Promise(r => setTimeout(r, 5000)); // pause between settlements
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CROSS-PAIR MATCHING
    // Look for cross-pair swap opportunities via USDCx bridge
    // User sells on leg1 (e.g., ALEO/USDCx) → receives from leg2 (e.g., TKNB/USDCx)
    // ═══════════════════════════════════════════════════════════════

    // Find all USDCx pairs (quote_token_id === 7000field)
    const usdcxPairs = [];
    for (const [pairKey, orders] of ordersByPair) {
      const sampleOrder = orders.buys[0] || orders.sells[0];
      if (sampleOrder && sampleOrder.quoteTokenId === USDCX_TOKEN_ID) {
        usdcxPairs.push({ pairKey, pairId: BigInt(pairKey), orders });
      }
    }

    if (usdcxPairs.length >= 2) {
      log('CROSS', `Found ${usdcxPairs.length} USDCx pairs - checking for cross-pair opportunities`);

      // For each pair, look for sell orders that could be cross-pair matched
      for (const leg1 of usdcxPairs) {
        for (const leg2 of usdcxPairs) {
          // Don't match a pair with itself
          if (leg1.pairKey === leg2.pairKey) continue;

          // For each sell order on leg1
          for (const userSellOrder of leg1.orders.sells) {
            const userRemaining = userSellOrder.quantity - userSellOrder.filled;
            if (userRemaining <= 0n) continue;

            // Find a matching buy order on leg1 (counterparty 1)
            for (const cp1BuyOrder of leg1.orders.buys) {
              // Check price crossing
              if (cp1BuyOrder.price < userSellOrder.price) continue;

              const cp1Remaining = cp1BuyOrder.quantity - cp1BuyOrder.filled;
              if (cp1Remaining <= 0n) continue;

              // Find a matching sell order on leg2 (counterparty 2)
              for (const cp2SellOrder of leg2.orders.sells) {
                const cp2Remaining = cp2SellOrder.quantity - cp2SellOrder.filled;
                if (cp2Remaining <= 0n) continue;

                // Calculate if the cross-pair trade is viable
                const leg1FillQty = userRemaining < cp1Remaining ? userRemaining : cp1Remaining;
                const leg1Price = (userSellOrder.price + cp1BuyOrder.price) / 2n;
                const usdcxFromLeg1 = (leg1FillQty * leg1Price) / 10000n;

                // Deduct fees from bridge amount
                const settlerFee = (usdcxFromLeg1 * 10n) / 10000n;
                const protocolFee = (usdcxFromLeg1 * 5n) / 10000n;
                const bridgeAmount = usdcxFromLeg1 - settlerFee - protocolFee;

                // Calculate how much leg2 base token user can get
                const leg2Price = cp2SellOrder.price;
                if (leg2Price <= 0n) continue;

                const leg2FillQty = (bridgeAmount * 10000n) / leg2Price;

                // Check if CP2 has enough
                if (leg2FillQty <= 0n || leg2FillQty > cp2Remaining) continue;

                // We found a valid cross-pair match!
                log('CROSS', `Found cross-pair opportunity:`);
                log('CROSS', `  Leg1 (pair ${leg1.pairKey}): User sell @ ${userSellOrder.price} ↔ CP1 buy @ ${cp1BuyOrder.price}`);
                log('CROSS', `  Leg2 (pair ${leg2.pairKey}): CP2 sell @ ${cp2SellOrder.price}`);
                log('CROSS', `  Bridge: ${bridgeAmount} USDCx → ${leg2FillQty} tokens`);

                // Get leg2 pair info to determine base token
                const leg2PairInfo = await getPairInfo(leg2.pairId);
                if (!leg2PairInfo || !leg2PairInfo.baseTokenId) {
                  err('CROSS', `Could not get pair info for leg2 (pair ${leg2.pairKey})`);
                  continue;
                }

                const success = await settleCrossPair(
                  userSellOrder,
                  cp1BuyOrder,
                  cp2SellOrder,
                  leg2PairInfo.baseTokenId
                );

                if (success) {
                  matchCount++;
                  log('CROSS', `Cross-pair match successful!`);
                  await new Promise(r => setTimeout(r, 5000));
                }
              }
            }
          }
        }
      }
    }

    log('SCAN', `Order book total: ${totalBids} bids, ${totalAsks} asks across ${ordersByPair.size} pair(s)`);

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
// HTTP API SERVER (Privacy Preserving with Price Guidance)
// ═══════════════════════════════════════════════════════════════
// Note: This is a PRIVATE orderbook. Individual order details are NOT exposed.
// Users query their own records directly from wallet using requestRecords().
// The keeper exposes:
//   - Health/stats for monitoring
//   - Best bid/ask per pair (aggregate) for optimal order placement

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

    // GET /api/pairs - Best bid/ask prices per pair (for optimal order placement)
    // This exposes aggregate price levels without revealing individual orders
    if (req.method === 'GET' && url.pathname === '/api/pairs') {
      const pairs = {};
      for (const [pairId, stats] of pairStats) {
        pairs[pairId] = {
          pairId: stats.pairId,
          bestBid: stats.bestBid,    // { price, quantity } or null
          bestAsk: stats.bestAsk,    // { price, quantity } or null
          bidCount: stats.bidCount,
          askCount: stats.askCount,
          spread: stats.spread,
          midPrice: stats.midPrice,
          updatedAt: stats.updatedAt,
        };
      }
      return json({
        pairs,
        pairCount: pairStats.size,
        lastScanAt,
      });
    }

    // GET /api/pairs/:pairId - Stats for a specific pair
    const pairMatch = url.pathname.match(/^\/api\/pairs\/(\d+)$/);
    if (req.method === 'GET' && pairMatch) {
      const pairId = pairMatch[1];
      const stats = pairStats.get(pairId);
      if (!stats) {
        return json({ error: 'Pair not found', pairId }, 404);
      }
      return json(stats);
    }

    res.writeHead(404); res.end();
  });

  server.listen(CONFIG.apiPort, () => {
    log('API', `Listening on :${CONFIG.apiPort}`);
    log('API', `  GET  /health`);
    log('API', `  GET  /api/stats`);
    log('API', `  GET  /api/pairs          - All pairs with best bid/ask`);
    log('API', `  GET  /api/pairs/:pairId  - Specific pair stats`);
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
