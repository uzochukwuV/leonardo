#!/usr/bin/env node

/**
 * Test Scenario for Record Scanner Service Integration
 * ===================================================
 * 
 * This script tests the enhanced matcher bot with Record Scanner Service
 * to verify that it can find the best matches using comprehensive record scanning.
 */

import 'dotenv/config';
import { RecordScannerService } from './record-scanner.mjs';

// Test configuration
const TEST_CONFIG = {
  programId: process.env.ORDERBOOK_PROGRAM || 'private_orderbook_v17.aleo',
  network: process.env.NETWORK || 'testnet',
  rssApiKey: process.env.RSS_API_KEY || '',
  rssConsumerId: process.env.RSS_CONSUMER_ID || '',
  viewKey: process.env.VIEW_KEY || '',
};

function log(tag, msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function logError(tag, msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.error(`[${ts}] [${tag}] ❌ ${msg}`);
}

async function testRecordScannerService() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Record Scanner Service Test                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Validate configuration
  if (!TEST_CONFIG.rssApiKey || !TEST_CONFIG.rssConsumerId || !TEST_CONFIG.viewKey) {
    logError('TEST', 'Missing required configuration:');
    logError('TEST', '  RSS_API_KEY: ' + (TEST_CONFIG.rssApiKey ? '✓' : '❌'));
    logError('TEST', '  RSS_CONSUMER_ID: ' + (TEST_CONFIG.rssConsumerId ? '✓' : '❌'));
    logError('TEST', '  VIEW_KEY: ' + (TEST_CONFIG.viewKey ? '✓' : '❌'));
    console.log('\nPlease set these in your .env file and try again.');
    process.exit(1);
  }

  try {
    // Initialize Record Scanner
    log('TEST', 'Initializing Record Scanner...');
    const recordScanner = new RecordScannerService(
      TEST_CONFIG.rssApiKey,
      TEST_CONFIG.rssConsumerId || '',
      TEST_CONFIG.network,
      TEST_CONFIG.viewKey
    );

    // Register view key
    log('TEST', 'Registering view key...');
    const registrationResult = await recordScanner.registerViewKey(TEST_CONFIG.viewKey, 0);
    log('TEST', `✅ Registration successful. UUID: ${registrationResult.uuid}`);

    // Test basic record scanning
    log('TEST', 'Testing Order record scanning...');
    const orderRecords = await recordScanner.scanOrderRecords(TEST_CONFIG.programId);
    log('TEST', `Found ${orderRecords.length} Order records`);

    if (orderRecords.length > 0) {
      log('TEST', 'Sample Order record:');
      const sample = orderRecords[0];
      console.log(`  - Order ID: ${sample.plaintext ? 'Available' : 'Encrypted'}`);
      console.log(`  - Block Height: ${sample.blockHeight}`);
      console.log(`  - Transaction ID: ${sample.transactionId?.substring(0, 20)}...`);
    }

    // Test cancellation request scanning
    log('TEST', 'Testing CancellationRequest record scanning...');
    const cancelRecords = await recordScanner.scanCancellationRequestRecords(TEST_CONFIG.programId);
    log('TEST', `Found ${cancelRecords.length} CancellationRequest records`);

    // Test best match finding
    log('TEST', 'Testing best match algorithm...');
    const bestMatches = await recordScanner.findBestMatches(TEST_CONFIG.programId, 5);
    log('TEST', `Found ${bestMatches.length} potential matches`);

    if (bestMatches.length > 0) {
      log('TEST', 'Best matches found:');
      bestMatches.forEach((match, i) => {
        console.log(`  ${i + 1}. Buy @ ${match.buyOrder.price} ↔ Sell @ ${match.sellOrder.price}`);
        console.log(`     Fill: ${match.fillQuantity} @ ${match.fillPrice} (Score: ${match.score.toFixed(2)})`);
      });
    } else {
      log('TEST', 'No matching orders found (this is normal if no crossing orders exist)');
    }

    // Test RSS status
    log('TEST', 'Checking RSS status...');
    const status = recordScanner.getStatus();
    console.log('  RSS Status:');
    console.log(`    - UUID: ${status.uuid}`);
    console.log(`    - Network: ${status.network}`);
    console.log(`    - Last Scan: ${status.lastScanTime || 'Never'}`);
    console.log(`    - Registered: ${status.registered ? 'Yes' : 'No'}`);

    log('TEST', '✅ All tests completed successfully!');
    
    console.log('\n📊 Summary:');
    console.log(`  - Order records discovered: ${orderRecords.length}`);
    console.log(`  - Cancellation requests: ${cancelRecords.length}`);
    console.log(`  - Potential matches: ${bestMatches.length}`);
    console.log('  - Record Scanner Service: ✅ Working');

  } catch (error) {
    logError('TEST', `Test failed: ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function testMatcherBotIntegration() {
  console.log('\n' + '═'.repeat(60));
  log('TEST', 'Testing Matcher Bot Integration...');
  
  try {
    // Test HTTP endpoints
    const baseUrl = `http://localhost:${process.env.API_PORT || 3002}`;
    
    log('TEST', 'Testing RSS status endpoint...');
    const rssStatusResponse = await fetch(`${baseUrl}/api/rss/status`);
    if (rssStatusResponse.ok) {
      const rssStatus = await rssStatusResponse.json();
      log('TEST', `RSS Status: ${rssStatus.enabled ? 'Enabled' : 'Disabled'}`);
      if (rssStatus.initialized) {
        log('TEST', `RSS UUID: ${rssStatus.uuid}`);
      }
    } else {
      log('TEST', 'RSS status endpoint not available (bot may not be running)');
    }

    log('TEST', 'Testing RSS find-matches endpoint...');
    const matchesResponse = await fetch(`${baseUrl}/api/rss/find-matches`, {
      method: 'POST'
    });
    
    if (matchesResponse.ok) {
      const matchesData = await matchesResponse.json();
      log('TEST', `Found ${matchesData.matchCount} matches via API`);
      if (matchesData.matches.length > 0) {
        log('TEST', 'API Match results:');
        matchesData.matches.forEach((match, i) => {
          console.log(`  ${i + 1}. ${match.buyOrderId.substring(0,20)}... @ ${match.fillPrice} (Score: ${match.score.toFixed(2)})`);
        });
      }
    } else {
      log('TEST', 'RSS find-matches endpoint not available (bot may not be running)');
    }

  } catch (error) {
    log('TEST', `Integration test failed: ${error.message}`);
    log('TEST', 'This is expected if the matcher bot is not currently running');
  }
}

async function main() {
  await testRecordScannerService();
  await testMatcherBotIntegration();
  
  console.log('\n🎉 Testing complete!');
  console.log('\nNext steps:');
  console.log('1. Start the enhanced matcher bot: node orderbook-keeper.mjs');
  console.log('2. Check the /health endpoint for RSS status');
  console.log('3. Monitor logs for RSS-enhanced order discovery');
  console.log('4. Use /api/rss/find-matches to test best match finding');
}

main().catch(err => {
  logError('TEST', `Fatal error: ${err.message}`);
  process.exit(1);
});