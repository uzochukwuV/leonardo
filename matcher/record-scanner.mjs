/**
 * Record Scanner Service Integration
 * ==================================
 * Uses the official Provable SDK RecordScanner class for comprehensive record discovery
 * and automatic decryption of records.
 */

import { Account } from '@provablehq/sdk/testnet.js';

export class RecordScannerService {
  constructor(apiKey, consumerId, network = 'testnet', viewKey = null) {
    this.network = network;
    this.viewKey = viewKey;
    this.apiKey = apiKey;
    this.consumerId = consumerId;
    this.scanner = null;
    this.uuid = null;
    this.account = null;
    this.lastScanTime = null;
  }

  /**
   * Fetch a JWT from the Provable API
   * Returns { ok, data: { jwt, expiration }, error }
   */
  async fetchJwt() {
    try {
      console.log('[RSS] Fetching JWT...');
      console.log('[RSS] API Key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET');
      console.log('[RSS] Consumer ID:', this.consumerId || 'NOT SET');

      const jwtUrl = `https://api.provable.com/jwts/${this.consumerId}`;

      const response = await fetch(jwtUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Provable-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[RSS] JWT fetch failed:', response.status, errorText);
        return { ok: false, error: errorText, status: response.status };
      }

      // The JWT is returned in the Authorization HEADER, not the body!
      // The body just contains {"exp": timestamp}
      const authHeader = response.headers.get('Authorization');
      const rawBody = await response.text();

      console.log('[RSS] ✅ JWT response received');
      console.log('[RSS] Authorization header:', authHeader ? `${authHeader.substring(0, 50)}...` : 'NOT PRESENT');
      console.log('[RSS] Response body:', rawBody);

      // Parse body for expiration
      let expiration;
      try {
        const bodyData = JSON.parse(rawBody);
        expiration = bodyData.exp;
        // Convert to milliseconds if in seconds
        if (expiration && expiration < 10000000000) {
          expiration = expiration * 1000;
        }
      } catch {
        console.log('[RSS] Could not parse body for expiration');
      }

      // Extract JWT from Authorization header (format: "Bearer <token>")
      let jwt = null;
      if (authHeader) {
        jwt = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      }

      if (!jwt) {
        return { ok: false, error: 'No JWT in Authorization header' };
      }

      return { ok: true, data: { jwt, expiration } };
    } catch (error) {
      console.error('[RSS] ❌ JWT fetch failed:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Direct registration using /register endpoint with JWT auth
   * POST /scanner/{network}/register with { view_key, start }
   */
  async registerDirect(jwt, viewKey, startBlock) {
    const scannerBase = `https://api.provable.com/scanner/${this.network}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    };

    console.log('[RSS] Registering view key with scanner service...');
    console.log('[RSS] URL:', `${scannerBase}/register`);
    console.log('[RSS] View Key:', viewKey.toString().substring(0, 30) + '...');
    console.log('[RSS] Start Block:', startBlock);

    const registerRes = await fetch(`${scannerBase}/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        view_key: viewKey.toString(),
        start: startBlock
      })
    });

    if (!registerRes.ok) {
      const errorText = await registerRes.text();
      throw new Error(`Registration failed (${registerRes.status}): ${errorText}`);
    }

    const result = await registerRes.json();
    console.log('[RSS] Registration result:', JSON.stringify(result));

    return result;
  }

  /**
   * Initialize and register with the Record Scanner Service
   * Uses encrypted registration flow as recommended by the API docs
   */
  async registerViewKey(viewKey, startBlock = 0) {
    try {
      console.log('[RSS] Initializing Provable SDK RecordScanner...');

      this.viewKey = viewKey;

      // Create Account from view key
      this.account = new Account({ viewKey: viewKey });
      console.log('[RSS] Account created from view key');

      // First, fetch a JWT to use for authentication
      const jwtResult = await this.fetchJwt();
      if (!jwtResult.ok) {
        throw new Error(`Failed to obtain JWT: ${jwtResult.error}`);
      }

      const jwt = jwtResult.data.jwt;
      const expiration = jwtResult.data.expiration;

      console.log('[RSS] JWT obtained, expires:', new Date(expiration).toISOString());

      // Use direct HTTP registration (bypasses SDK issues)
      console.log('[RSS] Using direct HTTP registration...');
      const regResult = await this.registerDirect(jwt, this.account.viewKey(), startBlock);

      if (regResult.uuid) {
        this.uuid = regResult.uuid;
        console.log('[RSS] ✅ Registered successfully. UUID:', this.uuid);

        if (regResult.job_id) {
          console.log('[RSS] Job ID:', regResult.job_id);
        }
        if (regResult.status) {
          console.log('[RSS] Status:', regResult.status);
        }

        // Store JWT for direct HTTP calls
        this.jwt = jwt;
        this.jwtExpiration = expiration;

        // Check scanner status to see indexing progress
        console.log('[RSS] Checking scanner indexing status...');
        const status = await this.checkScannerStatus();
        if (status) {
          console.log('[RSS] Current block:', status.current_block || status.indexed_to || 'unknown');
          console.log('[RSS] Target block:', status.target_block || status.latest_block || 'unknown');
        }

        return { ok: true, data: regResult };
      } else {
        throw new Error('Registration succeeded but no UUID returned');
      }
    } catch (error) {
      console.error('[RSS] ❌ Registration failed:', error.message);
      throw error;
    }
  }

  /**
   * Check the scanner indexing status
   * GET /scanner/{network}/status/{uuid}
   */
  async checkScannerStatus() {
    const scannerBase = `https://api.provable.com/scanner/${this.network}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.jwt}`
    };

    try {
      const res = await fetch(`${scannerBase}/status/${this.uuid}`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[RSS] Status check failed:', res.status, errorText);
        return null;
      }

      const status = await res.json();
      console.log('[RSS] Scanner status:', JSON.stringify(status));
      return status;
    } catch (error) {
      console.error('[RSS] Status check error:', error.message);
      return null;
    }
  }

  /**
   * Direct query for owned records using HTTP
   * POST /scanner/{network}/records/owned
   */
  async queryOwnedRecordsDirect(filter) {
    const scannerBase = `https://api.provable.com/scanner/${this.network}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.jwt}`
    };

    const body = {
      uuid: this.uuid,
      ...filter
    };

    console.log('[RSS] Querying owned records...');
    console.log('[RSS] Filter:', JSON.stringify(filter));

    const res = await fetch(`${scannerBase}/records/owned`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Records query failed (${res.status}): ${errorText}`);
    }

    const result = await res.json();
    console.log('[RSS] Raw response:', JSON.stringify(result).substring(0, 500));
    return Array.isArray(result) ? result : result.data || [];
  }

  /**
   * Find Order records with automatic decryption
   */
  async scanOrderRecords(programId) {
    if (!this.uuid || !this.jwt) {
      throw new Error('Scanner not initialized. Call registerViewKey first.');
    }

    try {
      console.log('[RSS] Scanning for Order records...');

      // Use direct HTTP call instead of SDK
      const filter = {
        unspent: true,
        filter: {
          program: programId,
          record: 'Order'
        }
      };

      const records = await this.queryOwnedRecordsDirect(filter);

      console.log('[RSS] Found', records.length, 'Order records');

      // Convert to our format
      const orderRecords = records.map(record => ({
        recordCiphertext: record.record_ciphertext || record.ciphertext,
        commitment: record.commitment,
        blockHeight: record.block_height,
        transactionId: record.transaction_id,
        plaintext: record.record_plaintext || record.plaintext,
        owner: record.owner,
        programName: record.program_name,
        recordName: record.record_name,
        functionName: record.function_name,
        transitionId: record.transition_id,
        isBuy: record.function_name === 'submit_buy_order'
      }));

      return orderRecords;
    } catch (error) {
      console.error('[RSS] ❌ Order scan failed:', error.message);
      throw error;
    }
  }

  /**
   * Find CancellationRequest records with automatic decryption
   */
  async scanCancellationRequestRecords(programId) {
    if (!this.uuid || !this.jwt) {
      throw new Error('Scanner not initialized. Call registerViewKey first.');
    }

    try {
      console.log('[RSS] Scanning for CancellationRequest records...');

      // Use direct HTTP call instead of SDK
      const filter = {
        unspent: true,
        filter: {
          program: programId,
          record: 'CancellationRequest'
        }
      };

      const records = await this.queryOwnedRecordsDirect(filter);

      console.log('[RSS] Found', records.length, 'CancellationRequest records');

      return records.map(record => ({
        recordCiphertext: record.record_ciphertext || record.ciphertext,
        commitment: record.commitment,
        blockHeight: record.block_height,
        transactionId: record.transaction_id,
        plaintext: record.record_plaintext || record.plaintext,
        owner: record.owner,
        programName: record.program_name,
        recordName: record.record_name,
        functionName: record.function_name,
        transitionId: record.transition_id
      }));
    } catch (error) {
      console.error('[RSS] ❌ Cancellation scan failed:', error.message);
      throw error;
    }
  }

  /**
   * Find best matches
   */
  async findBestMatches(programId, maxMatches = 10) {
    try {
      console.log('[RSS] 🔍 Searching for best order matches...');
      
      const orderRecords = await this.scanOrderRecords(programId);
      
      if (orderRecords.length === 0) {
        console.log('[RSS] No order records found');
        return [];
      }

      // Parse orders and separate buy/sell
      const buyOrders = [];
      const sellOrders = [];

      for (const record of orderRecords) {
        if (!record.plaintext) {
          console.log('[RSS] Warning: No plaintext for record, skipping...');
          continue;
        }

        const order = this.parseOrderFromPlaintext(record.plaintext);
        if (!order) {
          console.log('[RSS] Warning: Failed to parse order');
          continue;
        }

        // Add metadata
        order.recordCiphertext = record.recordCiphertext;
        order.commitment = record.commitment;
        order.blockHeight = record.blockHeight;
        order.transactionId = record.transactionId;
        order.isBuy = record.isBuy;

        // Only include orders with remaining quantity
        const remaining = order.quantity - order.filled;
        if (remaining <= 0n) continue;

        if (order.isBuy) {
          buyOrders.push(order);
        } else {
          sellOrders.push(order);
        }
      }

      // Sort for optimal matching
      buyOrders.sort((a, b) => Number(b.price - a.price));
      sellOrders.sort((a, b) => Number(a.price - b.price));

      console.log('[RSS] 📈', buyOrders.length, 'buy orders,', sellOrders.length, 'sell orders');
      
      // Find matches
      const matches = this.findOptimalMatches(buyOrders, sellOrders, maxMatches);
      
      console.log('[RSS] ✨ Found', matches.length, 'optimal matches');
      return matches;
    } catch (error) {
      console.error('[RSS] ❌ Best match search failed:', error.message);
      return [];
    }
  }

  /**
   * Parse order from plaintext
   */
  parseOrderFromPlaintext(plaintext) {
    try {
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
        console.log('[RSS] Failed to extract required fields from plaintext');
        console.log('[RSS] Plaintext:', plaintext.substring(0, 200));
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
      console.error('[RSS] Parse error:', err.message);
      return null;
    }
  }

  /**
   * Find optimal matches using price-time priority
   */
  findOptimalMatches(buyOrders, sellOrders, maxMatches) {
    const matches = [];
    const workingBuys = [...buyOrders];
    const workingSells = [...sellOrders];

    while (matches.length < maxMatches && workingBuys.length > 0 && workingSells.length > 0) {
      let bestMatch = null;
      let bestScore = -1;
      let bestBuyIndex = -1;
      let bestSellIndex = -1;

      for (let i = 0; i < workingBuys.length; i++) {
        const buyOrder = workingBuys[i];
        
        for (let j = 0; j < workingSells.length; j++) {
          const sellOrder = workingSells[j];
          
          // Check matching criteria
          if (buyOrder.price < sellOrder.price) continue;
          if (buyOrder.pairId !== sellOrder.pairId) continue;
          if (buyOrder.quoteTokenId !== sellOrder.quoteTokenId) continue;

          // Calculate score
          const priceSpread = Number(buyOrder.price - sellOrder.price);
          const timeScore = (buyOrder.createdAt + sellOrder.createdAt) / 2;
          const volumeScore = Math.min(
            Number(buyOrder.quantity - buyOrder.filled),
            Number(sellOrder.quantity - sellOrder.filled)
          );
          
          const score = priceSpread * 0.4 + timeScore * 0.3 + volumeScore * 0.3;

          if (score > bestScore) {
            bestScore = score;
            const buyRemaining = buyOrder.quantity - buyOrder.filled;
            const sellRemaining = sellOrder.quantity - sellOrder.filled;
            const fillQuantity = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;
            
            bestMatch = {
              buyOrder,
              sellOrder,
              fillQuantity,
              fillPrice: (buyOrder.price + sellOrder.price) / 2n,
              score
            };
            bestBuyIndex = i;
            bestSellIndex = j;
          }
        }
      }

      if (!bestMatch) break;

      matches.push(bestMatch);

      const buyRemaining = bestMatch.buyOrder.quantity - bestMatch.buyOrder.filled - bestMatch.fillQuantity;
      const sellRemaining = bestMatch.sellOrder.quantity - bestMatch.sellOrder.filled - bestMatch.fillQuantity;

      if (buyRemaining <= 0n) {
        workingBuys.splice(bestBuyIndex, 1);
      } else {
        workingBuys[bestBuyIndex] = {
          ...workingBuys[bestBuyIndex],
          filled: workingBuys[bestBuyIndex].filled + bestMatch.fillQuantity
        };
      }

      if (sellRemaining <= 0n) {
        workingSells.splice(bestSellIndex, 1);
      } else {
        workingSells[bestSellIndex] = {
          ...workingSells[bestSellIndex],
          filled: workingSells[bestSellIndex].filled + bestMatch.fillQuantity
        };
      }
    }

    return matches;
  }

  /**
   * Get scanner status
   */
  getStatus() {
    return {
      uuid: this.uuid,
      network: this.network,
      registered: !!this.uuid,
      lastScanTime: this.lastScanTime
    };
  }
}
