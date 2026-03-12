/**
 * Chain Scanner for Private Orderbook Keeper Bot
 * ===============================================
 * Queries Provable v2 API to fetch:
 *   - Order records (via recent transactions)
 *   - CancellationRequest records (via recent transactions)
 *
 * Uses Provable v2 endpoints:
 *   GET /transactions/summary/latest  → recent transactions
 *   GET /transaction/{id}             → full transaction with transitions
 *   GET /program/{id}/mapping/{name}/{key} → mapping values
 */

import https from 'https';
import http from 'http';

const API_BASE = 'https://api.provable.com/v2/testnet';

// ═══════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════
// PROVABLE V2 API QUERIES
// ═══════════════════════════════════════════════════════════════

export async function getRecentTransactionSummaries() {
  try {
    return await fetchJson(`${API_BASE}/transactions/summary/latest`);
  } catch (err) {
    console.error('Failed to fetch transaction summaries:', err.message);
    return [];
  }
}

export async function getTransaction(txId) {
  try {
    return await fetchJson(`${API_BASE}/transaction/${txId}`);
  } catch (err) {
    console.error(`Failed to fetch transaction ${txId}:`, err.message);
    return null;
  }
}

export async function getProgramMappingValue(programId, mappingName, key) {
  try {
    const url = `${API_BASE}/program/${programId}/mapping/${mappingName}/${encodeURIComponent(key)}`;
    const text = await fetchText(url);
    // v2 may return a JSON-encoded string — unwrap it
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'string' ? parsed : text;
    } catch {
      return text;
    }
  } catch (err) {
    console.error(`Failed to fetch mapping ${mappingName}[${key}]:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// RECORD SCANNING
// ═══════════════════════════════════════════════════════════════

/**
 * Scan recent transactions for Order records.
 * Looks for transitions that output Order records.
 * Returns array of { recordCiphertext, commitment, blockHeight, transactionId, plaintext }
 */
export async function scanOrderRecords(programId, limit = 200) {
  try {
    const summaries = await getRecentTransactionSummaries();
    const orderRecords = [];

    // Filter for transactions from our program
    const relevantTxs = summaries
      .filter(tx => tx.program_id === programId && tx.status === 'Accepted')
      .slice(0, limit);

    for (const summary of relevantTxs) {
      try {
        const tx = await getTransaction(summary.id);
        if (!tx || !tx.execution || !tx.execution.transitions) continue;

        for (const transition of tx.execution.transitions) {
          // Look for Order record outputs
          if (transition.outputs && Array.isArray(transition.outputs)) {
            for (const output of transition.outputs) {
              if (output.type === 'record' && output.record_name === 'Order') {
                orderRecords.push({
                  recordCiphertext: output.record_ciphertext || output.ciphertext,
                  commitment: output.commitment,
                  blockHeight: summary.block_height,
                  transactionId: summary.id,
                  plaintext: output.plaintext || null,
                });
              }
            }
          }
        }
      } catch (err) {
        // Skip transactions we can't fetch
        continue;
      }
    }

    return orderRecords;
  } catch (err) {
    console.error('Order scan failed:', err.message);
    return [];
  }
}

/**
 * Scan recent transactions for CancellationRequest records.
 * Looks for transitions that output CancellationRequest records.
 * Returns array of { recordCiphertext, commitment, blockHeight, transactionId, plaintext }
 */
export async function scanCancellationRequestRecords(programId, limit = 200) {
  try {
    const summaries = await getRecentTransactionSummaries();
    const cancellationRecords = [];

    // Filter for transactions from our program
    const relevantTxs = summaries
      .filter(tx => tx.program_id === programId && tx.status === 'Accepted')
      .slice(0, limit);

    for (const summary of relevantTxs) {
      try {
        const tx = await getTransaction(summary.id);
        if (!tx || !tx.execution || !tx.execution.transitions) continue;

        for (const transition of tx.execution.transitions) {
          // Look for CancellationRequest record outputs
          if (transition.outputs && Array.isArray(transition.outputs)) {
            for (const output of transition.outputs) {
              if (output.type === 'record' && output.record_name === 'CancellationRequest') {
                cancellationRecords.push({
                  recordCiphertext: output.record_ciphertext || output.ciphertext,
                  commitment: output.commitment,
                  blockHeight: summary.block_height,
                  transactionId: summary.id,
                  plaintext: output.plaintext || null,
                });
              }
            }
          }
        }
      } catch (err) {
        // Skip transactions we can't fetch
        continue;
      }
    }

    return cancellationRecords;
  } catch (err) {
    console.error('Cancellation request scan failed:', err.message);
    return [];
  }
}

/**
 * Get current block height from chain
 */
export async function getLatestBlockHeight() {
  try {
    const data = await fetchJson(`${API_BASE}/blocks/latest/height`);
    return typeof data === 'number' ? data : Number(data);
  } catch (err) {
    console.error('Failed to fetch block height:', err.message);
    return 0;
  }
}

/**
 * Get mapping value (e.g., treasury address, order counter)
 */
export async function getMapping(programId, mappingName, key) {
  return getProgramMappingValue(programId, mappingName, key);
}
