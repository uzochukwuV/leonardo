#!/usr/bin/env node

/**
 * Extract View Key from Private Key
 * =================================
 * This utility helps extract the view key from your private key for RSS configuration.
 */

import 'dotenv/config';

async function extractViewKey() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              View Key Extraction Utility                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const privateKey = process.env.PRIVATE_KEY;
  
  if (!privateKey || privateKey.includes('...')) {
    console.error('❌ Missing PRIVATE_KEY in .env file');
    console.log('\nPlease add your private key to .env:');
    console.log('PRIVATE_KEY=APrivateKey1zkp...');
    process.exit(1);
  }

  try {
    // Dynamically import the SDK based on network
    const network = process.env.NETWORK || 'testnet';
    let Account, sdk;
    
    try {
      if (network === 'mainnet') {
        sdk = await import('@provablehq/sdk/mainnet.js');
      } else {
        sdk = await import('@provablehq/sdk/testnet.js');
      }
      Account = sdk.Account;
    } catch (err) {
      console.error('❌ Failed to import Provable SDK');
      console.error('   Make sure to install it: npm install @provablehq/sdk');
      console.error('   Error:', err.message);
      process.exit(1);
    }

    console.log(`🔑 Extracting view key for ${network}...`);
    
    // Create account from private key
    const account = new Account({ privateKey });
    
    // Extract view key
    const viewKey = account.viewKey();
    const address = account.address();
    
    console.log('✅ Extraction successful!');
    console.log('');
    console.log('📋 Account Information:');
    console.log(`   Address: ${address}`);
    console.log(`   Private Key: ${privateKey.substring(0, 20)}...`);
    console.log(`   View Key: ${viewKey}`);
    console.log('');
    console.log('📝 Add this to your .env file:');
    console.log(`VIEW_KEY=${viewKey}`);
    console.log('');
    console.log('⚠️  Security Notes:');
    console.log('   - Keep your private key secure and never share it');
    console.log('   - The view key allows reading your records but not spending');
    console.log('   - Use testnet credentials for development/testing');
    
  } catch (error) {
    console.error('❌ Failed to extract view key:', error.message);
    console.log('\nPossible issues:');
    console.log('1. Invalid private key format');
    console.log('2. Missing Provable SDK (@provablehq/sdk)');
    console.log('3. Network mismatch (check NETWORK in .env)');
    process.exit(1);
  }
}

extractViewKey();