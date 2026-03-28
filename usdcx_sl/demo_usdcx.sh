#!/bin/bash
# ============================================================
# Private Order Book with USDCx — Record-Based Demo
# ============================================================
# Architecture: Keeper model (orders owned by keeper)
# This script demonstrates the complete order book flow with USDCx support
#
# Key Features:
#   - Token Registry for all ARC20 tokens (including native ALEO via 0field)
#   - USDCx support via test_usdcx_stablecoin.aleo
#   - Cross-pair trading via USDCx bridge
#   - Consolidated finalize functions (efficient)
#
# Usage:
#   ./demo_usdcx.sh                  — full run (init + orders + settle info)
#   ./demo_usdcx.sh --skip-init      — skip initialization
#   ./demo_usdcx.sh --orders-only    — only submit orders
#   ./demo_usdcx.sh --usdcx-only     — test USDCx pairs only
# ============================================================
set -e

# ─── FLAGS ───────────────────────────────────────────────────
SKIP_INIT=false
ORDERS_ONLY=false
USDCX_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --skip-init)     SKIP_INIT=true ;;
        --orders-only)   ORDERS_ONLY=true ;;
        --usdcx-only)    USDCX_ONLY=true ;;
    esac
done

# ─── CONFIG ──────────────────────────────────────────────────
NETWORK="testnet"
ENDPOINT="https://api.explorer.provable.com/v1"
PROGRAM="usdcx_sl.aleo"
REGISTRY="token_registry.aleo"
USDCX_PROGRAM="test_usdcx_stablecoin.aleo"

# Admin/Keeper private key (same for demo)
PRIVATE_KEY="${ALEO_PRIVATE_KEY:-APrivateKey1zkpEhfACCK6CjuLej9PveR9tVJbpaL53snntqkeTqznng1W}"
ADDRESS="${ALEO_ADDRESS:-aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf}"

# Keeper address (same as admin for demo)
KEEPER_ADDRESS="$ADDRESS"

# Treasury address
TREASURY_ADDRESS="$ADDRESS"

# Token IDs
NATIVE_ALEO_ID="0field"           # Native ALEO (via token_registry with 0field)
TOKEN_B_ID="7002field"            # TKNB (quote token for non-USDCx pairs)
USDCX_TOKEN_ID="7000field"        # USDCx (via test_usdcx_stablecoin.aleo)

# Pair IDs (auto-assigned, assuming these are first registered)
PAIR_ALEO_TKNB="1u64"             # ALEO/TKNB pair
PAIR_ALEO_USDCX="2u64"            # ALEO/USDCx pair
PAIR_TKNB_USDCX="3u64"            # TKNB/USDCx pair

# Order parameters
QUANTITY="1000000u128"            # 1.000000 tokens (6 decimals)
PRICE_BUY="12500u64"              # 1.25 quote per base (basis points)
PRICE_SELL="12000u64"             # 1.20 quote per base

# Escrow amounts
ESCROW_SELL="1000000u128"         # For sell orders: escrow base token
# Buy: escrow quote = quantity * price / 10000 = 1000000 * 12500 / 10000 = 1250000
ESCROW_BUY="1250000u128"

FEE="0"

# ─── HELPERS ─────────────────────────────────────────────────
step()  { echo ""; echo "══════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════"; }
info()  { echo "  ▸ $1"; }
ok()    { echo "  ✓ $1"; }
warn()  { echo "  ⚠ $1"; }
error() { echo "  ✗ $1"; }

# Run a transition on our deployed program
own_tx() {
    local func="$1"; shift
    leo execute \
        --network "$NETWORK" \
        --endpoint "$ENDPOINT" \
        --private-key "$PRIVATE_KEY" \
        --priority-fees "$FEE" \
        --broadcast \
        -y \
        "$func" "$@"
}

# Run a transition and capture output
own_tx_capture() {
    local func="$1"; shift
    leo execute \
        --network "$NETWORK" \
        --endpoint "$ENDPOINT" \
        --private-key "$PRIVATE_KEY" \
        --priority-fees "$FEE" \
        --broadcast \
        -y \
        "$func" "$@" 2>&1
}

# ─── BANNER ──────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Private Order Book with USDCx — Multi-Token Support    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Program : $PROGRAM                             ║"
echo "║  Keeper  : ${KEEPER_ADDRESS:0:42}... ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Token Support:                                          ║"
echo "║    • Native ALEO: 0field (via token_registry)            ║"
echo "║    • USDCx: 7000field (via test_usdcx_stablecoin)        ║"
echo "║    • Any ARC20 token via token_registry                  ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Available Pairs:                                        ║"
echo "║    • ALEO/TKNB  (ID=$PAIR_ALEO_TKNB)                              ║"
echo "║    • ALEO/USDCx (ID=$PAIR_ALEO_USDCX)                              ║"
echo "║    • TKNB/USDCx (ID=$PAIR_TKNB_USDCX)                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── STEP 1: INITIALIZE (Register pairs) ─────────────────────
if [ "$SKIP_INIT" = false ]; then
    step "STEP 1 — Initialize (Register Pairs)"

    info "1a. Add keeper"
    own_tx add_keeper "$KEEPER_ADDRESS"
    ok "Keeper added"
    sleep 30
    warn "Skipping (assume already initialized)"

    info "1b. Register ALEO/TKNB pair"
    info "  Base: Native ALEO ($NATIVE_ALEO_ID)"
    info "  Quote: TKNB ($TOKEN_B_ID)"
    own_tx register_pair "$NATIVE_ALEO_ID" "$TOKEN_B_ID" "100u64"
    ok "ALEO/TKNB pair registered"
    sleep 30
    warn "Skipping (assume already registered)"

    info "1c. Register ALEO/USDCx pair"
    info "  Base: Native ALEO ($NATIVE_ALEO_ID)"
    info "  Quote: USDCx ($USDCX_TOKEN_ID)"
    own_tx register_pair "$NATIVE_ALEO_ID" "$USDCX_TOKEN_ID" "100u64"
    ok "ALEO/USDCx pair registered"
    sleep 30
    warn "Skipping (assume already registered)"

    info "1d. Register TKNB/USDCx pair"
    info "  Base: TKNB ($TOKEN_B_ID)"
    info "  Quote: USDCx ($USDCX_TOKEN_ID)"
    own_tx register_pair "$TOKEN_B_ID" "$USDCX_TOKEN_ID" "100u64"
    ok "TKNB/USDCx pair registered"
    sleep 30
    warn "Skipping (assume already registered)"
fi

# ─── STEP 2: SUBMIT SELL ORDER (Token Registry) ──────────────
if [ "$USDCX_ONLY" = false ]; then
    step "STEP 2 — Submit SELL order via token_registry (ALEO/TKNB)"
    info "Function: submit_sell_order"
    info "Selling $QUANTITY ALEO @ $PRICE_SELL bps for TKNB"
    info "Escrow: $ESCROW_SELL ALEO (via token_registry with 0field)"
    echo ""

    TIMESTAMP1="$(date +%s)u32"
    EXPIRES="0u32"

    info "Parameters:"
    info "  pair_id: $PAIR_ALEO_TKNB"
    info "  base_token_id: $NATIVE_ALEO_ID (native ALEO)"
    info "  quote_token_id: $TOKEN_B_ID (TKNB)"
    info "  price: $PRICE_SELL"
    info "  quantity: $QUANTITY"
    info "  escrow_base: $ESCROW_SELL"
    info "  timestamp: $TIMESTAMP1"
    info "  expires_at: $EXPIRES"
    info "  orchestrator_addr: $KEEPER_ADDRESS"
    echo ""

    # New signature includes base_token_id
    submit_sell_order(pair_id, base_token_id, quote_token_id, price, quantity, escrow_base, timestamp, expires_at, orchestrator_addr)
    SELL_OUTPUT="$(own_tx_capture submit_sell_order \
        "$PAIR_ALEO_TKNB" \
        "$NATIVE_ALEO_ID" \
        "$TOKEN_B_ID" \
        "$PRICE_SELL" \
        "$QUANTITY" \
        "$ESCROW_SELL" \
        "$TIMESTAMP1" \
        "$EXPIRES" \
        "$KEEPER_ADDRESS")"

    echo "$SELL_OUTPUT"

    if echo "$SELL_OUTPUT" | grep -q "Transaction rejected"; then
        error "SELL order transaction was REJECTED on-chain."
        exit 1
    else
        ok "SELL order submitted! Order record sent to keeper."
    fi
    echo ""
    sleep 30
fi

# ─── STEP 3: SUBMIT BUY ORDER (Token Registry) ───────────────
if [ "$USDCX_ONLY" = false ]; then
    step "STEP 3 — Submit BUY order via token_registry (ALEO/TKNB)"
    info "Function: submit_buy_order"
    info "Buying $QUANTITY ALEO @ $PRICE_BUY bps with TKNB"
    info "Escrow: $ESCROW_BUY TKNB (via token_registry)"
    echo ""

    TIMESTAMP2="$(date +%s)u32"

    info "Parameters:"
    info "  pair_id: $PAIR_ALEO_TKNB"
    info "  base_token_id: $NATIVE_ALEO_ID (native ALEO)"
    info "  quote_token_id: $TOKEN_B_ID (TKNB)"
    info "  price: $PRICE_BUY"
    info "  quantity: $QUANTITY"
    info "  escrow_quote: $ESCROW_BUY"
    info "  timestamp: $TIMESTAMP2"
    info "  expires_at: $EXPIRES"
    info "  orchestrator_addr: $KEEPER_ADDRESS"
    echo ""

    # New signature includes base_token_id
    submit_buy_order(pair_id, base_token_id, quote_token_id, price, quantity, escrow_quote, timestamp, expires_at, orchestrator_addr)
    BUY_OUTPUT="$(own_tx_capture submit_buy_order \
        "$PAIR_ALEO_TKNB" \
        "$NATIVE_ALEO_ID" \
        "$TOKEN_B_ID" \
        "$PRICE_BUY" \
        "$QUANTITY" \
        "$ESCROW_BUY" \
        "$TIMESTAMP2" \
        "$EXPIRES" \
        "$KEEPER_ADDRESS")"

    echo "$BUY_OUTPUT"

    if echo "$BUY_OUTPUT" | grep -q "Transaction rejected"; then
        error "BUY order transaction was REJECTED on-chain."
        exit 1
    else
        ok "BUY order submitted! Order record sent to keeper."
    fi
    echo ""
    sleep 30
fi

# ─── STEP 4: SUBMIT SELL ORDER (USDCx) ───────────────────────
step "STEP 4 — Submit SELL order with USDCx quote (ALEO/USDCx)"
info "Function: submit_sell_order (using token_registry for base)"
info "Selling $QUANTITY ALEO @ $PRICE_SELL bps for USDCx"
info "Escrow: $ESCROW_SELL ALEO (via token_registry with 0field)"
echo ""

TIMESTAMP3="$(date +%s)u32"

info "Parameters:"
info "  pair_id: $PAIR_ALEO_USDCX"
info "  base_token_id: $NATIVE_ALEO_ID (native ALEO)"
info "  quote_token_id: $USDCX_TOKEN_ID (USDCx)"
info "  price: $PRICE_SELL"
info "  quantity: $QUANTITY"
info "  escrow_base: $ESCROW_SELL"
echo ""

# For ALEO/USDCx pair, use regular submit_sell_order (base is ALEO via token_registry)
SELL_USDCX_OUTPUT="$(own_tx_capture submit_sell_order \
    "$PAIR_ALEO_USDCX" \
    "$NATIVE_ALEO_ID" \
    "$USDCX_TOKEN_ID" \
    "$PRICE_SELL" \
    "$QUANTITY" \
    "$ESCROW_SELL" \
    "$TIMESTAMP3" \
    "$EXPIRES" \
    "$KEEPER_ADDRESS")"

echo "$SELL_USDCX_OUTPUT"

if echo "$SELL_USDCX_OUTPUT" | grep -q "Transaction rejected"; then
    error "SELL (USDCx) order transaction was REJECTED on-chain."
    exit 1
else
    ok "SELL order (ALEO/USDCx) submitted!"
fi
echo ""
sleep 30

# ─── STEP 5: SUBMIT BUY ORDER (USDCx) ────────────────────────
step "STEP 5 — Submit BUY order with USDCx quote (ALEO/USDCx)"
info "Function: submit_buy_order_usdcx"
info "Buying $QUANTITY ALEO @ $PRICE_BUY bps with USDCx"
info "Escrow: $ESCROW_BUY USDCx (via test_usdcx_stablecoin.aleo)"
echo ""

TIMESTAMP4="$(date +%s)u32"

info "Parameters:"
info "  pair_id: $PAIR_ALEO_USDCX"
info "  base_token_id: $NATIVE_ALEO_ID (native ALEO)"
info "  price: $PRICE_BUY"
info "  quantity: $QUANTITY"
info "  escrow_quote: $ESCROW_BUY"
echo ""

submit_buy_order_usdcx(pair_id, base_token_id, price, quantity, escrow_quote, timestamp, expires_at, orchestrator_addr)
BUY_USDCX_OUTPUT="$(own_tx_capture submit_buy_order_usdcx \
    "$PAIR_ALEO_USDCX" \
    "$NATIVE_ALEO_ID" \
    "$PRICE_BUY" \
    "$QUANTITY" \
    "$ESCROW_BUY" \
    "$TIMESTAMP4" \
    "$EXPIRES" \
    "$KEEPER_ADDRESS")"

echo "$BUY_USDCX_OUTPUT"

if echo "$BUY_USDCX_OUTPUT" | grep -q "Transaction rejected"; then
    error "BUY (USDCx) order transaction was REJECTED on-chain."
    exit 1
else
    ok "BUY order (ALEO/USDCx) submitted!"
fi
echo ""

if [ "$ORDERS_ONLY" = true ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║           Orders Submitted! (--orders-only)              ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  The keeper now holds:                                   ║"
    echo "║    • SELL Order (ALEO/TKNB)                              ║"
    echo "║    • BUY Order (ALEO/TKNB)                               ║"
    echo "║    • SELL Order (ALEO/USDCx)                             ║"
    echo "║    • BUY Order (ALEO/USDCx)                              ║"
    echo "║                                                          ║"
    echo "║  Next: Keeper matches orders via settle_match functions  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 0
fi

sleep 30

# ─── STEP 6: SETTLEMENT INFO ─────────────────────────────────
step "STEP 6 — Settlement Functions"
info "The keeper can now settle matched orders"
echo ""

echo "Available Settlement Functions:"
echo ""
echo "  1. settle_match (token_registry only)"
echo "     - For pairs where both base and quote use token_registry"
echo "     - Example: ALEO/TKNB pair"
echo "     - Parameters: buy_order, sell_order, fill_quantity, fill_price,"
echo "                   timestamp, treasury_addr"
echo ""
echo "  2. settle_match_usdcx (USDCx as quote)"
echo "     - For pairs where quote is USDCx (7000field)"
echo "     - Example: ALEO/USDCx, TKNB/USDCx pairs"
echo "     - Base token transferred via token_registry"
echo "     - Quote (USDCx) transferred via test_usdcx_stablecoin.aleo"
echo ""
echo "  3. settle_match_usdcx_base (USDCx as base)"
echo "     - For pairs where base is USDCx (7000field)"
echo "     - Example: USDCx/TKNB pair (USDCx is the base)"
echo "     - Base (USDCx) transferred via test_usdcx_stablecoin.aleo"
echo "     - Quote token transferred via token_registry"
echo ""
echo "  4. settle_cross_pair (Cross-pair via USDCx bridge)"
echo "     - Atomic swap across two USDCx pairs"
echo "     - Example: User sells ALEO (ALEO/USDCx) → receives TKNB (TKNB/USDCx)"
echo "     - Requires: user_sell_order, cp1_buy_order, cp2_sell_order"
echo "     - USDCx acts as bridge token (never touches user)"
echo ""

# ─── STEP 7: CROSS-PAIR TRADING INFO ─────────────────────────
step "STEP 7 — Cross-Pair Trading via USDCx Bridge"
info "This is the key USDCx feature for multi-token trading"
echo ""

echo "Cross-Pair Settlement Flow:"
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  User wants: Sell ALEO → Receive TKNB                   │"
echo "  │                                                         │"
echo "  │  Leg 1: ALEO/USDCx pair                                 │"
echo "  │    • User: SELL 1 ALEO @ 1.20 USDCx                     │"
echo "  │    • CP1:  BUY  1 ALEO @ 1.25 USDCx (has escrowed USDCx)│"
echo "  │                                                         │"
echo "  │  Leg 2: TKNB/USDCx pair                                 │"
echo "  │    • CP2:  SELL 0.8 TKNB @ 1.50 USDCx (has escrowed TKNB)│"
echo "  │                                                         │"
echo "  │  Settlement:                                            │"
echo "  │    1. User's ALEO → CP1                                 │"
echo "  │    2. CP1's USDCx → CP2 (bridge, minus fees)            │"
echo "  │    3. CP2's TKNB → User                                 │"
echo "  │    4. Fees distributed to keeper & treasury             │"
echo "  │                                                         │"
echo "  │  Result: User sold ALEO and received TKNB atomically    │"
echo "  │          without ever holding USDCx                     │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""

# ─── STEP 8: CANCELLATION INFO ───────────────────────────────
step "STEP 8 — Cancellation Flow"
info "Two-step cancellation with proper token refunds"
echo ""

echo "Cancellation Functions:"
echo ""
echo "  Step 1 (Trader): request_cancel(receipt, keeper_addr, timestamp)"
echo "    → Returns CancellationRequest record (owned by keeper)"
echo ""
echo "  Step 2 (Keeper): Process cancellation based on order type"
echo ""
echo "    • cancel_buy_order (token_registry quote)"
echo "      → Refunds quote tokens via token_registry"
echo ""
echo "    • cancel_buy_order_usdcx (USDCx quote)"
echo "      → Refunds USDCx via test_usdcx_stablecoin.aleo"
echo ""
echo "    • cancel_sell_order (token_registry base)"
echo "      → Refunds base tokens via token_registry"
echo "      → Uses order.base_token_id for routing"
echo ""
echo "    • cancel_sell_order_usdcx (USDCx base)"
echo "      → Refunds USDCx via test_usdcx_stablecoin.aleo"
echo ""

# ─── DONE ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Demo Complete! (USDCx Edition)              ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Key Features:                                           ║"
echo "║    • Native ALEO via token_registry (0field)             ║"
echo "║    • USDCx via test_usdcx_stablecoin.aleo (7000field)    ║"
echo "║    • Any ARC20 token via token_registry                  ║"
echo "║    • Cross-pair atomic swaps via USDCx bridge            ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Architecture Improvements:                              ║"
echo "║    • Consolidated finalize functions (9% smaller)        ║"
echo "║    • base_token_id in Order record for proper routing    ║"
echo "║    • No credits.aleo dependency                          ║"
echo "║    • Shared finalize logic between token types           ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Function Summary:                                       ║"
echo "║    Order Submission:                                     ║"
echo "║      • submit_buy_order      (token_registry quote)      ║"
echo "║      • submit_buy_order_usdcx (USDCx quote)              ║"
echo "║      • submit_sell_order     (token_registry base)       ║"
echo "║      • submit_sell_order_usdcx (USDCx base)              ║"
echo "║    Settlement:                                           ║"
echo "║      • settle_match          (all token_registry)        ║"
echo "║      • settle_match_usdcx    (USDCx quote)               ║"
echo "║      • settle_match_usdcx_base (USDCx base)              ║"
echo "║      • settle_cross_pair     (cross-pair via USDCx)      ║"
echo "║    Cancellation:                                         ║"
echo "║      • cancel_buy_order      (token_registry quote)      ║"
echo "║      • cancel_buy_order_usdcx (USDCx quote)              ║"
echo "║      • cancel_sell_order     (token_registry base)       ║"
echo "║      • cancel_sell_order_usdcx (USDCx base)              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""




#  // ========== CANCELLATION ==========

#     // STEP 1 (TRADER): Request cancellation using your Receipt as proof of order.
#     // Creates a CancellationRequest record owned by the keeper so they can see and act on it.
#     async transition request_cancel(
#         receipt: Receipt,
#         keeper_addr: address,
#         timestamp: u32
#     ) -> (CancellationRequest, Future) {
#         // receipt.owner == self.caller is enforced by ZK record ownership

#         let cancel_req: CancellationRequest = CancellationRequest {
#             owner: keeper_addr,
#             order_id: receipt.order_id,
#             trader: self.caller,
#             is_buy: receipt.is_buy,
#             created_at: timestamp,
#         };

#         return (cancel_req, async {
#             let expected_orch: address = Mapping::get(orchestrator, true);
#             assert_eq(keeper_addr, expected_orch);
#         });
#     }

#     // STEP 2 (KEEPER): Cancel BUY order - refund quote tokens, give trader a CancellationProof
#     async transition cancel_buy_order(
#         order: Order,
#         cancel_req: CancellationRequest,
#         timestamp: u32
#     ) -> (CancellationProof, Future) {
#         // Keeper owns both records — enforced by ZK
#         assert(order.is_buy);
#         assert_eq(order.order_id, cancel_req.order_id);
#         assert_eq(cancel_req.trader, order.trader);  // refund must go to the order's trader

#         // escrow_amount is already reduced by any prior partial fills — refund what remains
#         let refund: u128 = order.escrow_amount;
#         assert(refund > 0u128);

#         let proof: CancellationProof = CancellationProof {
#             owner: cancel_req.trader,
#             order_id: order.order_id,
#             is_buy: true,
#             returned_amount: refund,
#             cancelled_at: timestamp,
#         };

#         // Refund quote tokens to trader
#         let refund_future: Future = token_registry.aleo/transfer_public(
#             order.quote_token_id,
#             cancel_req.trader,
#             refund
#         );

#         return (proof, finalize_cancel_order(self.caller, refund_future));
#     }

#     // Cancel BUY order with USDCx quote - refund USDCx to trader
#     async transition cancel_buy_order_usdcx(
#         order: Order,
#         cancel_req: CancellationRequest,
#         timestamp: u32
#     ) -> (CancellationProof, Future) {
#         assert(order.is_buy);
#         assert_eq(order.order_id, cancel_req.order_id);
#         assert_eq(cancel_req.trader, order.trader);
#         assert_eq(order.quote_token_id, USDCX_TOKEN_ID);

#         let refund: u128 = order.escrow_amount;
#         assert(refund > 0u128);

#         let proof: CancellationProof = CancellationProof {
#             owner: cancel_req.trader,
#             order_id: order.order_id,
#             is_buy: true,
#             returned_amount: refund,
#             cancelled_at: timestamp,
#         };

#         // Refund USDCx to trader
#         let refund_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
#             cancel_req.trader,
#             refund
#         );

#         return (proof, finalize_cancel_order(self.caller, refund_future));
#     }

#     // STEP 2 (KEEPER): Cancel SELL order - refund ALEO, give trader a CancellationProof
#     async transition cancel_sell_order(
#         order: Order,
#         cancel_req: CancellationRequest,
#         timestamp: u32
#     ) -> (CancellationProof, Future) {
#         // Keeper owns both records — enforced by ZK
#         assert(!order.is_buy);
#         assert_eq(order.order_id, cancel_req.order_id);
#         assert_eq(cancel_req.trader, order.trader);  // refund must go to the order's trader

#         // escrow_amount is already reduced by any prior partial fills — refund what remains
#         let refund: u128 = order.escrow_amount;
#         assert(refund > 0u128);

#         let proof: CancellationProof = CancellationProof {
#             owner: cancel_req.trader,
#             order_id: order.order_id,
#             is_buy: false,
#             returned_amount: refund,
#             cancelled_at: timestamp,
#         };

#         // Refund base tokens to trader (using base_token_id from Order)
#         let refund_future: Future = token_registry.aleo/transfer_public(
#             order.base_token_id,
#             cancel_req.trader,
#             refund
#         );

#         return (proof, finalize_cancel_order(self.caller, refund_future));
#     }

#     // Cancel SELL order with USDCx as BASE - refund USDCx to trader
#     async transition cancel_sell_order_usdcx(
#         order: Order,
#         cancel_req: CancellationRequest,
#         timestamp: u32
#     ) -> (CancellationProof, Future) {
#         assert(!order.is_buy);
#         assert_eq(order.order_id, cancel_req.order_id);
#         assert_eq(cancel_req.trader, order.trader);

#         let refund: u128 = order.escrow_amount;
#         assert(refund > 0u128);

#         let proof: CancellationProof = CancellationProof {
#             owner: cancel_req.trader,
#             order_id: order.order_id,
#             is_buy: false,
#             returned_amount: refund,
#             cancelled_at: timestamp,
#         };

#         // Refund USDCx to trader (USDCx was base token)
#         let refund_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
#             cancel_req.trader,
#             refund
#         );

#         return (proof, finalize_cancel_order(self.caller, refund_future));
#     }

#     async function finalize_cancel_order(caller: address, refund_future: Future) {
#         let is_keeper: bool = Mapping::get_or_use(keepers, caller, false);
#         assert(is_keeper);
#         refund_future.await();
#     }


#  // ========== SPLIT ORDER ==========

#     transition split_order(
#         order: Order,
#         fill_quantity: u128
#     ) -> (Order, Order) {
#         assert_eq(order.owner, self.caller);
#         assert(fill_quantity < order.quantity);
#         assert(fill_quantity > 0u128);

#         let remaining_quantity: u128 = order.quantity - fill_quantity;
#         let fill_escrow: u128 = (order.escrow_amount * fill_quantity) / order.quantity;
#         let remaining_escrow: u128 = order.escrow_amount - fill_escrow;

#         let fill_order: Order = Order {
#             owner: self.caller,
#             trader: order.trader,
#             order_id: order.order_id,
#             pair_id: order.pair_id,
#             is_buy: order.is_buy,
#             price: order.price,
#             quantity: fill_quantity,
#             base_token_id: order.base_token_id,
#             quote_token_id: order.quote_token_id,
#             escrow_amount: fill_escrow,
#             filled: 0u128,
#             created_at: order.created_at,
#             expires_at: order.expires_at,
#         };

#         let new_order_id: field = BHP256::hash_to_field(SplitOrderIdInput {
#             original_order_id: order.order_id,
#             remaining_quantity: remaining_quantity,
#         });

#         let remaining_order: Order = Order {
#             owner: self.caller,
#             trader: order.trader,
#             order_id: new_order_id,
#             pair_id: order.pair_id,
#             is_buy: order.is_buy,
#             price: order.price,
#             quantity: remaining_quantity,
#             base_token_id: order.base_token_id,
#             quote_token_id: order.quote_token_id,
#             escrow_amount: remaining_escrow,
#             filled: 0u128,
#             created_at: order.created_at,
#             expires_at: order.expires_at,
#         };

#         return (fill_order, remaining_order);
#     }