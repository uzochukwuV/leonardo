/**
 * Aleo Blockchain Query Module
 *
 * Uses the Provable v2 API: https://api.provable.com/v2/{network}/...
 *
 * Key endpoints (all confirmed working):
 *   GET /blocks/latest/height              → number
 *   GET /blocks/latest/hash                → string
 *   GET /blocks/height/{height}            → Block object
 *   GET /blocks/hash/{hash}                → Block object
 *   GET /blocks?{range}                    → Block[]
 *   GET /blocks/find/blockHash/{txId}      → block hash string
 *   GET /transactions/summary/latest       → TransactionSummary[] (last ~500 txs)
 *   GET /transaction/{id}                  → full Transaction object
 *   GET /program/{id}/mapping/{name}/{key} → mapping value string
 *   GET /program/{id}                      → program source
 *   GET /program/{id}/mappings             → string[] of mapping names
 */

import { config } from './config';

const API_BASE = config.ALEO_API_BASE.replace(/\/+$/, '');

// ─── Transport ────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${API_BASE}${path}`);
  return res.json() as Promise<T>;
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${API_BASE}${path}`);
  return res.text();
}

// ─── Provable v2 types ────────────────────────────────────────────────────────

/** Flat transaction summary returned by /transactions/summary/latest */
export interface TransactionSummary {
  id: string;
  fee: number;
  status: 'Accepted' | 'Rejected' | string;
  block_height: number;
  block_timestamp: string; // unix seconds as string
  block_hash: string;
  transaction_type: 'Execute' | 'Deploy' | string;
  program_id: string | null;
  function_id: string | null;
}

// ─── Block queries ────────────────────────────────────────────────────────────

export async function getLatestHeight(): Promise<number> {
  const data = await fetchJson<any>('/blocks/latest/height');
  return typeof data === 'number' ? data : Number(data);
}

export async function getLatestHash(): Promise<string> {
  const data = await fetchJson<any>('/blocks/latest/hash');
  return typeof data === 'string' ? data : String(data);
}

export async function getBlock(blockHeight: number) {
  return fetchJson<any>(`/blocks/height/${blockHeight}`);
}

export async function getBlockByHash(blockHash: string) {
  return fetchJson<any>(`/blocks/hash/${blockHash}`);
}

/**
 * Find the block hash that contains a given transaction ID.
 * v2 route: /blocks/find/blockHash/{txId}
 */
export async function getBlockHashByTxId(txId: string): Promise<string> {
  const data = await fetchJson<any>(`/blocks/find/blockHash/${txId}`);
  return typeof data === 'string' ? data : String(data);
}

/**
 * Fetch a range of blocks.
 * v2 route: /blocks?start={s}&end={e}  (max 50 per request)
 */
export async function getBlockRange(start: number, end: number) {
  const count = end - start;
  if (count <= 0) return [];
  // v2 supports ?start=&end= query params for range
  try {
    return await fetchJson<any[]>(`/blocks?start=${start}&end=${Math.min(end, start + 49)}`);
  } catch {
    // Fallback: individual requests
    const blocks: any[] = [];
    for (let h = start; h <= end; h++) {
      try { blocks.push(await getBlock(h)); } catch { /* skip */ }
    }
    return blocks;
  }
}

export function getBlockMetadata(block: any) {
  const meta = block?.header?.metadata ?? block?.metadata ?? block;
  return {
    height: meta.height ?? block.height,
    blockHash: block.block_hash ?? block.hash ?? '',
    timestamp: meta.timestamp ?? block.block_timestamp ?? 0,
    transactions: block.transactions ?? [],
  };
}

// ─── Transaction queries ──────────────────────────────────────────────────────

/**
 * Full transaction object by ID.
 * v2 route: /transaction/{id}
 */
export async function getTransaction(txId: string) {
  return fetchJson<any>(`/transaction/${txId}`);
}

/**
 * Recent transaction summaries (last ~500).
 * v2 route: /transactions/summary/latest
 * Returns: TransactionSummary[] with program_id, function_id, status, block_height.
 */
export async function getRecentTransactionSummaries(): Promise<TransactionSummary[]> {
  return fetchJson<TransactionSummary[]>('/transactions/summary/latest');
}

/**
 * Filter recent transaction summaries by program and optional function.
 * Uses /transactions/summary/latest then filters client-side.
 */
export async function getTransactionsByProgram(
  programId: string,
  functionId?: string,
  limit = 200
): Promise<TransactionSummary[]> {
  const all = await getRecentTransactionSummaries();
  return all
    .filter((tx) => {
      if (tx.program_id !== programId) return false;
      if (functionId && tx.function_id !== functionId) return false;
      if (tx.status === 'Rejected') return false;
      return true;
    })
    .slice(0, limit);
}

/**
 * Extract transitions from a full transaction object.
 * Works for Execute transactions; Deploy transactions have no transitions.
 */
export async function getTransactionTransitions(txId: string) {
  const tx = await getTransaction(txId);
  return tx?.execution?.transitions ?? tx?.transitions ?? [];
}

// ─── Program queries ──────────────────────────────────────────────────────────

export async function getProgram(programId: string) {
  return fetchText(`/program/${programId}`);
}

export async function getProgramMappingNames(programId: string): Promise<string[]> {
  return fetchJson<string[]>(`/program/${programId}/mappings`);
}

/**
 * Get a mapping value.
 * v2 route: /program/{id}/mapping/{name}/{key}
 * Returns the Leo literal as a plain string (may be quoted JSON string).
 */
export async function getProgramMappingValue(
  programId: string,
  mappingName: string,
  key: string
): Promise<string> {
  const text = await fetchText(
    `/program/${programId}/mapping/${mappingName}/${encodeURIComponent(key)}`
  );
  // v2 may return a JSON-encoded string (with surrounding quotes) — unwrap it
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'string' ? parsed : text;
  } catch {
    return text;
  }
}

// Alias for struct mappings — same endpoint, callers parse the Leo literal
export const getProgramMappingPlaintext = getProgramMappingValue;

// ─── Contract-specific helpers ────────────────────────────────────────────────

export async function getOrderbookMappingNames() {
  return getProgramMappingNames(config.CONTRACT_PROGRAM_ID);
}

export async function getOrderbookMapping(
  mappingName: string,
  key: string
): Promise<string | null> {
  try {
    return await getProgramMappingValue(config.CONTRACT_PROGRAM_ID, mappingName, key);
  } catch {
    return null;
  }
}

export async function getOrderbookMappingPlaintext(mappingName: string, key: string) {
  try {
    return await getProgramMappingPlaintext(config.CONTRACT_PROGRAM_ID, mappingName, key);
  } catch {
    return null;
  }
}
