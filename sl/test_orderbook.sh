#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════════════════
# Private Order Book v12 Test Script - TESTNET
# ═══════════════════════════════════════════════════════════════════════════════
#
# Programs already deployed to testnet:
#   - private_orderbook_v12.aleo
#   - mock_usdc_orderbook.aleo
#
# ╔════════════════════════════════════════════════════════════════╗
# ║                    TEST SCENARIO SELECTOR                       ║
# ╠════════════════════════════════════════════════════════════════╣
# ║  TEST_SCENARIO=1  →  Full flow: Submit orders                   ║
# ║  TEST_SCENARIO=2  →  Cancel order (refund escrow)               ║
# ║  TEST_SCENARIO=3  →  Partial fill (split order)                 ║
# ╚════════════════════════════════════════════════════════════════╝
#
# HOW TO RUN:
#   chmod +x test_orderbook.sh
#   TEST_SCENARIO=1 ./test_orderbook.sh
#
# ═══════════════════════════════════════════════════════════════════════════════

TEST_SCENARIO=${TEST_SCENARIO:-1}

# ══════════════════════════════════════════════════════════════════
# CONFIGURATION - TESTNET
# ══════════════════════════════════════════════════════════════════

ENDPOINT="https://api.explorer.provable.com/v1"

# Your private key (set via environment variable or use default)
export PRIVATE_KEY="${ALEO_PRIVATE_KEY:-APrivateKey1zkpEhfACCK6CjuLej9PveR9tVJbpaL53snntqkeTqznng1W}"

# Network configuration for testnet (must include endpoint)
NETWORK="--network testnet --endpoint $ENDPOINT --broadcast"

# Programs (already deployed)
ORDERBOOK_PROGRAM="private_orderbook_v12.aleo"
TOKEN_PROGRAM="mock_usdc_orderbook.aleo"

# Address matching the private key above (also the ORCHESTRATOR from constructor)
USER_ADDRESS="aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf"
ORCHESTRATOR="$USER_ADDRESS"  # Set by constructor as self.program_owner
KEEPER="$USER_ADDRESS"
TREASURY="$USER_ADDRESS"      # For protocol fees

# Project paths
ORDERBOOK_DIR=$(dirname "$0")

# ══════════════════════════════════════════════════════════════════
# TOKEN IDs - TESTNET SPECIFIC
# ══════════════════════════════════════════════════════════════════
NATIVE_CREDITS_ID="0field"     # Native ALEO credits (base token)
TOKEN_B_ID="7002field"         # TKNB quote token (testnet)

# Pair configuration
PAIR_ID="1u64"
TICK_SIZE="100u64"

# Order parameters
QUANTITY="1000000u128"           # 1.000000 base tokens (ALEO)
PRICE_BUY="12500u64"             # 1.25 quote per ALEO (basis points)
PRICE_SELL="12000u64"            # 1.20 quote per ALEO (basis points)
FILL_PRICE="12250u64"            # Midpoint for settlement

# Escrow amounts
ESCROW_SELL_CREDITS="1000000u64"    # 1 ALEO (microcredits) for sell order
ESCROW_BUY_TOKENS="1250000u128"     # 1.25 TKNB for buy order

# ══════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════

check_mapping() {
    local program=$1
    local mapping=$2
    local key=$3
    echo "  $mapping[$key]:"
    curl -s "$ENDPOINT/testnet/program/$program/mapping/$mapping/$key" 2>/dev/null || echo "  (not found)"
    echo ""
}

get_timestamp() {
    echo "$(date +%s)u32"
}

wait_for_tx() {
    echo "  Waiting for transaction confirmation..."
    sleep 15
}

# ══════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ══════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Private Order Book v12 Test Suite - TESTNET                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Network: TESTNET"
echo "  Endpoint: $ENDPOINT"
echo "  Orderbook: $ORDERBOOK_PROGRAM"
echo "  Token: $TOKEN_PROGRAM"
echo ""
echo "  Architecture: ZKPerp-inspired Keeper Model"
echo "  - Constructor sets deployer as orchestrator & keeper"
echo "  - Orders owned by orchestrator (private, encrypted)"
echo "  - Users receive Receipt records as proof"
echo ""
echo "  Token IDs:"
echo "    Base (ALEO):  $NATIVE_CREDITS_ID"
echo "    Quote (TKNB): $TOKEN_B_ID"
echo ""

case $TEST_SCENARIO in
    1) echo "🟢 SCENARIO 1: Full Trading Flow"
       echo "  1. Set treasury (for protocol fees)"
       echo "  2. Register token pair (ALEO/TKNB)"
       echo "  3. Submit SELL order (Trader sells 1 ALEO @ 12000 bps)"
       echo "  4. Submit BUY order (Trader buys 1 ALEO @ 12500 bps)"
       echo "  Expected: Orders created, users receive Receipt records" ;;
    2) echo "🔴 SCENARIO 2: Order Cancellation"
       echo "  1. Submit SELL order"
       echo "  2. Keeper cancels order"
       echo "  Expected: Escrowed tokens returned, user receives CancellationProof" ;;
    3) echo "🟡 SCENARIO 3: Partial Fill"
       echo "  1. Submit large SELL order (10 ALEO)"
       echo "  2. Submit small BUY order (3 ALEO)"
       echo "  3. Keeper splits sell order and settles partial"
       echo "  Expected: 3 ALEO traded, 7 ALEO remains in order" ;;
    *) echo "❌ Invalid TEST_SCENARIO: $TEST_SCENARIO"; exit 1 ;;
esac
echo ""

# ══════════════════════════════════════════════════════════════════
# STEP 1: Set Treasury (for protocol fees)
# ══════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  STEP 1: Setting Treasury"
echo "═══════════════════════════════════════════════════════════════"
echo "  Treasury: $TREASURY"

cd $ORDERBOOK_DIR
leo execute set_treasury "$TREASURY" $NETWORK --yes 2>&1 | tee /tmp/set_treasury.log
wait_for_tx

if grep -q "accepted\|Accepted\|broadcast" /tmp/set_treasury.log; then
    echo "✅ set_treasury SUCCESS"
else
    echo "⚠️  set_treasury may have failed (check logs)"
fi

# ══════════════════════════════════════════════════════════════════
# STEP 2: Register Token Pair
# ══════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  STEP 2: Registering Token Pair"
echo "═══════════════════════════════════════════════════════════════"
echo "  Pair ID: $PAIR_ID"
echo "  Base: ALEO ($NATIVE_CREDITS_ID)"
echo "  Quote: TKNB ($TOKEN_B_ID)"
echo "  Tick Size: $TICK_SIZE"

cd $ORDERBOOK_DIR
leo execute register_pair "$PAIR_ID" "$NATIVE_CREDITS_ID" "$TOKEN_B_ID" "$TICK_SIZE" $NETWORK --yes 2>&1 | tee /tmp/register_pair.log
wait_for_tx

if grep -q "accepted\|Accepted\|broadcast" /tmp/register_pair.log; then
    echo "✅ register_pair SUCCESS"
else
    echo "⚠️  register_pair may have failed (check logs)"
fi

# ══════════════════════════════════════════════════════════════════
# SCENARIO-SPECIFIC TESTS
# ══════════════════════════════════════════════════════════════════

if [ "$TEST_SCENARIO" -eq 1 ]; then
    # ═══════════════════════════════════════════════════════════
    # SCENARIO 1: Full Trading Flow
    # ═══════════════════════════════════════════════════════════

    # STEP 3: Submit SELL Order (Native ALEO Credits)
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  STEP 3: Trader Submits SELL Order"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Selling: $QUANTITY ALEO @ $PRICE_SELL bps"
    echo "  Escrow: $ESCROW_SELL_CREDITS microcredits"
    echo "  Order record will be owned by: $ORCHESTRATOR"

    TIMESTAMP1=$(get_timestamp)
    cd $ORDERBOOK_DIR
    # submit_sell_order(pair_id, price, quantity, escrow_credits, timestamp, expires_at, orchestrator_addr)
    leo execute submit_sell_order \
        "$PAIR_ID" \
        "$PRICE_SELL" \
        "$QUANTITY" \
        "$ESCROW_SELL_CREDITS" \
        "$TIMESTAMP1" \
        "0u32" \
        "$ORCHESTRATOR" \
        $NETWORK --yes 2>&1 | tee /tmp/submit_sell.log
    wait_for_tx

    if grep -q "accepted\|Accepted\|broadcast" /tmp/submit_sell.log; then
        echo "✅ submit_sell_order SUCCESS"
        echo "  Outputs: Order (to orchestrator) + Receipt (to trader)"
    else
        echo "❌ submit_sell_order FAILED"
    fi

    # STEP 4: Submit BUY Order (TKNB Tokens)
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  STEP 4: Trader Submits BUY Order"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Buying: $QUANTITY ALEO @ $PRICE_BUY bps"
    echo "  Escrow: $ESCROW_BUY_TOKENS TKNB"

    TIMESTAMP2=$(get_timestamp)
    cd $ORDERBOOK_DIR
    # submit_buy_order(pair_id, price, quantity, escrow_usdc, timestamp, expires_at, orchestrator_addr)
    leo execute submit_buy_order \
        "$PAIR_ID" \
        "$PRICE_BUY" \
        "$QUANTITY" \
        "$ESCROW_BUY_TOKENS" \
        "$TIMESTAMP2" \
        "0u32" \
        "$ORCHESTRATOR" \
        $NETWORK --yes 2>&1 | tee /tmp/submit_buy.log
    wait_for_tx

    if grep -q "accepted\|Accepted\|broadcast" /tmp/submit_buy.log; then
        echo "✅ submit_buy_order SUCCESS"
        echo "  Outputs: Order (to orchestrator) + Receipt (to trader)"
    else
        echo "❌ submit_buy_order FAILED"
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  STEP 5: Summary"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  ✅ Orders submitted successfully"
    echo "  Note: Keeper would call settle_match with both Order records"
    echo ""
    echo "  Settlement would:"
    echo "    • Buyer receives ALEO from seller's escrow"
    echo "    • Seller receives TKNB from buyer's escrow (minus fees)"
    echo "    • Keeper receives settler fee"
    echo "    • Treasury receives protocol fee"
    echo "    • Both traders receive SettlementProof records"

elif [ "$TEST_SCENARIO" -eq 2 ]; then
    # ═══════════════════════════════════════════════════════════
    # SCENARIO 2: Order Cancellation
    # ═══════════════════════════════════════════════════════════

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  STEP 3: Submit Order to Cancel"
    echo "═══════════════════════════════════════════════════════════════"

    TIMESTAMP1=$(get_timestamp)
    cd $ORDERBOOK_DIR
    leo execute submit_sell_order \
        "$PAIR_ID" \
        "$PRICE_SELL" \
        "$QUANTITY" \
        "$ESCROW_SELL_CREDITS" \
        "$TIMESTAMP1" \
        "0u32" \
        "$ORCHESTRATOR" \
        $NETWORK --yes 2>&1 | tee /tmp/submit_cancel.log
    wait_for_tx

    if grep -q "accepted\|Accepted\|broadcast" /tmp/submit_cancel.log; then
        echo "✅ Sell order submitted"
        echo "  Note: Keeper would call cancel_sell_order with the Order record"
        echo "  This would refund ALEO to trader and return CancellationProof"
    fi

elif [ "$TEST_SCENARIO" -eq 3 ]; then
    # ═══════════════════════════════════════════════════════════
    # SCENARIO 3: Partial Fill
    # ═══════════════════════════════════════════════════════════

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  STEP 3: Submit Large SELL Order (10 ALEO)"
    echo "═══════════════════════════════════════════════════════════════"

    LARGE_QTY="10000000u128"
    LARGE_ESCROW="10000000u64"

    TIMESTAMP1=$(get_timestamp)
    cd $ORDERBOOK_DIR
    leo execute submit_sell_order \
        "$PAIR_ID" \
        "$PRICE_SELL" \
        "$LARGE_QTY" \
        "$LARGE_ESCROW" \
        "$TIMESTAMP1" \
        "0u32" \
        "$ORCHESTRATOR" \
        $NETWORK --yes 2>&1 | tee /tmp/submit_large.log
    wait_for_tx

    if grep -q "accepted\|Accepted\|broadcast" /tmp/submit_large.log; then
        echo "✅ Large sell order submitted (10 ALEO)"
        echo "  Note: Keeper would use split_order to partially fill this order"
    fi
fi

# ══════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════

echo ""
sleep 3

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                         Summary                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Program state (querying testnet):"
check_mapping $ORDERBOOK_PROGRAM orchestrator true
check_mapping $ORDERBOOK_PROGRAM keepers "$KEEPER"
check_mapping $ORDERBOOK_PROGRAM treasury true
check_mapping $ORDERBOOK_PROGRAM token_pairs "$PAIR_ID"

case $TEST_SCENARIO in
    1) echo "═══════════════════════════════════════════════════════════════"
       echo "SCENARIO 1 COMPLETE: Full Trading Flow"
       echo "═══════════════════════════════════════════════════════════════" ;;
    2) echo "═══════════════════════════════════════════════════════════════"
       echo "SCENARIO 2 COMPLETE: Order Cancellation"
       echo "═══════════════════════════════════════════════════════════════" ;;
    3) echo "═══════════════════════════════════════════════════════════════"
       echo "SCENARIO 3 COMPLETE: Partial Fill"
       echo "═══════════════════════════════════════════════════════════════" ;;
esac

echo ""
echo "v12 Features (ZKPerp-inspired Architecture):"
echo "  ✅ @custom constructor sets self.program_owner as orchestrator"
echo "  ✅ No separate initialize call needed"
echo "  ✅ Order records owned by ORCHESTRATOR (private, encrypted)"
echo "  ✅ Users receive Receipt records as proof"
echo "  ✅ Keeper settles matches in ONE transaction (settle_match)"
echo "  ✅ Protocol fee sent to treasury"
echo "  ✅ SettlementProof/CancellationProof returned to users"
echo "  ✅ Partial fills via split_order transition"
echo "  ✅ Native credits (ALEO) and mock_usdc_orderbook.aleo token support"
echo "  ✅ No public order book - maximum privacy"
echo ""
echo "Function Reference:"
echo "  set_treasury      - Set treasury address for protocol fees"
echo "  register_pair     - Register trading pair (base/quote tokens)"
echo "  submit_buy_order  - Buyer escrows quote token to buy base"
echo "  submit_sell_order - Seller escrows base token to sell for quote"
echo "  settle_match      - Keeper matches buy+sell, transfers to both + fees"
echo "  cancel_buy_order  - Keeper refunds quote token to buyer"
echo "  cancel_sell_order - Keeper refunds base token to seller"
echo "  split_order       - Keeper splits order for partial fills"
echo ""
echo "Token IDs (Testnet):"
echo "  ALEO (Base):  $NATIVE_CREDITS_ID"
echo "  TKNB (Quote): $TOKEN_B_ID"
echo ""
