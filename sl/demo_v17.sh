#!/bin/bash
# ============================================================
# Private Order Book v17 — Record-Based Demo (CORRECTED)
# ============================================================
# Architecture: Keeper model (orders owned by keeper)
# This script demonstrates the complete v17 order book flow
#
# Usage:
#   ./demo_v17.sh                  — full run (init + orders + settle)
#   ./demo_v17.sh --skip-init      — skip initialization
#   ./demo_v17.sh --orders-only    — only submit orders
# ============================================================
set -e

# ─── FLAGS ───────────────────────────────────────────────────
SKIP_INIT=false
ORDERS_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --skip-init)     SKIP_INIT=true ;;
        --orders-only)   ORDERS_ONLY=true ;;
    esac
done

# ─── CONFIG ──────────────────────────────────────────────────
NETWORK="testnet"
ENDPOINT="https://api.explorer.provable.com/v1"
PROGRAM="private_orderbook_v17.aleo"  # ✅ FIXED: v10 → v17
REGISTRY="token_registry.aleo"

# Admin/Keeper private key (same for demo)
PRIVATE_KEY="${ALEO_PRIVATE_KEY:-APrivateKey1zkpEhfACCK6CjuLej9PveR9tVJbpaL53snntqkeTqznng1W}"
ADDRESS="${ALEO_ADDRESS:-aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf}"

# Keeper address (same as admin for demo)
KEEPER_ADDRESS="$ADDRESS"

# Treasury address
TREASURY_ADDRESS="$ADDRESS"

# Token IDs
TOKEN_B_ID="7002field"         # TKNB (quote token)
NATIVE_CREDITS_ID="0field"     # Native ALEO (base token)

# Demo will use Pair 1: ALEO/TKNB
PAIR_ID="1u64"

# Order parameters
QUANTITY="1000000u128"         # 1.000000 ALEO
PRICE_BUY="12500u64"           # 1.25 TKNB per ALEO (basis points)
PRICE_SELL="12000u64"          # 1.20 TKNB per ALEO

# Escrow amounts
# Sell ALEO: escrow 1 ALEO = 1000000 microcredits
ESCROW_SELL="1000000u64"
# Buy ALEO: escrow TKNB = quantity * price / 10000 = 1000000 * 12500 / 10000 = 1250000
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
echo "║   Private Order Book v17 — Record-Based Architecture    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Program : $PROGRAM                  ║"
echo "║  Keeper  : ${KEEPER_ADDRESS:0:42}... ║"
echo "║  Pair    : ALEO/TKNB (ID=$PAIR_ID)                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Architecture:                                           ║"
echo "║    • Orders are RECORDS owned by KEEPER                  ║"
echo "║    • Users get receipts as proof                         ║"
echo "║    • Keeper matches orders and transfers tokens          ║"
echo "║    • Two-step cancellation with proofs                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── STEP 1: INITIALIZE ─────────────────────────────────────
if [ "$SKIP_INIT" = false ]; then

    own_tx add_keeper "$KEEPER_ADDRESS"
    ok "Keeper added"
    sleep 30

    step "STEP 1c — Register token pair"
    info "Pair ID: $PAIR_ID"
    info "Base: ALEO ($NATIVE_CREDITS_ID)"
    info "Quote: TKNB ($TOKEN_B_ID)"

    own_tx register_pair "$PAIR_ID" "$TOKEN_B_ID" "100u64"
    ok "Token pair registered"
    sleep 30
fi

# ─── STEP 2: SUBMIT SELL ORDER (Native ALEO) ─────────────────
step "STEP 2 — Submit SELL order (selling ALEO for TKNB)"
info "Function: submit_sell_order"
info "Keeper: $KEEPER_ADDRESS (will own Order record)"
info "Selling $QUANTITY ALEO @ $PRICE_SELL bps"
info "Escrow: $ESCROW_SELL microcredits"
echo ""

TIMESTAMP1="$(date +%s)u32"
EXPIRES="0u32"

info "Executing submit_sell_order..."
info "Parameters:"
info "  pair_id: $PAIR_ID"
info "  quote_token_id: $TOKEN_B_ID"
info "  price: $PRICE_SELL"
info "  quantity: $QUANTITY"
info "  escrow_aleo: $ESCROW_SELL"
info "  timestamp: $TIMESTAMP1"
info "  expires_at: $EXPIRES"
info "  orchestrator_addr: $KEEPER_ADDRESS"
echo ""

SELL_OUTPUT="$(own_tx_capture submit_sell_order \
    "$PAIR_ID" \
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

# ─── STEP 3: APPROVE TKNB FOR BUY ORDER ──────────────────────
step "STEP 3 — Approve TKNB for buy order escrow"
info "This step requires prior approval via token_registry.aleo"
info "Run: snarkos developer execute token_registry.aleo approve_public $TOKEN_B_ID $PROGRAM_ADDRESS $ESCROW_BUY"
warn "Skipping approval step (assume already approved)"
echo ""

# ─── STEP 4: SUBMIT BUY ORDER (ARC-21 TKNB) ──────────────────
step "STEP 4 — Submit BUY order (buying ALEO with TKNB)"
info "Function: submit_buy_order"
info "Keeper: $KEEPER_ADDRESS (will own Order record)"
info "Buying $QUANTITY ALEO @ $PRICE_BUY bps"
info "Escrow: $ESCROW_BUY TKNB"
echo ""

TIMESTAMP2="$(date +%s)u32"

info "Executing submit_buy_order..."
info "Parameters:"
info "  pair_id: $PAIR_ID"
info "  quote_token_id: $TOKEN_B_ID"
info "  price: $PRICE_BUY"
info "  quantity: $QUANTITY"
info "  escrow_quote: $ESCROW_BUY"
info "  timestamp: $TIMESTAMP2"
info "  expires_at: $EXPIRES"
info "  orchestrator_addr: $KEEPER_ADDRESS"
echo ""

BUY_OUTPUT="$(own_tx_capture submit_buy_order \
    "$PAIR_ID" \
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

if [ "$ORDERS_ONLY" = true ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║           Orders Submitted! (--orders-only)              ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  The keeper now holds:                                   ║"
    echo "║    • SELL Order record (1 ALEO @ 12000 bps)              ║"
    echo "║    • BUY Order record (1 ALEO @ 12500 bps)               ║"
    echo "║                                                          ║"
    echo "║  Users hold:                                             ║"
    echo "║    • Receipt records as proof                            ║"
    echo "║                                                          ║"
    echo "║  Next steps:                                             ║"
    echo "║    1. Keeper matches orders via settle_match()           ║"
    echo "║    2. Users receive SettlementProof records              ║"
    echo "║    3. Tokens transferred on-chain                        ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 0
fi

sleep 30

# ─── STEP 5: SETTLE MATCH (KEEPER) ───────────────────────────
step "STEP 5 — Keeper settles the match"
info "Function: settle_match"
info "Keeper provides BOTH Order records"
info "Base token: Native ALEO (0field)"
info "Quote token: TKNB ($TOKEN_B_ID)"
echo ""

# Calculate settlement parameters
FILL_QUANTITY="$QUANTITY"  # Full fill
FILL_PRICE="12250u64"      # Midpoint between bid (12500) and ask (12000)
SETTLEMENT_TIMESTAMP="$(date +%s)u32"

info "Settlement Parameters:"
info "  fill_quantity: $FILL_QUANTITY"
info "  fill_price: $FILL_PRICE (midpoint)"
info "  timestamp: $SETTLEMENT_TIMESTAMP"
info "  treasury_addr: $TREASURY_ADDRESS"
echo ""

warn "Settlement requires Order records as inputs."
warn "In production, keeper's wallet holds these records."
warn "Demo cannot easily serialize records for CLI."
echo ""
echo "To test settlement manually:"
echo "  1. Keeper retrieves Order records from wallet"
echo "  2. Calls settle_match(buy_order, sell_order, fill_qty, fill_price, timestamp, treasury_addr)"
echo "  3. Receives:"
echo "     - Updated buy_order (filled += fill_qty, escrow_amount -= quote_amount)"
echo "     - Updated sell_order (filled += fill_qty, escrow_amount -= fill_qty)"
echo "     - buyer_proof (SettlementProof for buyer)"
echo "     - seller_proof (SettlementProof for seller)"
echo "  4. Tokens transferred:"
echo "     - Buyer receives ALEO"
echo "     - Seller receives TKNB (minus fees)"
echo "     - Keeper receives settler fee"
echo "     - Treasury receives protocol fee"
echo ""

# ─── STEP 6: CANCELLATION (OPTIONAL) ─────────────────────────
step "STEP 6 — Cancellation flow (optional)"
info "v17 implements two-step cancellation"
echo ""

echo "STEP 6a — Trader requests cancellation:"
echo "  1. Trader calls request_cancel(receipt, keeper_addr, timestamp)"
echo "  2. Returns CancellationRequest record (owned by keeper)"
echo ""

echo "STEP 6b — Keeper processes cancellation:"
echo "  1. Keeper calls cancel_buy_order(order, cancel_req, timestamp)"
echo "     OR cancel_sell_order(order, cancel_req, timestamp)"
echo "  2. Returns CancellationProof record (owned by trader)"
echo "  3. Refunds escrowed tokens:"
echo "     - Buy order: refund quote tokens"
echo "     - Sell order: refund ALEO"
echo ""

# ─── DONE ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║               Demo Complete! (v17)                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Architecture: Record-based (Keeper model)               ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Privacy Benefits:                                       ║"
echo "║    • Orders encrypted in records (not public mappings)   ║"
echo "║    • Only keeper sees order details                      ║"
echo "║    • On-chain: only nullifiers visible                   ║"
echo "║    • No public order book to front-run                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Complete Flow:                                          ║"
echo "║    1. User submits order → Order to keeper, Receipt to   ║"
echo "║       user                                               ║"
echo "║    2. Keeper matches → Tokens transferred, proofs to     ║"
echo "║       users                                              ║"
echo "║    3. User can cancel → Two-step cancellation with       ║"
echo "║       refund proof                                       ║"
echo "║    4. Partial fills supported → Updated orders returned  ║"
echo "║       from settle_match                                  ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Key Improvements in v17:                                ║"
echo "║    • Two-step cancellation (request + process)           ║"
echo "║    • Partial fill support via updated Order records      ║"
echo "║    • CancellationProof records for traders               ║"
echo "║    • Better fee handling (settler + protocol)            ║"
echo "║    • Improved record ownership model                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
