/**
 * Aleo Blockchain Service
 * Reads on-chain state from the real contract mappings:
 *   - token_pairs:     u64 => TokenPair
 *   - tick_registry:   field => TickInfo
 *   - escrow_registry: field => EscrowInfo
 *   - total_escrowed:  field => u128
 *   - order_counter:   bool => u64
 *
 * Uses aleo-network-query (AleoNetworkClient) for mapping/block/transaction queries.
 */

import { config } from './config';
import {
  getOrderbookMapping,
  getTransaction as getTxFromNetwork,
  getLatestHeight,
  getTransactionsByProgram,
  getTransactionTransitions,
} from './aleo-network-query';

const BASE_URL = config.ALEO_API_BASE;
const PROGRAM = config.CONTRACT_PROGRAM_ID;

function qlog(...args: any[]) {
  if (config.DEBUG_QUERIES) {
    // eslint-disable-next-line no-console
    console.log('[aleo-query]', ...args);
  }
}

// ─── On-chain struct shapes (after parsing) ──────────────────────────────────

export interface OnChainTokenPair {
  pair_id: number;
  base_token_id: string;   // field literal, e.g. "12345field"
  quote_token_id: string;
  tick_size: number;
  active: boolean;
}

export interface OnChainTokenMetadata {
  token_id: string;
  name: string;           // Decoded from u128
  symbol: string;         // Decoded from u128
  decimals: number;
  supply: bigint;
  max_supply: bigint;
  admin: string;
  external_authorization_required: boolean;
  external_authorization_party: string;
}

export interface OnChainTickInfo {
  token_pair: number;
  tick_id: number;
  order_count: number;
  total_volume_settled: bigint;
  last_updated: number;
}

export interface OnChainEscrowInfo {
  depositor: string;
  token_id: string;
  amount: bigint;
  order_tick_key: string;
}

// ─── Transition output shape (from explorer transitions API) ─────────────────

export interface RecentTrade {
  txId: string;
  tokenPair: number;
  quantity: bigint;
  price: number;       // basis points
  isBuy: boolean;
  timestamp: number;
  blockHeight: number;
}

// ─── Leo literal parser ───────────────────────────────────────────────────────
// Parses Leo struct strings like:
//   "{token_pair: 1u64, tick_id: 200u64, order_count: 3u32, ...}"

function parseLeoValue(raw: string): Record<string, string> {
  // Strip outer braces and whitespace
  const inner = raw.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
  const result: Record<string, string> = {};
  // Split on ", " but only at top-level (no nested structs in our mappings)
  const parts = inner.split(/,\s*/);
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    result[key] = val;
  }
  return result;
}

function parseU64(v: string): number {
  return parseInt(v.replace('u64', ''), 10);
}
function parseU32(v: string): number {
  return parseInt(v.replace('u32', ''), 10);
}
function parseU128(v: string): bigint {
  return BigInt(v.replace('u128', ''));
}
function parseBool(v: string): boolean {
  return v.trim() === 'true';
}
function parseField(v: string): string {
  return v.trim(); // keep the "12345field" literal — matches contract input format
}

// ─── Low-level mapping fetch ──────────────────────────────────────────────────
// Uses AleoNetworkClient via aleo-network-query.

async function fetchMappingValue(
  mappingName: string,
  key: string
): Promise<string | null> {
  try {
    qlog('mapping:get', { program: PROGRAM, mappingName, key });
    const value = await getOrderbookMapping(mappingName, key);
    if (!value) return null;
    // SDK may return raw string or quoted; normalize
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      try {
        return JSON.parse(value) as string;
      } catch {
        return value;
      }
    }
    return value;
  } catch {
    // Fallback: raw fetch for APIs that diverge from SDK (e.g. some explorers)
    try {
      qlog('mapping:fallback_fetch', { url: `${BASE_URL}/program/${PROGRAM}/mapping/${mappingName}/${key}` });
      const res = await fetch(
        `${BASE_URL}/program/${PROGRAM}/mapping/${mappingName}/${encodeURIComponent(key)}`
      );
      if (!res.ok) return null;
      const text = await res.text();
      try {
        return JSON.parse(text) as string;
      } catch {
        return text;
      }
    } catch {
      return null;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a TokenPair from the `token_pairs` mapping.
 * Key is the pair ID as a u64 Leo literal, e.g. "1u64".
 */
export async function getTokenPairOnChain(
  pairId: number
): Promise<OnChainTokenPair | null> {
  const raw = await fetchMappingValue('token_pairs', `${pairId}u64`);
  if (!raw) return null;
  try {
    const fields = parseLeoValue(raw);
    return {
      pair_id: parseU64(fields['pair_id']),
      base_token_id: parseField(fields['base_token_id']),
      quote_token_id: parseField(fields['quote_token_id']),
      tick_size: parseU64(fields['tick_size']),
      active: parseBool(fields['active']),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch TickInfo from `tick_registry`.
 * Key is a BHP256 hash field — callers pass it as a hex/field string.
 * To compute the tick key off-chain, use `computeTickKey()` below.
 */
export async function getTickInfo(
  tickKey: string
): Promise<OnChainTickInfo | null> {
  const raw = await fetchMappingValue('tick_registry', tickKey);
  if (!raw) return null;
  try {
    const fields = parseLeoValue(raw);
    return {
      token_pair: parseU64(fields['token_pair']),
      tick_id: parseU64(fields['tick_id']),
      order_count: parseU32(fields['order_count']),
      total_volume_settled: parseU128(fields['total_volume_settled']),
      last_updated: parseU32(fields['last_updated']),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch EscrowInfo from `escrow_registry`.
 * Key is the same tick_key field used for the escrow slot.
 */
export async function getEscrowInfo(
  tickKey: string
): Promise<OnChainEscrowInfo | null> {
  const raw = await fetchMappingValue('escrow_registry', tickKey);
  if (!raw) return null;
  try {
    const fields = parseLeoValue(raw);
    return {
      depositor: fields['depositor'].trim(),
      token_id: parseField(fields['token_id']),
      amount: parseU128(fields['amount']),
      order_tick_key: parseField(fields['order_tick_key']),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch total escrowed amount for a (token_id, depositor) key.
 * Key format matches `total_escrowed` mapping key used in the contract.
 * For now callers pass the raw field key.
 */
export async function getTotalEscrowed(key: string): Promise<bigint> {
  const raw = await fetchMappingValue('total_escrowed', key);
  if (!raw) return BigInt(0);
  try {
    return parseU128(raw.trim());
  } catch {
    return BigInt(0);
  }
}

/**
 * Fetch the current global order counter.
 * Key is `true` (the only key used in `order_counter: bool => u64`).
 */
export async function getOrderCounter(): Promise<number> {
  const raw = await fetchMappingValue('order_counter', 'true');
  if (!raw) return 0;
  try {
    return parseU64(raw.trim());
  } catch {
    return 0;
  }
}

// ─── Order book depth (tick range sweep) ─────────────────────────────────────

export interface TickDepthEntry {
  tickId: number;
  priceUsd: number;
  orderCount: number;
  totalVolumeSettled: bigint;
}

/**
 * Build an order book depth view for a pair by querying a range of tick IDs.
 * tick_registry key = BHP256_hash_to_field({ token_pair, tick_id }) but we
 * cannot compute BHP256 in the browser without the Aleo SDK.
 *
 * Instead this function queries recent transitions and reconstructs depth from
 * the emitted `submit_order_with_escrow` calls (public inputs tick_lower /
 * tick_upper are visible on-chain).
 *
 * Returns ticks sorted by price ascending.
 */
export async function fetchOrderBookDepth(
  pairId: number,
  minTick: number,
  maxTick: number
): Promise<{ bids: TickDepthEntry[]; asks: TickDepthEntry[] }> {
  qlog('orderbook:depth:start', { pairId, minTick, maxTick });
  const transitions = await fetchProgramTransitions(500, 'submit_order_with_escrow');
  qlog('orderbook:depth:transitions', { count: transitions.length });
  return transitionsToDepth(transitions, pairId, minTick, maxTick);
}

/**
 * Parse submit_order_with_escrow transitions into bids/asks depth entries.
 * Public inputs layout (main.leo):
 *   [0] token_pair: u64
 *   [1] is_buy: bool
 *   [2] tick_lower: u64
 *   [3] tick_upper: u64
 *   [4] timestamp: u32
 */
export function transitionsToDepth(
  transitions: any[],
  pairId: number,
  minTick: number,
  maxTick: number
): { bids: TickDepthEntry[]; asks: TickDepthEntry[] } {
  const tickSize = config.TICK_SIZE;
  const tickCounts: Record<number, { buys: number; sells: number }> = {};

  for (const tx of transitions) {
    // inputs is already extracted as string[] by fetchProgramTransitions
    const inputs: string[] = tx.inputs ?? [];

    // Strip Leo type suffix and parse
    const rawPair = String(inputs[0] ?? '').replace(/u64$/i, '').trim();
    const parsedPair = rawPair ? parseInt(rawPair, 10) : -1;

    if (isNaN(parsedPair) || parsedPair !== pairId) continue;

    const isBuy = String(inputs[1] ?? '').trim() === 'true';
    const tLower = parseInt(String(inputs[2] ?? '0').replace(/u64$/i, '').trim(), 10);
    const tUpper = parseInt(String(inputs[3] ?? '0').replace(/u64$/i, '').trim(), 10);

    if (isNaN(tLower) || isNaN(tUpper) || tUpper < tLower) continue;

    for (let t = tLower; t <= Math.min(tUpper, maxTick); t++) {
      if (t < minTick) continue;
      if (!tickCounts[t]) tickCounts[t] = { buys: 0, sells: 0 };
      if (isBuy) tickCounts[t].buys++;
      else tickCounts[t].sells++;
    }
  }

  const bids: TickDepthEntry[] = [];
  const asks: TickDepthEntry[] = [];

  for (const [tickStr, counts] of Object.entries(tickCounts)) {
    const tickId = parseInt(tickStr, 10);
    const priceUsd = (tickId * tickSize) / 10000;
    const base: TickDepthEntry = { tickId, priceUsd, orderCount: 0, totalVolumeSettled: BigInt(0) };
    if (counts.buys > 0) bids.push({ ...base, orderCount: counts.buys });
    if (counts.sells > 0) asks.push({ ...base, orderCount: counts.sells });
  }

  bids.sort((a, b) => b.priceUsd - a.priceUsd);
  asks.sort((a, b) => a.priceUsd - b.priceUsd);

  qlog('orderbook:depth:done', { bids: bids.length, asks: asks.length });
  return { bids, asks };
}

// ─── Transitions / recent trades ─────────────────────────────────────────────

/**
 * Fetch recent transitions for this program.
 *
 * Uses Provable v2 API:
 *   GET /transactions/summary/latest  → TransactionSummary[] (last ~500 txs, all programs)
 *   GET /transaction/{id}             → full tx with execution.transitions
 *
 * Strategy:
 *  1. Filter summaries by program_id (fast, no per-block requests).
 *  2. For each matching summary, fetch the full transaction to get transitions
 *     with public inputs.
 *  3. Limit to `limit` transitions to stay within rate limits.
 */
export async function fetchProgramTransitions(
  limit = 50,
  functionId?: string
): Promise<any[]> {
  try {
    qlog('transitions:v2:start', { program: PROGRAM, limit, functionId });

    // Step 1: get matching transaction summaries
    const summaries = await getTransactionsByProgram(PROGRAM, functionId, limit);
    qlog('transitions:v2:summaries', { count: summaries.length });

    if (summaries.length === 0) return [];

    // Step 2: fetch full transitions for each matching tx (in parallel, bounded)
    const transitions: any[] = [];

    await Promise.all(
      summaries.slice(0, limit).map(async (summary) => {
        try {
          const txTransitions = await getTransactionTransitions(summary.id);
          for (const t of txTransitions) {
            if (t?.program !== PROGRAM && t?.program_id !== PROGRAM) continue;
            const inputs = Array.isArray(t?.inputs)
              ? t.inputs.map((i: any) => i?.value ?? i ?? '')
              : [];
            const outputs = Array.isArray(t?.outputs)
              ? t.outputs.map((o: any) => o?.value ?? o ?? '')
              : [];

            transitions.push({
              ...t,
              function: t.function ?? t.function_id ?? summary.function_id ?? '',
              inputs,
              outputs,
              transaction_id: summary.id,
              block_height: summary.block_height,
              block_timestamp: parseInt(summary.block_timestamp, 10),
              finalize: [],
            });
          }
        } catch {
          // Skip transactions we can't fetch (non-fatal)
        }
      })
    );

    qlog('transitions:v2:done', { found: transitions });
    return transitions;
  } catch {
    return [];
  }
}

/**
 * Parse settle_match_public transitions into human-readable recent trades.
 *
 * settle_match_public(
 *   private buy_order:  TickOrder,   ← not visible in inputs
 *   private sell_order: TickOrder,   ← not visible in inputs
 *   public  timestamp:  u32          ← only public input
 * )
 *
 * Because order records are private, tick range and pair come from the
 * finalize arguments stored in the transition's `finalize` array if available,
 * or we reconstruct from whatever the explorer exposes.
 */
export async function fetchRecentTrades(
  pairId: number,
  limit = 20
): Promise<RecentTrade[]> {
  qlog('trades:start', { pairId, limit });
  const transitions = await fetchProgramTransitions(200, 'settle_match_public');
  qlog('trades:transitions', { count: transitions.length });
  const trades: RecentTrade[] = [];

  for (const tx of transitions) {
    const fn: string = tx.function ?? tx.function_name ?? '';
    if (fn !== 'settle_match_public' && fn !== 'settle_match_public_with_keys') continue;

    // Public inputs: only `timestamp` is public (u32).
    // The finalize call stores SettleInfo + TickRange which may be in tx.finalize
    const inputs: string[] = tx.inputs ?? [];
    const finalizeArgs: string[] = tx.finalize ?? [];

    // Try to get timestamp: public u32 input first, then block_timestamp from v2 summary
    const timestampRaw =
      inputs.find((i) => typeof i === 'string' && i.includes('u32')) ??
      finalizeArgs.find((i) => typeof i === 'string' && i.includes('u32'));
    const timestamp = timestampRaw
      ? parseInt(timestampRaw.replace('u32', ''), 10)
      : (tx.block_timestamp ?? 0);

    // SettleInfo is packed into finalize — token_pair is first u64 there if exposed
    const tokenPairRaw = finalizeArgs.find((i) => typeof i === 'string' && i.includes('u64'));
    const parsedPair = tokenPairRaw
      ? parseInt(tokenPairRaw.replace('u64', ''), 10)
      : pairId; // assume pairId if not visible

    if (parsedPair !== pairId) continue;

    // Price: not directly visible since buy_order.limit_price is private.
    // Use block_height as a loose proxy for ordering; price shown as unknown.
    trades.push({
      txId: tx.transaction_id ?? tx.id ?? '',
      tokenPair: parsedPair,
      quantity: BigInt(0),     // private — not visible on-chain
      price: 0,         // private — not visible on-chain
      isBuy: false,     // settlement is bilateral
      timestamp,
      blockHeight: tx.block_height ?? 0,
    });

    if (trades.length >= limit) break;
  }

  qlog('trades:done', { trades: trades.length });
  return trades;
}

// ─── Transaction status ───────────────────────────────────────────────────────

export async function getTransactionStatus(
  txId: string
): Promise<'pending' | 'confirmed' | 'failed'> {
  try {
    const tx = await getTxFromNetwork(txId);
    if (!tx) return 'pending';
    const data = tx as unknown as Record<string, unknown>;
    const status = String(data.status ?? '').toLowerCase();
    if (status === 'accepted' || status === 'finalized') return 'confirmed';
    if (status === 'rejected' || status === 'failed') return 'failed';
    return 'pending';
  } catch {
    // Fallback: raw fetch for explorer-style API
    try {
      const res = await fetch(`${BASE_URL}/transaction/${txId}`);
      if (!res.ok) return 'pending';
      const data = await res.json();
      const status = String(data.status ?? '').toLowerCase();
      if (status === 'accepted' || status === 'finalized') return 'confirmed';
      if (status === 'rejected' || status === 'failed') return 'failed';
      return 'pending';
    } catch {
      return 'pending';
    }
  }
}

export async function getLatestBlockHeight(): Promise<number> {
  try {
    // v2: GET /blocks/latest/height → number
    const height = await getLatestHeight();
    return typeof height === 'number' ? height : 0;
  } catch {
    return 0;
  }
}

// ─── v17 Contract Mappings ────────────────────────────────────────────────────

/**
 * Fetch orchestrator address from the `orchestrator` mapping.
 * In v17, key is `true` → address
 */
export async function getOrchestratorAddress(): Promise<string | null> {
  const raw = await fetchMappingValue('orchestrator', 'true');
  if (!raw) return null;
  try {
    // Value is an address like "aleo1..."
    const addr = raw.trim().replace(/"/g, '');
    if (addr.startsWith('aleo1')) return addr;
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch treasury address from the `treasury` mapping.
 * In v17, key is `true` → address
 */
export async function getTreasuryAddress(): Promise<string | null> {
  const raw = await fetchMappingValue('treasury', 'true');
  if (!raw) return null;
  try {
    const addr = raw.trim().replace(/"/g, '');
    if (addr.startsWith('aleo1')) return addr;
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if an address is a registered keeper.
 * In v17, keepers mapping: address → bool
 */
export async function isKeeper(address: string): Promise<boolean> {
  const raw = await fetchMappingValue('keepers', address);
  if (!raw) return false;
  return raw.trim() === 'true';
}

/**
 * Fetch token pair info from `token_pairs` mapping.
 * In v17: TokenPair { base_token_id: field, quote_token_id: field, tick_size: u64, is_active: bool }
 */
export async function getTokenPairInfo(
  pairId: number
): Promise<{
  base_token_id: string;
  quote_token_id: string;
  tick_size: number;
  is_active: boolean;
} | null> {
  qlog('pair:info:fetch', { pairId });
  const raw = await fetchMappingValue('token_pairs', `${pairId}u64`);
  qlog('pair:info:raw', raw);
  if (!raw) return null;
  try {
    const fields = parseLeoValue(raw);
    return {
      base_token_id: parseField(fields['base_token_id'] || '0field'),
      quote_token_id: parseField(fields['quote_token_id'] || '0field'),
      tick_size: parseU64(fields['tick_size'] || '100u64'),
      is_active: parseBool(fields['is_active'] || 'false'),
    };
  } catch {
    return null;
  }
}

/**
 * Get the total number of registered pairs.
 * Uses the pair_count mapping: bool => u64
 */
export async function getPairCount(): Promise<number> {
  const raw = await fetchMappingValue('pair_count', 'true');
  if (!raw) return 0;
  try {
    return parseU64(raw.trim());
  } catch {
    return 0;
  }
}

/**
 * Get pair ID at a specific index (for enumeration).
 * Uses the pair_ids mapping: u64 => u64
 */
export async function getPairIdAtIndex(index: number): Promise<number | null> {
  const raw = await fetchMappingValue('pair_ids', `${index}u64`);
  if (!raw) return null;
  try {
    return parseU64(raw.trim());
  } catch {
    return null;
  }
}

/**
 * Get all registered trading pairs.
 * Enumerates through pair_ids mapping using pair_count.
 */
export async function getAllPairs(): Promise<Array<{
  pair_id: number;
  base_token_id: string;
  quote_token_id: string;
  tick_size: number;
  is_active: boolean;
}>> {
  const count = await getPairCount();
  qlog('pairs:enumerate', { count });

  if (count === 0) return [];

  const pairs: Array<{
    pair_id: number;
    base_token_id: string;
    quote_token_id: string;
    tick_size: number;
    is_active: boolean;
  }> = [];

  // Fetch all pairs in parallel
  const promises = Array.from({ length: count }, async (_, i) => {
    const pairId = await getPairIdAtIndex(i);
    if (pairId === null) return null;

    const pairInfo = await getTokenPairInfo(pairId);
    if (!pairInfo) return null;

    return {
      pair_id: pairId,
      ...pairInfo,
    };
  });

  const results = await Promise.all(promises);
  for (const result of results) {
    if (result) pairs.push(result);
  }

  qlog('pairs:enumerate:done', { found: pairs.length });
  return pairs;
}

/**
 * Fetch trading volume for a pair from `pair_volume` mapping.
 * In v18: pair_volume: u64 → u128
 */
export async function getPairVolume(pairId: number): Promise<bigint> {
  const raw = await fetchMappingValue('pair_volume', `${pairId}u64`);
  if (!raw) return 0n;
  try {
    return parseU128(raw.trim());
  } catch {
    return 0n;
  }
}

// ─── Token Registry Queries ──────────────────────────────────────────────────

/**
 * Decode a u128 value to a string (name/symbol encoding).
 * Aleo stores strings as u128 - we need to decode the bytes.
 */
function decodeU128ToString(value: string): string {
  try {
    // Remove u128 suffix and parse
    const numStr = value.replace(/u128$/i, '').trim();
    const bigVal = BigInt(numStr);

    // Convert to bytes and decode as ASCII
    const bytes: number[] = [];
    let remaining = bigVal;
    while (remaining > 0n) {
      bytes.push(Number(remaining & 0xffn));
      remaining = remaining >> 8n;
    }

    // Filter out null bytes and reverse for correct order
    return bytes
      .filter(b => b > 0 && b < 128)
      .map(b => String.fromCharCode(b))
      .join('');
  } catch {
    return '';
  }
}

/**
 * Fetch token metadata from token_registry.aleo/registered_tokens mapping.
 * Returns token info including name, symbol, decimals.
 *
 * @param tokenId - Token ID as field literal (e.g., "1field", "7002field")
 */
export async function getTokenMetadata(tokenId: string): Promise<OnChainTokenMetadata | null> {
  // Handle native ALEO (0field) specially
  if (tokenId === '0field') {
    return {
      token_id: '0field',
      name: 'Aleo',
      symbol: 'ALEO',
      decimals: 6,
      supply: 0n,
      max_supply: 0n,
      admin: '',
      external_authorization_required: false,
      external_authorization_party: '',
    };
  }

  try {
    qlog('token:metadata:fetch', { tokenId });
    const url = `${BASE_URL}/program/${config.TOKEN_REGISTRY_PROGRAM}/mapping/registered_tokens/${tokenId}`;
    const res = await fetch(url);

    if (!res.ok) {
      qlog('token:metadata:not_found', { tokenId, status: res.status });
      return null;
    }

    const text = await res.text();
    qlog('token:metadata:raw', text);

    // Parse the Leo struct
    const fields = parseLeoValue(text);

    return {
      token_id: parseField(fields['token_id'] || tokenId),
      name: decodeU128ToString(fields['name'] || '0u128'),
      symbol: decodeU128ToString(fields['symbol'] || '0u128'),
      decimals: parseInt(fields['decimals']?.replace(/u8$/i, '') || '6', 10),
      supply: parseU128(fields['supply'] || '0u128'),
      max_supply: parseU128(fields['max_supply'] || '0u128'),
      admin: fields['admin']?.trim() || '',
      external_authorization_required: parseBool(fields['external_authorization_required'] || 'false'),
      external_authorization_party: fields['external_authorization_party']?.trim() || '',
    };
  } catch (err) {
    qlog('token:metadata:error', { tokenId, error: err });
    return null;
  }
}

/**
 * Fetch token metadata for multiple tokens in parallel.
 */
export async function getTokenMetadataBatch(tokenIds: string[]): Promise<Map<string, OnChainTokenMetadata>> {
  const results = new Map<string, OnChainTokenMetadata>();

  const promises = tokenIds.map(async (tokenId) => {
    const metadata = await getTokenMetadata(tokenId);
    if (metadata) {
      results.set(tokenId, metadata);
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Get full pair info including token metadata.
 * Fetches pair from orderbook contract, then fetches token metadata for both tokens.
 */
export async function getFullPairInfo(pairId: number): Promise<{
  pair_id: number;
  base_token_id: string;
  quote_token_id: string;
  tick_size: number;
  is_active: boolean;
  base_token: OnChainTokenMetadata | null;
  quote_token: OnChainTokenMetadata | null;
} | null> {
  const pairInfo = await getTokenPairInfo(pairId);
  if (!pairInfo) return null;

  // Fetch token metadata in parallel
  const [baseToken, quoteToken] = await Promise.all([
    getTokenMetadata(pairInfo.base_token_id),
    getTokenMetadata(pairInfo.quote_token_id),
  ]);

  return {
    pair_id: pairId,
    ...pairInfo,
    base_token: baseToken,
    quote_token: quoteToken,
  };
}

/**
 * Get all pairs with full token metadata.
 */
export async function getAllPairsWithMetadata(): Promise<Array<{
  pair_id: number;
  base_token_id: string;
  quote_token_id: string;
  tick_size: number;
  is_active: boolean;
  base_token: OnChainTokenMetadata | null;
  quote_token: OnChainTokenMetadata | null;
}>> {
  const pairs = await getAllPairs();

  // Collect all unique token IDs
  const tokenIds = new Set<string>();
  for (const pair of pairs) {
    tokenIds.add(pair.base_token_id);
    tokenIds.add(pair.quote_token_id);
  }

  // Fetch all token metadata in parallel
  const tokenMetadata = await getTokenMetadataBatch(Array.from(tokenIds));

  // Combine pair info with token metadata
  return pairs.map(pair => ({
    ...pair,
    base_token: tokenMetadata.get(pair.base_token_id) || null,
    quote_token: tokenMetadata.get(pair.quote_token_id) || null,
  }));
}

// ─── Provable Tokens API ──────────────────────────────────────────────────────

export interface ProvableToken {
  token_id: string;
  token_id_datatype: string | null;
  symbol: string;
  display: string;
  program_name: string;
  decimals: number;
  total_supply: string | null;
  verified: boolean;
  token_icon_url: string | null;
  price: string | null;
  price_change_percentage_24h: string | null;
}

export interface ProvableTokensResponse {
  pagination: {
    limit: number;
    offset: number;
    total_count: number;
    has_next: boolean;
    has_previous: boolean;
  };
  data: ProvableToken[];
}

/**
 * Fetch all available tokens from Provable API.
 * Returns paginated list of testnet tokens.
 */
export async function getProvableTokens(
  limit = 50,
  offset = 0
): Promise<ProvableTokensResponse | null> {
  try {
    qlog('provable:tokens:fetch', { limit, offset });
    const url = `https://api.provable.com/v2/testnet/tokens?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      qlog('provable:tokens:error', { status: res.status });
      return null;
    }

    const data = await res.json();
    qlog('provable:tokens:success', { count: data.data?.length });
    return data as ProvableTokensResponse;
  } catch (err) {
    qlog('provable:tokens:error', err);
    return null;
  }
}

/**
 * Fetch all tokens (handles pagination automatically).
 */
export async function getAllProvableTokens(): Promise<ProvableToken[]> {
  const allTokens: ProvableToken[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await getProvableTokens(limit, offset);
    if (!response || !response.data.length) break;

    allTokens.push(...response.data);

    if (!response.pagination.has_next) break;
    offset += limit;

    // Safety limit
    if (offset > 1000) break;
  }

  return allTokens;
}

/**
 * Format token ID for use in contract calls.
 * Ensures proper field format (e.g., "1field")
 */
export function formatTokenIdForContract(token: ProvableToken): string {
  const tokenId = token.token_id;

  // If it's already a field format or numeric
  if (token.token_id_datatype === 'field') {
    return `${tokenId}field`;
  }

  // For native tokens (credits.aleo), use 0field
  if (token.program_name === 'credits.aleo') {
    return '0field';
  }

  // Default: treat as numeric field
  return `${tokenId}field`;
}

// ─── Keeper Bot API ───────────────────────────────────────────────────────────

export interface KeeperOrderBookResponse {
  bids: Array<{ price: string; quantity: string; trader: string; orderId: string }>;
  asks: Array<{ price: string; quantity: string; trader: string; orderId: string }>;
  spread: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  lastScanAt: string | null;
}

export interface KeeperTradesResponse {
  trades: Array<{
    buyOrderId: string;
    sellOrderId: string;
    buyTrader: string;
    sellTrader: string;
    quantity: string;
    price: string;
    timestamp: string;
  }>;
}

export interface KeeperHealthResponse {
  status: string;
  paused: boolean;
  programId: string;
  orderCount: number;
  buyOrders: number;
  sellOrders: number;
  pendingCancellations: number;
  lastScanAt: string | null;
  lastMatchAt: string | null;
  upSince: string;
}

/**
 * Fetch order book data from keeper bot API
 */
export async function fetchKeeperOrderBook(): Promise<KeeperOrderBookResponse | null> {
  try {
    const res = await fetch(`${config.KEEPER_API_URL}/api/orderbook`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    qlog('keeper:orderbook:error', err);
    return null;
  }
}

/**
 * Fetch recent trades from keeper bot API
 */
export async function fetchKeeperTrades(): Promise<KeeperTradesResponse | null> {
  try {
    const res = await fetch(`${config.KEEPER_API_URL}/api/trades`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    qlog('keeper:trades:error', err);
    return null;
  }
}

/**
 * Fetch keeper bot health status
 */
export async function fetchKeeperHealth(): Promise<KeeperHealthResponse | null> {
  try {
    const res = await fetch(`${config.KEEPER_API_URL}/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    qlog('keeper:health:error', err);
    return null;
  }
}

