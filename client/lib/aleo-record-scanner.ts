/**
 * Aleo Record Scanning Service (RSS) Module
 *
 * This module provides a client for interacting with the Provable Record Scanning
 * Service (RSS). It simplifies the process of registering a user's view key
 * and querying for their owned records on the Aleo blockchain.
 *
 * The RSS is an off-chain service that indexes the Aleo ledger, allowing for
 * efficient discovery of records belonging to a specific account without
 * requiring the client to scan the entire chain.
 *
 * Key features:
 *  - Encrypted view key registration for privacy.
 *  - Querying for owned records with various filters.
 *  - Built-in handling of authentication and API credentials.
 *
 * For more details on the RSS, see the official documentation.
 */

import { Account, RecordScanner } from '@provablehq/sdk';
import { config } from './config';

// Global RecordScanner instance
let recordScanner: RecordScanner | null = null;

/**
 * Initializes and returns a singleton instance of the RecordScanner.
 *
 * This function sets up the RecordScanner with the base URL and network
 * configured in the application's config file. It also handles setting
 * the API key and consumer ID for authentication if they are available.
 *
 * @returns {RecordScanner} The initialized RecordScanner instance.
 */
function getRecordScanner(): RecordScanner {
  if (recordScanner) {
    return recordScanner;
  }

  const scanner = new RecordScanner({
    url: config.KEEPER_API_URL.replace('/api', ''), // Assuming scanner is at the root
    network: config.NETWORK,
  });

  // These would be set if you have them, e.g., from environment variables
  // scanner.setApiKey(process.env.NEXT_PUBLIC_PROVABLE_API_KEY || '');
  // scanner.setConsumerId(process.env.NEXT_PUBLIC_PROVABLE_CONSUMER_ID || '');

  recordScanner = scanner;
  return recordScanner;
}

/**
 * Registers an Aleo view key with the Record Scanning Service in an encrypted
 * manner.
 *
 * This is the recommended way to register a view key, as it ensures that the
 * key is only ever decrypted inside the secure enclave of the RSS.
 *
 * @param {string} viewKey - The private view key of the user.
 * @param {number} startBlock - The block height from which to start scanning.
 * @returns {Promise<string>} A promise that resolves with the UUID for the registered user.
 * @throws {Error} If the registration fails.
 */
export async function registerViewKeyEncrypted(
  viewKey: string,
  startBlock = 0
): Promise<string> {
  const scanner = getRecordScanner();
  const result = await scanner.registerEncrypted(viewKey, startBlock);

  if (!result.ok || !result.data?.uuid) {
    throw new Error(result.error?.message || 'Encrypted registration failed');
  }

  return result.data.uuid;
}

/**
 * Finds all unspent records for a given user, identified by their UUID.
 *
 * This function queries the '/records/owned' endpoint of the RSS.
 *
 * @param {string} uuid - The UUID obtained from the registration process.
 * @param {string} [programId] - Optional program ID to filter records by.
 * @returns {Promise<any[]>} A promise that resolves with an array of owned records.
 * @throws {Error} If the query fails.
 */
export async function findUnspentRecords(
  uuid: string,
  programId?: string
): Promise<any[]> {
  const scanner = getRecordScanner();

  const filter = {
    unspent: true,
    ...(programId && { filter: { program: programId } }),
  };

  const result = await scanner.findRecords({ uuid, ...filter });

  if (!result.ok) {
    throw new Error(result.error?.message || 'Failed to find records');
  }

  return result.data ?? [];
}

/**
 * A comprehensive function that registers a view key and fetches unspent records.
 *
 * This is a convenience function that chains the registration and record-finding
 * process. It should be used when you want to get the records for a view key
 * that may not have been registered yet.
 *
 * @param {string} viewKey - The private view key of the user.
 * @param {string} [programId] - Optional program ID to filter records by.
 * @returns {Promise<any[]>} A promise that resolves with an array of unspent records.
 */
export async function getRecordsForViewKey(
  viewKey: string,
  programId?: string
): Promise<any[]> {
  try {
    const uuid = await registerViewKeyEncrypted(viewKey);
    const records = await findUnspentRecords(uuid, programId);
    return records;
  } catch (error) {
    console.error('Error getting records for view key:', error);
    return [];
  }
}
