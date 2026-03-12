#!/bin/bash

# Quick Reference: Private Orderbook v17 Keeper Bot
# ==================================================

# ═══════════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════════

# 1. Create .env file
cat > .env << 'EOF'
PRIVATE_KEY=<keeper_private_key>
ORDERBOOK_PROGRAM=private_orderbook_v17.aleo
NETWORK=testnet
NETWORK_ID=1
SCAN_INTERVAL=30000
MATCH_INTERVAL=10000
API_PORT=3002
EOF

# 2. Install dependencies
npm install

# 3. Start keeper bot
node orderbook-keeper.mjs

# ═══════════════════════════════════════════════════════════════
# BOT MONITORING
# ═══════════════════════════════════════════════════════════════

# Check bot health
curl http://localhost:3002/health | jq

# Watch orderbook in real-time
watch -n 5 'curl -s http://localhost:3002/api/orderbook | jq'

# Check all orders
curl http://localhost:3002/api/orders | jq

# Check recent trades
curl http://localhost:3002/api/trades | jq

# ═══════════════════════════════════════════════════════════════
# BOT CONTROL
# ═══════════════════════════════════════════════════════════════

# Pause bot
curl -X POST http://localhost:3002/api/bot/pause

# Resume bot
curl -X POST http://localhost:3002/api/bot/resume

# Manually trigger matching
curl -X POST http://localhost:3002/api/match

# ═══════════════════════════════════════════════════════════════
# ORDER SUBMISSION (User Commands)
# ═══════════════════════════════════════════════════════════════

# Variables (set these)
USER_PRIVATE_KEY="<user_private_key>"
KEEPER_ADDRESS="<keeper_address>"
USDC_TOKEN_ID="<usdc_token_id>field"
TIMESTAMP=$(date +%s)
EXPIRES_AT=$((TIMESTAMP + 86400))  # 24 hours from now

# Submit BUY order
# - Pair: ALEO/USDC (pair_id = 1)
# - Price: 100 (basis points)
# - Quantity: 1000 ALEO
# - Escrow: 100 USDC
snarkos developer execute \
  --private-key "$USER_PRIVATE_KEY" \
  --query https://api.explorer.provable.com/v1 \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --network 1 \
  private_orderbook_v17.aleo \
  submit_buy_order \
  1u64 \
  "$USDC_TOKEN_ID" \
  100u64 \
  1000u128 \
  100u128 \
  "${TIMESTAMP}u32" \
  "${EXPIRES_AT}u32" \
  "$KEEPER_ADDRESS"

# Submit SELL order
# - Pair: ALEO/USDC (pair_id = 1)
# - Price: 95 (basis points)
# - Quantity: 1000 ALEO
# - Escrow: 1000 ALEO
snarkos developer execute \
  --private-key "$USER_PRIVATE_KEY" \
  --query https://api.explorer.provable.com/v1 \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --network 1 \
  private_orderbook_v17.aleo \
  submit_sell_order \
  1u64 \
  "$USDC_TOKEN_ID" \
  95u64 \
  1000u128 \
  1000u64 \
  "${TIMESTAMP}u32" \
  "${EXPIRES_AT}u32" \
  "$KEEPER_ADDRESS"

# ═══════════════════════════════════════════════════════════════
# CANCELLATION (User Commands)
# ═══════════════════════════════════════════════════════════════

# Request cancellation (user provides Receipt record)
snarkos developer execute \
  --private-key "$USER_PRIVATE_KEY" \
  --query https://api.explorer.provable.com/v1 \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --network 1 \
  private_orderbook_v17.aleo \
  request_cancel \
  "<RECEIPT_RECORD>" \
  "$KEEPER_ADDRESS" \
  "${TIMESTAMP}u32"

# ═══════════════════════════════════════════════════════════════
# DEBUGGING
# ═══════════════════════════════════════════════════════════════

# Check transaction status
curl "https://api.explorer.provable.com/v1/transaction/<TX_ID>" | jq

# Get program source
curl "https://api.explorer.provable.com/v1/program/private_orderbook_v17.aleo" | jq

# Get mapping value (e.g., treasury address)
curl "https://api.explorer.provable.com/v1/program/private_orderbook_v17.aleo/mapping/treasury/true" | jq

# Get order counter
curl "https://api.explorer.provable.com/v1/program/private_orderbook_v17.aleo/mapping/order_counter/true" | jq

# Get token pair info
curl "https://api.explorer.provable.com/v1/program/private_orderbook_v17.aleo/mapping/token_pairs/1u64" | jq

# ═══════════════════════════════════════════════════════════════
# TESTING CHECKLIST
# ═══════════════════════════════════════════════════════════════

# 1. Start keeper bot
# node orderbook-keeper.mjs

# 2. Submit buy order
# (see ORDER SUBMISSION section)

# 3. Submit sell order
# (see ORDER SUBMISSION section)

# 4. Check orderbook
# curl http://localhost:3002/api/orderbook | jq

# 5. Wait 30-40 seconds for keeper to scan and match

# 6. Check trades
# curl http://localhost:3002/api/trades | jq

# 7. Request cancellation (if order not fully filled)
# (see CANCELLATION section)

# 8. Wait 10-20 seconds for keeper to process cancellation

# 9. Verify cancellation proof received

# ═══════════════════════════════════════════════════════════════
# USEFUL ALIASES
# ═══════════════════════════════════════════════════════════════

# Add to ~/.bashrc or ~/.zshrc

alias ob-health='curl -s http://localhost:3002/health | jq'
alias ob-book='curl -s http://localhost:3002/api/orderbook | jq'
alias ob-orders='curl -s http://localhost:3002/api/orders | jq'
alias ob-trades='curl -s http://localhost:3002/api/trades | jq'
alias ob-pause='curl -s -X POST http://localhost:3002/api/bot/pause | jq'
alias ob-resume='curl -s -X POST http://localhost:3002/api/bot/resume | jq'
alias ob-match='curl -s -X POST http://localhost:3002/api/match | jq'

# Usage:
# ob-health
# ob-book
# ob-orders
# ob-trades
# ob-pause
# ob-resume
# ob-match

# ═══════════════════════════════════════════════════════════════
# PERFORMANCE TUNING
# ═══════════════════════════════════════════════════════════════

# Faster scanning (more API calls, more up-to-date)
SCAN_INTERVAL=15000 node orderbook-keeper.mjs

# Faster matching (more on-chain transactions)
MATCH_INTERVAL=5000 node orderbook-keeper.mjs

# Custom API port
API_PORT=8080 node orderbook-keeper.mjs

# ═══════════════════════════════════════════════════════════════
# PRODUCTION DEPLOYMENT
# ═══════════════════════════════════════════════════════════════

# 1. Use process manager (pm2)
npm install -g pm2
pm2 start orderbook-keeper.mjs --name "orderbook-keeper"
pm2 save
pm2 startup

# 2. Monitor logs
pm2 logs orderbook-keeper

# 3. Restart on crash
pm2 restart orderbook-keeper

# 4. Stop bot
pm2 stop orderbook-keeper

# 5. Delete from pm2
pm2 delete orderbook-keeper

# ═══════════════════════════════════════════════════════════════
# TROUBLESHOOTING
# ═══════════════════════════════════════════════════════════════

# Bot not finding orders?
# 1. Check program ID matches deployed program
# 2. Verify orders are on-chain (check explorer)
# 3. Check keeper private key is correct
# 4. Increase SCAN_INTERVAL to allow more time

# Settlement failing?
# 1. Check keeper has enough credits
# 2. Verify treasury address is set
# 3. Check orders haven't expired
# 4. Verify quote token is registered

# API not responding?
# 1. Check bot is running: ps aux | grep orderbook-keeper
# 2. Check port is correct: netstat -tlnp | grep 3002
# 3. Check firewall allows port 3002
# 4. Restart bot: node orderbook-keeper.mjs

# ═══════════════════════════════════════════════════════════════
# USEFUL LINKS
# ═══════════════════════════════════════════════════════════════

# Provable API Documentation
# https://api.provable.com/docs

# Aleo Explorer
# https://explorer.provable.com

# Contract Source
# e:\apps\leo\sl\src\main.leo

# Integration Guide
# e:\apps\leo\matcher\INTEGRATION_GUIDE.md

# Test Scenarios
# e:\apps\leo\matcher\TEST_SCENARIO.mjs
