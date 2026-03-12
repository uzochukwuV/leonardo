#!/bin/bash
# ============================================================
# Private Order Book v10 — Record-Based Demo
# ============================================================
# Architecture: Keeper model (orders owned by keeper)
#
# Usage:
#   ./demo.sh                  — full run (init + orders + settle)
#   ./demo.sh --skip-init      — skip initialization
#   ./demo.sh --orders-only    — only submit orders
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
PROGRAM="private_orderbook_v10.aleo"
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
echo "║   Private Order Book v10 — Record-Based Architecture    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Program : $PROGRAM                  ║"
echo "║  Keeper  : ${KEEPER_ADDRESS:0:42}... ║"
echo "║  Pair    : ALEO/TKNB (ID=$PAIR_ID)                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Architecture:                                           ║"
echo "║    • Orders are RECORDS owned by KEEPER                  ║"
echo "║    • Users get receipts as proof                         ║"
echo "║    • Keeper matches orders and transfers tokens          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── STEP 1: INITIALIZE ─────────────────────────────────────
if [ "$SKIP_INIT" = false ]; then
    step "STEP 1 — Initialize program"
    info "Admin: $ADDRESS"
    info "Treasury: $TREASURY_ADDRESS"

    own_tx initialize "$ADDRESS" "$TREASURY_ADDRESS"
    ok "Program initialized"
    sleep 30

    step "STEP 1b — Add keeper"
    info "Keeper: $KEEPER_ADDRESS"

    own_tx add_keeper "$KEEPER_ADDRESS"
    ok "Keeper added"
    sleep 30

    step "STEP 1c — Register token pair"
    info "Pair ID: $PAIR_ID"
    info "Base: ALEO ($NATIVE_CREDITS_ID)"
    info "Quote: TKNB ($TOKEN_B_ID)"

    own_tx register_pair "$PAIR_ID" "$NATIVE_CREDITS_ID" "$TOKEN_B_ID" "100u64"
    ok "Token pair registered"
    sleep 30
fi

# ─── STEP 2: SUBMIT SELL ORDER (Native ALEO) ─────────────────
step "STEP 2 — Submit SELL order (selling ALEO for TKNB)"
info "Function: submit_order_credits"
info "Keeper: $KEEPER_ADDRESS (will own Order record)"
info "Selling $QUANTITY ALEO @ $PRICE_SELL bps"
info "Escrow: $ESCROW_SELL microcredits"
echo ""

TIMESTAMP1="$(date +%s)u32"
EXPIRES="0u32"

info "Executing submit_order_credits..."
SELL_OUTPUT="$(own_tx_capture submit_order_credits \
    "$KEEPER_ADDRESS" \
    "$PAIR_ID" \
    "false" \
    "$PRICE_SELL" \
    "$QUANTITY" \
    "$ESCROW_SELL" \
    "$TIMESTAMP1" \
    "$EXPIRES")"

echo "$SELL_OUTPUT"

if echo "$SELL_OUTPUT" | grep -q "Transaction rejected"; then
    warn "SELL order transaction was REJECTED on-chain."
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
info "Function: submit_order_token"
info "Keeper: $KEEPER_ADDRESS (will own Order record)"
info "Buying $QUANTITY ALEO @ $PRICE_BUY bps"
info "Escrow: $ESCROW_BUY TKNB"
echo ""

TIMESTAMP2="$(date +%s)u32"

info "Executing submit_order_token..."
BUY_OUTPUT="$(own_tx_capture submit_order_token \
    "$KEEPER_ADDRESS" \
    "$PAIR_ID" \
    "true" \
    "$PRICE_BUY" \
    "$QUANTITY" \
    "$TOKEN_B_ID" \
    "$ESCROW_BUY" \
    "$TIMESTAMP2" \
    "$EXPIRES")"

echo "$BUY_OUTPUT"

if echo "$BUY_OUTPUT" | grep -q "Transaction rejected"; then
    warn "BUY order transaction was REJECTED on-chain."
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
    echo "║    • OrderReceipt records as proof                       ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 0
fi

# ─── STEP 5: SETTLE MATCH (KEEPER) ───────────────────────────
step "STEP 5 — Keeper settles the match"
info "Function: settle_credits_base"
info "Keeper provides BOTH Order records"
info "Base token: Native ALEO (0field)"
info "Quote token: TKNB ($TOKEN_B_ID)"
echo ""

# Note: In real usage, keeper would have the Order records from previous transactions
# For demo, we need to provide them as inputs (record format)

warn "Settlement requires Order records as inputs."
warn "In production, keeper's wallet holds these records."
warn "Demo cannot easily serialize records for CLI."
echo ""
echo "To test settlement manually:"
echo "  1. Keeper retrieves Order records from wallet"
echo "  2. Calls settle_credits_base(buy_order, sell_order, fill_qty, fill_price, timestamp)"
echo ""

# ─── DONE ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║               Demo Complete! (v10)                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Architecture: Record-based (Keeper model)               ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Privacy Benefits:                                       ║"
echo "║    • Orders encrypted in records (not public mappings)   ║"
echo "║    • Only keeper sees order details                      ║"
echo "║    • On-chain: only nullifiers visible                   ║"
echo "║    • No public order book to front-run                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Flow:                                                   ║"
echo "║    1. User submits order → Order to keeper, Receipt to   ║"
echo "║       user                                               ║"
echo "║    2. Keeper matches → Tokens transferred, proofs to     ║"
echo "║       users                                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
