#!/bin/bash
set -e

NETWORK="testnet"
ENDPOINT="https://api.explorer.provable.com/v2"
PRIVATE_KEY="APrivateKey1zkpEhfACCK6CjuLej9PveR9tVJbpaL53snntqkeTqznng1W"
ADMIN_ADDRESS="aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Initialize Admin & Register Token Pairs                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# # Initialize admin
# echo "▸ Initializing admin..."
# leo execute initialize_admin \
#     --network "$NETWORK" \
#     --broadcast \
#     --endpoint "$ENDPOINT" \
#     --private-key "$PRIVATE_KEY"
# echo "✓ Admin initialized"
# echo ""

# # Register token pair 2: ALEO (0field) / TKNB (7002field)
# echo "▸ Registering token pair 2: ALEO/TKNB..."
# leo execute register_token_pair \
#     2u64 \
#     0field \
#     7002field \
#     100u64 \
#     10u64 \
#     5u64 \
#     "$ADMIN_ADDRESS" \
#     --network "$NETWORK" \
#     --broadcast \
#     --endpoint "$ENDPOINT" \
#     --private-key "$PRIVATE_KEY"
# echo "✓ Token pair 2 registered"
# echo ""

# Register token pair 3: ALEO (0field) / TKNA (7001field)
echo "▸ Registering token pair 3: ALEO/TKNA..."
leo execute register_token_pair \
    3u64 \
    0field \
    7001field \
    100u64 \
    10u64 \
    5u64 \
    "$ADMIN_ADDRESS" \
    --network "$NETWORK" \
    --broadcast \
    --endpoint "$ENDPOINT" \
    --private-key "$PRIVATE_KEY"
echo "✓ Token pair 3 registered"
echo ""

# Register token pair 4: TKNA (7001field) / TKNB (7002field)
echo "▸ Registering token pair 4: TKNA/TKNB..."
leo execute register_token_pair \
    4u64 \
    7001field \
    7002field \
    100u64 \
    10u64 \
    5u64 \
    "$ADMIN_ADDRESS" \
    --network "$NETWORK" \
    --broadcast \
    --endpoint "$ENDPOINT" \
    --private-key "$PRIVATE_KEY"
echo "✓ Token pair 4 registered"
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   All token pairs registered successfully!               ║"
echo "╚══════════════════════════════════════════════════════════╝"
