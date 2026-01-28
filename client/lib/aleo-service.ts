/**
 * Aleo Blockchain Service
 * Handles querying the Aleo blockchain via the Provable REST API
 */

import { config } from './config';

// --- Types ---

export interface TokenPairOnChain {
  baseTokenId: string;
  quoteTokenId: string;
  tickSize: number;
  active: boolean;
}

export interface TickInfo {
  tickId: number;
  tokenPairId: number;
  buyOrderCount: number;
  sellOrderCount: number;
  lastUpdateHeight: number;
}

export interface TransactionStatus {
  status: 'confirmed' | 'pending' | 'rejected' | 'not_found';
  blockHeight?: number;
  transactionId?: string;
}

// --- Aleo value parsing helpers ---

/**
 * Parse an Aleo struct string returned by the REST API into a JS object.
 * Example input: "{ base_token_id: 12345field, quote_token_id: 67890field, tick_size: 100u64, active: true }"
 */
function parseAleoStruct(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw || typeof raw !== 'string') return result;

  // Remove outer braces and whitespace
  const inner = raw.replace(/^\s*\{/, '').replace(/\}\s*$/, '').trim();
  if (!inner) return result;

  // Split by comma, then parse key: value
  const entries = inner.split(',');
  for (const entry of entries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) continue;
    const key = entry.slice(0, colonIdx).trim();
    const value = entry.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

/**
 * Strip Aleo type suffix from a value string.
 * "100u64" -> 100, "true" -> true, "12345field" -> "12345field"
 */
function parseAleoValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  // Match numeric types: u8, u16, u32, u64, u128, i8, ..., i128
  const numMatch = raw.match(/^(\d+)(u8|u16|u32|u64|u128|i8|i16|i32|i64|i128)$/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return raw;
}

// --- API Client ---

class AleoApiClient {
  private baseUrl: string;
  private programId: string;

  constructor() {
    this.baseUrl = config.API_URL;
    this.programId = config.CONTRACT_PROGRAM_ID;
  }

  /**
   * Raw fetch with error handling and optional retry.
   */
  private async fetchApi(path: string, retries = 1): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        });
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error(`Failed to fetch ${url}`);
  }

  // --- Mapping queries ---

  /**
   * Get a single mapping value by key.
   * Returns the raw string value, or null if not found.
   */
  async getMappingValue(mappingName: string, key: string): Promise<string | null> {
    try {
      const response = await this.fetchApi(
        `/program/${this.programId}/mapping/${mappingName}/${key}`
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        return null;
      }

      const text = await response.text();
      // The API returns the value as a JSON string (quoted) or null
      try {
        const parsed = JSON.parse(text);
        return parsed !== null ? String(parsed) : null;
      } catch {
        return text || null;
      }
    } catch (err) {
      console.error(`[AleoService] Error fetching mapping ${mappingName}/${key}:`, err);
      return null;
    }
  }

  /**
   * Get all mapping names for the program.
   */
  async getMappingNames(): Promise<string[]> {
    try {
      const response = await this.fetchApi(`/program/${this.programId}/mappings`);
      if (!response.ok) return [];
      return await response.json();
    } catch (err) {
      console.error('[AleoService] Error fetching mapping names:', err);
      return [];
    }
  }

  // --- Token pair queries ---

  /**
   * Fetch a token pair from the on-chain registry.
   */
  async getTokenPair(pairId: number): Promise<TokenPairOnChain | null> {
    const raw = await this.getMappingValue('token_pairs', `${pairId}u64`);
    if (!raw) return null;

    const parsed = parseAleoStruct(raw);
    return {
      baseTokenId: parsed.base_token_id || '',
      quoteTokenId: parsed.quote_token_id || '',
      tickSize: typeof parseAleoValue(parsed.tick_size || '0') === 'number'
        ? parseAleoValue(parsed.tick_size || '0') as number : 0,
      active: parseAleoValue(parsed.active || 'false') === true,
    };
  }

  /**
   * Check if a token pair is registered and active.
   */
  async isTokenPairActive(pairId: number): Promise<boolean> {
    const pair = await this.getTokenPair(pairId);
    return pair !== null && pair.active;
  }

  // --- Tick registry queries ---

  /**
   * Fetch tick info for a specific tick key (field element).
   * The tick_registry mapping is keyed by BHP256::hash_to_field(pair + tick_id * 1000000).
   * Since we can't compute BHP256 in the browser without WASM, this method
   * accepts a pre-computed field key.
   */
  async getTickInfo(tickKey: string): Promise<TickInfo | null> {
    const raw = await this.getMappingValue('tick_registry', tickKey);
    if (!raw) return null;

    const parsed = parseAleoStruct(raw);
    return {
      tickId: parseAleoValue(parsed.tick_id || '0') as number,
      tokenPairId: parseAleoValue(parsed.token_pair || '0') as number,
      buyOrderCount: parseAleoValue(parsed.buy_order_count || '0') as number,
      sellOrderCount: parseAleoValue(parsed.sell_order_count || '0') as number,
      lastUpdateHeight: parseAleoValue(parsed.last_update_height || '0') as number,
    };
  }

  /**
   * Get tick volume for a specific tick key.
   */
  async getTickVolume(tickKey: string): Promise<number> {
    const raw = await this.getMappingValue('tick_volumes', tickKey);
    if (!raw) return 0;
    const val = parseAleoValue(raw);
    return typeof val === 'number' ? val : 0;
  }

  // --- Transaction queries ---

  /**
   * Get a transaction by ID.
   */
  async getTransaction(txId: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.fetchApi(`/transaction/${txId}`, 2);
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      console.error(`[AleoService] Error fetching transaction ${txId}:`, err);
      return null;
    }
  }

  /**
   * Check transaction status by trying both confirmed and unconfirmed endpoints.
   */
  async getTransactionStatus(txId: string): Promise<TransactionStatus> {
    try {
      // Try confirmed first
      const confirmedRes = await this.fetchApi(`/transaction/confirmed/${txId}`);
      if (confirmedRes.ok) {
        const data = await confirmedRes.json();
        return {
          status: 'confirmed',
          transactionId: txId,
          blockHeight: data?.block_height,
        };
      }

      // Try unconfirmed (in mempool)
      const unconfirmedRes = await this.fetchApi(`/transaction/unconfirmed/${txId}`);
      if (unconfirmedRes.ok) {
        return { status: 'pending', transactionId: txId };
      }

      // Not found at all - could be propagating
      return { status: 'not_found', transactionId: txId };
    } catch {
      return { status: 'not_found', transactionId: txId };
    }
  }

  // --- Block queries ---

  /**
   * Get the latest block height.
   */
  async getLatestBlockHeight(): Promise<number> {
    try {
      const response = await this.fetchApi('/block/height/latest');
      if (!response.ok) return 0;
      const text = await response.text();
      return parseInt(text, 10) || 0;
    } catch (err) {
      console.error('[AleoService] Error fetching latest block height:', err);
      return 0;
    }
  }

  // --- Program queries ---

  /**
   * Get the program source code.
   */
  async getProgram(): Promise<string | null> {
    try {
      const response = await this.fetchApi(`/program/${this.programId}`);
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  // --- Helper: Explorer URL ---

  /**
   * Build an explorer URL for a transaction.
   */
  getExplorerTxUrl(txId: string): string {
    return `${config.EXPLORER_URL}/transaction/${txId}`;
  }

  /**
   * Build an explorer URL for an address.
   */
  getExplorerAddressUrl(address: string): string {
    return `${config.EXPLORER_URL}/address/${address}`;
  }

  /**
   * Build an explorer URL for the program.
   */
  getExplorerProgramUrl(): string {
    return `${config.EXPLORER_URL}/program/${this.programId}`;
  }
}

// Export singleton
export const aleoService = new AleoApiClient();
