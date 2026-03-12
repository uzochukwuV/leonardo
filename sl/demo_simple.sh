#!/bin/bash
set -e

NETWORK="testnet"
ENDPOINT="https://api.explorer.provable.com/v1"
PROGRAM="private_orderbook_0000v9testnet.aleo"
REGISTRY="token_registry.aleo"

PRIVATE_KEY="${ALEO_PRIVATE_KEY:-APrivateKey1zkpEhfACCK6CjuLej9PveR9tVJbpaL53snntqkeTqznng1W}"
ADDRESS="${ALEO_ADDRESS:-aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf}"
PROGRAM_ADDRESS="${ALEO_PROGRAM_ADDRESS:-aleo1wpqy7rm7zk0hly62gns6asza5pzehf2rjk4j9wms8ddwv3lzgvgq6d8x7h}"

TOKEN_B_ID="7002field"
PAIR_ID="2u64"

QUANTITY="1000000u128"
LIMIT_PRICE_BUY="12500u64"
LIMIT_PRICE_SELL="12000u64"
TICK_LOWER="120u64"
TICK_UPPER="130u64"
EXPIRES_AT="0u32"

ESCROW_QUOTE="1250000u128"
ESCROW_BASE="1000000u64"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Order Book Demo - Submit Orders Only                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Submit SELL order (native ALEO)
echo "▸ Submitting SELL order..."
TIMESTAMP1="$(date +%s)u32"
leo execute submit_order_credits \
    "$PAIR_ID" "false" "$TICK_LOWER" "$TICK_UPPER" \
    "$TIMESTAMP1" "$EXPIRES_AT" "$LIMIT_PRICE_SELL" "$QUANTITY" \
    --network "$NETWORK" --endpoint "$ENDPOINT" \
    --private-key "$PRIVATE_KEY" --broadcast -y
echo "✓ SELL order submitted"
echo ""

# Approve TKNB
echo "▸ Approving TKNB..."
snarkos developer execute "$REGISTRY" approve_public \
    "$TOKEN_B_ID" "$PROGRAM_ADDRESS" "$ESCROW_QUOTE" \
    --private-key "$PRIVATE_KEY" \
    --endpoint "https://api.explorer.provable.com" \
    --network 1 --broadcast
echo "✓ Approved"
sleep 30

# Submit BUY order (ARC-21 TKNB)
echo "▸ Submitting BUY order..."
TIMESTAMP2="$(date +%s)u32"
leo execute submit_order \
    "$PAIR_ID" "true" "$TICK_LOWER" "$TICK_UPPER" \
    "$TIMESTAMP2" "$EXPIRES_AT" "$LIMIT_PRICE_BUY" "$QUANTITY" "$TOKEN_B_ID" \
    --network "$NETWORK" --endpoint "$ENDPOINT" \
    --private-key "$PRIVATE_KEY" --broadcast -y
echo "✓ BUY order submitted"
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Orders submitted successfully!                          ║"
echo "║   NOTE: Settlement requires contract redesign             ║"
echo "╚══════════════════════════════════════════════════════════╝"
