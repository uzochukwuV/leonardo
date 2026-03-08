#!/bin/bash
# ============================================================
# Private Tick-Based Order Book v6 — Testnet Demo
# ============================================================
# Usage:
#   ./demo.sh                  — full run (submit orders + settle)
#   ./demo.sh --skip-registry  — skip token registration steps
#   ./demo.sh --orders-only    — only submit orders (no settlement)
# ============================================================
set -e

# ─── FLAGS ───────────────────────────────────────────────────
SKIP_REGISTRY=false
ORDERS_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --skip-registry) SKIP_REGISTRY=true ;;
        --orders-only)   ORDERS_ONLY=true ;;
    esac
done

# ─── CONFIG ──────────────────────────────────────────────────
NETWORK="testnet"
ENDPOINT="https://api.explorer.provable.com/v1"
PROGRAM="private_orderbook_0000v8testnet.aleo"
REGISTRY="token_registry.aleo"

PRIVATE_KEY="${ALEO_PRIVATE_KEY:-APrivateKey1zkpEhfACCK6CjuLej9PveR9tVJbpaL53snntqkeTqznng1W}"
ADDRESS="${ALEO_ADDRESS:-aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf}"

# Program's on-chain address (for approval calls)
PROGRAM_ADDRESS="${ALEO_PROGRAM_ADDRESS:-aleo1wpqy7rm7zk0hly62gns6asza5pzehf2rjk4j9wms8ddwv3lzgvgq6d8x7h}"

# Token IDs (registered ARC-21 tokens)
TOKEN_A_ID="7001field"   # TKNA
TOKEN_B_ID="7002field"   # TKNB
NATIVE_CREDITS_ID="0field"  # Native ALEO

# Token pairs registered on-chain:
#   Pair 2: ALEO (0field) / TOKEN_B (7002field)
#   Pair 3: ALEO (0field) / TOKEN_A (7001field)
#   Pair 4: TOKEN_A (7001field) / TOKEN_B (7002field)

# Demo will use Pair 2: ALEO/TKNB
PAIR_ID="2u64"

# Order parameters
QUANTITY="1000000u128"        # 1.000000 base tokens (6 decimals)
LIMIT_PRICE_BUY="12500u64"    # 1.25 TKNB per ALEO (in basis points: 1.25 * 10000 = 12500)
LIMIT_PRICE_SELL="12000u64"   # 1.20 TKNB per ALEO
TICK_LOWER="120u64"           # Tick for 1.20
TICK_UPPER="130u64"           # Tick for 1.30
EXPIRES_AT="0u32"             # 0 = no expiry

# Escrow amounts:
#   Buy ALEO: escrow TKNB (quote) = quantity * price / 10000 = 1000000 * 12500 / 10000 = 1250000
#   Sell ALEO: escrow ALEO (base) = quantity = 1000000 (but native uses u64)
ESCROW_QUOTE="1250000u128"    # TKNB for buy order
ESCROW_BASE="1000000u64"      # Native ALEO credits for sell order

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

# Call token_registry.aleo via snarkos
registry_tx() {
    local func="$1"; shift
    snarkos developer execute \
        "$REGISTRY" "$func" "$@" \
        --private-key "$PRIVATE_KEY" \
        --endpoint "https://api.explorer.provable.com" \
        --network 1 \
        --priority-fee "$FEE" \
        --broadcast
}

# ─── BANNER ──────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Private Tick-Based Order Book v5 — Testnet Demo        ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Program : $PROGRAM       ║"
echo "║  Address : ${ADDRESS:0:42}... ║"
echo "║  Pair    : ALEO/TKNB (ID=$PAIR_ID)                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── STEP 1: VERIFY TOKEN PAIR EXISTS ────────────────────────
step "STEP 1 — Verify token pair is registered"
PAIR_EXISTS="$(curl -s "https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/token_pairs/$PAIR_ID" 2>/dev/null || echo 'null')"
if [ "$PAIR_EXISTS" = "null" ] || [ -z "$PAIR_EXISTS" ]; then
    warn "Token pair $PAIR_ID not found! Please register the pair first."
    exit 1
fi
ok "Token pair $PAIR_ID exists: $PAIR_EXISTS"

# ─── STEP 2: SUBMIT SELL ORDER (Native ALEO) ─────────────────
# Selling ALEO for TKNB → escrow native ALEO credits
# Uses submit_order_credits (no approval needed for native credits)
step "STEP 2 — Submit SELL order (selling ALEO for TKNB)"
info "Function: submit_order_credits"
info "Selling $QUANTITY ALEO @ $LIMIT_PRICE_SELL bps"
info "Tick range: [$TICK_LOWER, $TICK_UPPER]"
info "Escrow: $ESCROW_BASE native ALEO credits"
echo ""

TIMESTAMP1="$(date +%s)u32"

info "Executing submit_order_credits..."
SELL_OUTPUT="$(own_tx_capture submit_order_credits \
    "$PAIR_ID" \
    "false" \
    "$TICK_LOWER" \
    "$TICK_UPPER" \
    "$TIMESTAMP1" \
    "$EXPIRES_AT" \
    "$LIMIT_PRICE_SELL" \
    "$QUANTITY")"

echo "$SELL_OUTPUT"

if echo "$SELL_OUTPUT" | grep -q "Transaction rejected"; then
    warn "SELL order transaction was REJECTED on-chain."
    warn "Check that you have enough ALEO credits."
else
    ok "SELL order submitted successfully!"
fi
echo ""

# ─── STEP 3: APPROVE TKNB FOR BUY ORDER ──────────────────────
# Buying ALEO with TKNB → need to approve TKNB escrow
step "STEP 3 — Approve TKNB allowance for buy order escrow"
info "Approving $ESCROW_QUOTE TKNB for program $PROGRAM_ADDRESS"

registry_tx approve_public "$TOKEN_B_ID" "$PROGRAM_ADDRESS" "$ESCROW_QUOTE"
ok "TKNB allowance approved"
echo ""
info "Waiting for approval to be confirmed..."
sleep 30

# ─── STEP 4: SUBMIT BUY ORDER (ARC-21 TKNB) ──────────────────
# Buying ALEO with TKNB → escrow TKNB (ARC-21)
# Uses submit_order (requires prior approval)
step "STEP 4 — Submit BUY order (buying ALEO with TKNB)"
info "Function: submit_order"
info "Buying $QUANTITY ALEO @ $LIMIT_PRICE_BUY bps"
info "Tick range: [$TICK_LOWER, $TICK_UPPER]"
info "Escrow: $ESCROW_QUOTE TKNB"
echo ""

TIMESTAMP2="$(date +%s)u32"

info "Executing submit_order..."
BUY_OUTPUT="$(own_tx_capture submit_order \
    "$PAIR_ID" \
    "true" \
    "$TICK_LOWER" \
    "$TICK_UPPER" \
    "$TIMESTAMP2" \
    "$EXPIRES_AT" \
    "$LIMIT_PRICE_BUY" \
    "$QUANTITY" \
    "$TOKEN_B_ID")"

echo "$BUY_OUTPUT"

if echo "$BUY_OUTPUT" | grep -q "Transaction rejected"; then
    warn "BUY order transaction was REJECTED on-chain."
    warn "Check that you have enough TKNB and approval was successful."
else
    ok "BUY order submitted successfully!"
fi
echo ""

if [ "$ORDERS_ONLY" = true ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║               Orders Submitted! (--orders-only)          ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  ✓ SELL order: $QUANTITY ALEO @ $LIMIT_PRICE_SELL bps   ║"
    echo "║  ✓ BUY order:  $QUANTITY ALEO @ $LIMIT_PRICE_BUY bps    ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Verify orders on-chain:"
    echo "  curl https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/order_counter/true"
    echo ""
    exit 0
fi

# ─── STEP 5: QUERY ORDER IDS ─────────────────────────────────
step "STEP 5 — Query order IDs from on-chain state"
info "Fetching order_counter to determine order IDs..."

ORDER_COUNTER_RAW="$(curl -s "https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/order_counter/true" 2>/dev/null || echo 'null')"
info "order_counter = $ORDER_COUNTER_RAW"

# Extract numeric value (e.g., "5u64" -> 5)
ORDER_COUNT="$(echo "$ORDER_COUNTER_RAW" | sed 's/[^0-9]//g')"
if [ -z "$ORDER_COUNT" ] || [ "$ORDER_COUNT" -lt 2 ]; then
    warn "Not enough orders on-chain for settlement."
    warn "order_counter = $ORDER_COUNTER_RAW"
    exit 1
fi

# The last two orders are our SELL (first) and BUY (second)
SELL_ORDER_ID="$((ORDER_COUNT - 1))field"
BUY_ORDER_ID="${ORDER_COUNT}field"

ok "SELL order ID: $SELL_ORDER_ID"
ok "BUY order ID: $BUY_ORDER_ID"

# ─── STEP 6: SETTLE THE MATCH ────────────────────────────────
step "STEP 6 — Settle the BUY/SELL match"
info "Function: settle_match"
info "Base token: Native ALEO (0field)"
info "Quote token: TKNB ($TOKEN_B_ID)"
info "Buy order: $BUY_ORDER_ID, Sell order: $SELL_ORDER_ID"
echo ""

SETTLE_TIMESTAMP="$(date +%s)u32"

# settle_match(buy_order_id, sell_order_id, timestamp)
info "Executing settle_match..."
own_tx settle_match \
    "$BUY_ORDER_ID" \
    "$SELL_ORDER_ID" \
    "$SETTLE_TIMESTAMP"

ok "Settlement step 1 completed"
sleep 30

# ─── STEP 7: EXECUTE TRANSFERS ───────────────────────────────
step "STEP 7 — Execute token transfers"
info "Function: execute_transfers_credits_base"

# Calculate fill quantities (simplified: assume full fill)
# fill_qty is the base token amount (native ALEO credits) - uses u64
FILL_QTY="1000000u64"
# Execution price = midpoint of buy/sell prices
# (12500 + 12000) / 2 = 12250 bps
# quote_amount = fill_qty * exec_price / 10000 = 1000000 * 12250 / 10000 = 1225000
QUOTE_AMOUNT="1225000u128"
# settler_fee = 0.1% of quote_amount = 1225
SETTLER_FEE="1225u128"
# seller_receives = quote_amount - settler_fee - protocol_fee
# protocol_fee = 0.05% = 612 (approximately)
# seller_receives = 1225000 - 1225 - 612 = 1223163
SELLER_RECEIVES="1223163u128"

info "Fill quantity: $FILL_QTY ALEO"
info "Quote amount: $QUOTE_AMOUNT TKNB"
info "Seller receives: $SELLER_RECEIVES TKNB"
info "Settler fee: $SETTLER_FEE TKNB"
echo ""

# execute_transfers_credits_base(buy_order_id, sell_order_id, quote_token_id, fill_qty, quote_amount, seller_receives, settler_fee, buyer, seller)
info "Executing execute_transfers_credits_base..."
own_tx execute_transfers_credits_base \
    "$BUY_ORDER_ID" \
    "$SELL_ORDER_ID" \
    "$TOKEN_B_ID" \
    "$FILL_QTY" \
    "$QUOTE_AMOUNT" \
    "$SELLER_RECEIVES" \
    "$SETTLER_FEE" \
    "$ADDRESS" \
    "$ADDRESS"

ok "Transfers executed"

# ─── DONE ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║               Demo Complete! (v5)                        ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  ✓ SELL order: $QUANTITY ALEO @ $LIMIT_PRICE_SELL bps   ║"
echo "║  ✓ BUY order:  $QUANTITY ALEO @ $LIMIT_PRICE_BUY bps    ║"
echo "║  ✓ Settlement executed — orders matched                  ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Exec price = (12500 + 12000) / 2 = 12250 bps           ║"
echo "║  = 1.225 TKNB per ALEO                                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Verify on-chain state:"
echo "  curl https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/order_counter/true"
echo "  curl https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/orders/$BUY_ORDER_ID"
echo "  curl https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/orders/$SELL_ORDER_ID"
echo ""
echo "  Check balances:"
echo "  curl https://api.provable.com/v2/testnet/program/credits.aleo/mapping/account/$ADDRESS"
echo "  curl 'https://api.provable.com/v2/testnet/program/token_registry.aleo/mapping/authorized_balances/{%20token_id:%20$TOKEN_B_ID,%20account:%20$ADDRESS%20}'"
echo ""
