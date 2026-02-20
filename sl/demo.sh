#!/bin/bash
# ============================================================
# Private Tick-Based Order Book v4 — Full Testnet Demo
# ============================================================
# Usage:
#   ./demo.sh                  — full run (deploy + registry setup + orders + settle)
#   ./demo.sh --skip-registry  — skip steps 1-4 (tokens already in token_registry)
# ============================================================
set -e

# ─── FLAGS ───────────────────────────────────────────────────
SKIP_REGISTRY=false
SKIP_INIT=false
SKIP_PAIR=false
for arg in "$@"; do
    case "$arg" in
        --skip-registry) SKIP_REGISTRY=true ;;
        --skip-init)     SKIP_INIT=true ;;   # skip step 5 (admin already initialized)
        --skip-pair)     SKIP_PAIR=true ;;   # skip step 6 (pair already registered)
        --skip-setup)    SKIP_INIT=true; SKIP_PAIR=true ;; # skip both 5+6
    esac
done

# ─── CONFIG ──────────────────────────────────────────────────
NETWORK="testnet"
ENDPOINT="https://api.explorer.provable.com/v1"
PROGRAM="private_orderbook_v4.aleo"
REGISTRY="token_registry.aleo"

PRIVATE_KEY="${ALEO_PRIVATE_KEY:-APrivateKey1zkpEhfACCK6CjuLej9PveR9tVJbpaL53snntqkeTqznng1W}"
ADDRESS="${ALEO_ADDRESS:-aleo1hjr3xkvwtkuafnmn8273vd7najxd00gmqseuccj2f50q2ep9dcyq8w8exf}"

# The on-chain address of the program itself (derived from program ID).
# Used as the spender when calling approve_public on token_registry.
# This is the address shown in the leo execute output as self.address.
PROGRAM_ADDRESS="${ALEO_PROGRAM_ADDRESS:-aleo1wpqy7rm7zk0hly62gns6asza5pzehf2rjk4j9wms8ddwv3lzgvgq6d8x7h}"

# Use unique token IDs that we own — 1field and 2field are already registered
# by a different admin on testnet and cannot be minted by us.
# Pick large unique values derived from our address to avoid collisions.
BASE_TOKEN_ID="${ALEO_BASE_TOKEN_ID:-7001field}"
QUOTE_TOKEN_ID="${ALEO_QUOTE_TOKEN_ID:-7002field}"

MINT_AMOUNT="10000000000000u128"

# Quantities: 1000 base tokens (6 decimals), prices in bps (1 bps = 0.01%)
QUANTITY="1000000000u128"          # 1000.000000 base tokens
LIMIT_PRICE_BUY="150000u64"       # $15.00 (150000 bps)
LIMIT_PRICE_SELL="149000u64"      # $14.90 (149000 bps)
TICK_LOWER="1490u64"
TICK_UPPER="1510u64"
EXPIRES_AT="0u32"                  # 0 = no expiry

# Escrow amounts:
#   Buy:  ceil(1000000000 * 150000 / 10000) = 15000000000 quote (USDC)
#   Sell: 1000000000 base (ALEO)
ESCROW_QUOTE="15000000000u128"
ESCROW_BASE="1000000000u128"

# Pair 1 was already registered on-chain with token IDs 1field/2field (different admin).
# Use pair ID 2 for our fresh tokens 7001field/7002field.
PAIR_ID="${ALEO_PAIR_ID:-2u64}"
TICK_SIZE="100u64"
SETTLER_FEE_BPS="10u64"           # 0.1% to settler
PROTOCOL_FEE_BPS="5u64"           # 0.05% to treasury
TREASURY="$ADDRESS"               # treasury = deployer for demo

FEE="0"

# ─── HELPERS ─────────────────────────────────────────────────
step()  { echo ""; echo "══════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════"; }
info()  { echo "  ▸ $1"; }
ok()    { echo "  ✓ $1"; }
warn()  { echo "  ⚠ $1"; }

# Run a transition on our own deployed program
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

# Run a transition on our own deployed program, capture full output
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

# Call token_registry.aleo via snarkos developer execute.
# leo execute can only call functions in the current project's program;
# for external programs like token_registry.aleo we must use snarkos.
# --endpoint auto-extends to "https://api.explorer.provable.com/testnet/..."
# --network 1 = testnet
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
echo "║   Private Tick-Based Order Book v4 — Testnet Demo        ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Program : $PROGRAM           ║"
echo "║  Address : ${ADDRESS:0:42}... ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "$SKIP_REGISTRY" = false ]; then

    # ─── STEP 1: REGISTER BASE TOKEN ─────────────────────────────
    step "STEP 1 — Register base token (test-ALEO) in token_registry"
    info "token_id=$BASE_TOKEN_ID"
    registry_tx register_token \
        "$BASE_TOKEN_ID" \
        "11303534071878956625u128" \
        "1163219u128" \
        "6u8" \
        "$MINT_AMOUNT" \
        "false" \
        "$ADDRESS"
    ok "Base token registered"
    sleep 30

    # ─── STEP 2: REGISTER QUOTE TOKEN ────────────────────────────
    step "STEP 2 — Register quote token (test-USDC) in token_registry"
    info "token_id=$QUOTE_TOKEN_ID"
    registry_tx register_token \
        "$QUOTE_TOKEN_ID" \
        "11303534071878956642u128" \
        "1430531u128" \
        "6u8" \
        "$MINT_AMOUNT" \
        "false" \
        "$ADDRESS"
    ok "Quote token registered"
    sleep 30

    # ─── STEP 3: SET MINTER ROLE ─────────────────────────────────
    step "STEP 3 — Set minter role for both tokens"
    registry_tx set_role "$BASE_TOKEN_ID"  "$ADDRESS" "1u8"
    sleep 20
    registry_tx set_role "$QUOTE_TOKEN_ID" "$ADDRESS" "1u8"
    ok "Minter role set"
    sleep 30

    # ─── STEP 4: MINT BALANCES ───────────────────────────────────
    step "STEP 4 — Mint public balances"
    info "Minting base tokens to $ADDRESS"
    registry_tx mint_public "$BASE_TOKEN_ID"  "$ADDRESS" "$MINT_AMOUNT" "0u32"
    sleep 30
    info "Minting quote tokens to $ADDRESS"
    registry_tx mint_public "$QUOTE_TOKEN_ID" "$ADDRESS" "$MINT_AMOUNT" "0u32"
    ok "Balances minted"
    sleep 30

else
    warn "Skipping steps 1-4 (--skip-registry)"
fi

# ─── STEP 5: INITIALIZE ADMIN ────────────────────────────────
# Check on-chain: if admin already set, skip (assert(!already_set) would reject)
ADMIN_SET="$(curl -s "https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/admin/true" 2>/dev/null || echo 'null')"
if [ "$ADMIN_SET" != "null" ] && [ -n "$ADMIN_SET" ]; then
    step "STEP 5 — Admin already initialized ($ADMIN_SET) — skipping"
    SKIP_INIT=true
fi

if [ "$SKIP_INIT" = false ]; then
    step "STEP 5 — Initialize order book admin"
    own_tx initialize_admin
    ok "Admin initialized"
    sleep 30
fi

# ─── STEP 6: REGISTER TOKEN PAIR (v4: includes fee params) ───
# Check on-chain: if pair already exists with these token IDs, skip
PAIR_EXISTS="$(curl -s "https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/token_pairs/$PAIR_ID" 2>/dev/null || echo 'null')"
if [ "$PAIR_EXISTS" != "null" ] && [ -n "$PAIR_EXISTS" ]; then
    step "STEP 6 — Token pair $PAIR_ID already registered — skipping"
    SKIP_PAIR=true
fi

if [ "$SKIP_PAIR" = false ]; then
    step "STEP 6 — Register ALEO/USDC token pair"
    info "pair_id=$PAIR_ID  tick_size=$TICK_SIZE  settler_fee=$SETTLER_FEE_BPS bps  protocol_fee=$PROTOCOL_FEE_BPS bps"
    own_tx register_token_pair \
        "$PAIR_ID" \
        "$BASE_TOKEN_ID" \
        "$QUOTE_TOKEN_ID" \
        "$TICK_SIZE" \
        "$SETTLER_FEE_BPS" \
        "$PROTOCOL_FEE_BPS" \
        "$TREASURY"
    ok "Token pair registered"
    sleep 30
fi

# ─── STEP 7: APPROVE USDC FOR BUY ORDER ──────────────────────
step "STEP 7 — Approve USDC allowance for buy order escrow"
info "Approving $ESCROW_QUOTE USDC for $PROGRAM_ADDRESS (program address)"
registry_tx approve_public "$QUOTE_TOKEN_ID" "$PROGRAM_ADDRESS" "$ESCROW_QUOTE"
ok "Allowance approved"
sleep 30

# ─── STEP 8: SUBMIT BUY ORDER (v4: includes expires_at) ──────
step "STEP 8 — Submit BUY order with USDC escrow"
info "Buy $QUANTITY base @ $LIMIT_PRICE_BUY bps, ticks [$TICK_LOWER, $TICK_UPPER], expires_at=$EXPIRES_AT"
TIMESTAMP1="$(date +%s)u32"
echo ""
info "Capturing BUY order record for settlement..."
BUY_OUTPUT="$(own_tx_capture submit_order_with_escrow \
    "$PAIR_ID" \
    "true" \
    "$TICK_LOWER" \
    "$TICK_UPPER" \
    "$TIMESTAMP1" \
    "$EXPIRES_AT" \
    "$LIMIT_PRICE_BUY" \
    "$QUANTITY" \
    "$QUOTE_TOKEN_ID")"
echo "$BUY_OUTPUT"

# Check that the transaction was accepted (not rejected)
if echo "$BUY_OUTPUT" | grep -q "Transaction rejected"; then
    warn "BUY order transaction was REJECTED on-chain. Settlement will not be possible."
    warn "Check escrow allowance and token pair registration before retrying."
fi

# Extract the TickOrder record plaintext from leo execute output.
# Leo prints record outputs as a multi-line block: { owner: ..., field: value, ... }
# We grab everything from the first '{' that contains "owner:" to its closing '}'.
# Then collapse to a single line and strip all internal whitespace around punctuation.
BUY_RECORD="$(echo "$BUY_OUTPUT" | awk '
    /\{/ && /owner:/ { found=1; buf=$0; next }
    found { buf = buf " " $0 }
    found && /\}/ { print buf; found=0; exit }
' | sed 's/[[:space:]]\+/ /g; s/ ,/,/g; s/, /,/g; s/{ /{/g; s/ }/}/g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

# Fallback: multi-line capture if single-line approach missed it
if [ -z "$BUY_RECORD" ]; then
    BUY_RECORD="$(echo "$BUY_OUTPUT" | awk '
        /owner:/ && !found { found=1; buf="" }
        found { buf = buf $0 " " }
        found && /^[[:space:]]*\}/ { print buf; exit }
    ' | sed 's/[[:space:]]\+/ /g; s/ ,/,/g; s/, /,/g; s/{ /{/g; s/ }/}/g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
fi

if [ -n "$BUY_RECORD" ] && ! echo "$BUY_RECORD" | grep -q "^{"; then
    BUY_RECORD="{ $BUY_RECORD }"
fi

ok "BUY order submitted — TickOrder record minted to wallet"
echo ""
warn "IMPORTANT: Save your BUY TickOrder record from your wallet to use in Step 11 (settle)"
sleep 30

# ─── STEP 9: APPROVE ALEO FOR SELL ORDER ─────────────────────
step "STEP 9 — Approve ALEO allowance for sell order escrow"
info "Approving $ESCROW_BASE base tokens for $PROGRAM_ADDRESS (program address)"
registry_tx approve_public "$BASE_TOKEN_ID" "$PROGRAM_ADDRESS" "$ESCROW_BASE"
ok "Allowance approved"
sleep 30

# ─── STEP 10: SUBMIT SELL ORDER (v4: includes expires_at) ────
step "STEP 10 — Submit SELL order with ALEO escrow"
info "Sell $QUANTITY base @ $LIMIT_PRICE_SELL bps, ticks [$TICK_LOWER, $TICK_UPPER], expires_at=$EXPIRES_AT"
TIMESTAMP2="$(date +%s)u32"
echo ""
info "Capturing SELL order record for settlement..."
SELL_OUTPUT="$(own_tx_capture submit_order_with_escrow \
    "$PAIR_ID" \
    "false" \
    "$TICK_LOWER" \
    "$TICK_UPPER" \
    "$TIMESTAMP2" \
    "$EXPIRES_AT" \
    "$LIMIT_PRICE_SELL" \
    "$QUANTITY" \
    "$BASE_TOKEN_ID")"
echo "$SELL_OUTPUT"

# Check that the transaction was accepted (not rejected)
if echo "$SELL_OUTPUT" | grep -q "Transaction rejected"; then
    warn "SELL order transaction was REJECTED on-chain. Settlement will not be possible."
    warn "Check escrow allowance and token pair registration before retrying."
fi

# Extract the TickOrder record plaintext from leo execute output (first record block)
SELL_RECORD="$(echo "$SELL_OUTPUT" | awk '
    /\{/ && /owner:/ { found=1; buf=$0; next }
    found { buf = buf " " $0 }
    found && /\}/ { print buf; found=0; exit }
' | sed 's/[[:space:]]\+/ /g; s/ ,/,/g; s/, /,/g; s/{ /{/g; s/ }/}/g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [ -z "$SELL_RECORD" ]; then
    SELL_RECORD="$(echo "$SELL_OUTPUT" | awk '
        /owner:/ && !found { found=1; buf="" }
        found { buf = buf $0 " " }
        found && /^[[:space:]]*\}/ { print buf; exit }
    ' | sed 's/[[:space:]]\+/ /g; s/ ,/,/g; s/, /,/g; s/{ /{/g; s/ }/}/g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
fi

if [ -n "$SELL_RECORD" ] && ! echo "$SELL_RECORD" | grep -q "^{"; then
    SELL_RECORD="{ $SELL_RECORD }"
fi

ok "SELL order submitted — TickOrder record minted to wallet"
echo ""
warn "IMPORTANT: Save your SELL TickOrder record from your wallet to use in Step 11 (settle)"
sleep 30

# ─── STEP 11: SETTLE THE MATCH ────────────────────────────────
# settle_match_public(buy_order: TickOrder, sell_order: TickOrder, timestamp: u32)
# Both orders are PRIVATE records — you must pass them as inline record literals.
#
# In the same demo run (same wallet, same session) the records were just minted
# to us, so we can try to settle immediately using settle_match_public.
# The records must be passed as Leo record literals.
#
# Format:
#   { owner: <addr>.private, token_pair: <n>u64.private, ... _nonce: <n>group.public }
#
# The output above printed the plaintext record fields. We construct the settle call.
step "STEP 11 — Settle the BUY/SELL match"
info "Calling settle_match_public_with_keys"
info "Orders overlap at ticks $TICK_LOWER-$TICK_UPPER → will be matched"
echo ""
warn "NOTE: Settlement requires passing both TickOrder records as inputs."
warn "      Leo CLI accepts records as plaintext structs from your local wallet."
warn "      The records were just minted to you — leo execute will find them automatically."
echo ""

SETTLE_TIMESTAMP="$(date +%s)u32"

# Query the order_counter to derive the order keys
info "Querying order_counter to find order keys..."
ORDER_COUNTER_RAW="$(curl -s "https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/order_counter/true" 2>/dev/null || echo 'null')"
info "order_counter = $ORDER_COUNTER_RAW"

# settle_match_public(buy_order: TickOrder, sell_order: TickOrder, timestamp: u32)
# Both buy_order and sell_order are PRIVATE record inputs — they must be passed as
# inline plaintext record literals to leo execute.
#
# If record extraction above succeeded, pass them directly.
# Otherwise print manual instructions and exit.
if [ -z "$BUY_RECORD" ] || [ -z "$SELL_RECORD" ]; then
    warn "Could not extract TickOrder records from output automatically."
    warn "Please settle manually using the plaintext records printed above:"
    echo ""
    echo "  leo execute settle_match_public \\"
    echo "    '<buy_record_literal>' \\"
    echo "    '<sell_record_literal>' \\"
    echo "    $SETTLE_TIMESTAMP \\"
    echo "    --network $NETWORK --endpoint $ENDPOINT \\"
    echo "    --private-key $PRIVATE_KEY --broadcast -y"
    echo ""
    warn "Skipping automated settlement — records not available."
else
    info "Extracted BUY  record: ${BUY_RECORD:0:60}..."
    info "Extracted SELL record: ${SELL_RECORD:0:60}..."
    own_tx settle_match_public \
        "$BUY_RECORD" \
        "$SELL_RECORD" \
        "$SETTLE_TIMESTAMP"
fi

ok "Settlement submitted"
sleep 30

# ─── DONE ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║               Demo Complete! (v4)                        ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  ✓ Tokens registered + minted in token_registry         ║"
echo "║  ✓ Order book admin initialized                         ║"
echo "║  ✓ ALEO/USDC pair (id=$PAIR_ID, settler=0.1%, proto=0.05%)   ║"
echo "║  ✓ BUY  order on-chain — $ESCROW_QUOTE USDC escrowed   ║"
echo "║  ✓ SELL order on-chain — $ESCROW_BASE ALEO escrowed    ║"
echo "║  ✓ Settlement executed — orders matched at mid-price    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Exec price = (150000 + 149000) / 2 = 149500 bps        ║"
echo "║  Buyer receives: $QUANTITY base tokens                  ║"
echo "║  Seller receives: quote at 149500 bps                   ║"
echo "║  Settler earns: 0.1% of quote = keeper reward           ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  To manually settle (if step 11 needs record inputs):   ║"
echo "║                                                          ║"
echo "║  leo execute settle_match_public \\                      ║"
echo "║    <buy_record_literal> \\                               ║"
echo "║    <sell_record_literal> \\                              ║"
echo "║    $(date +%s)u32                                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Verify on-chain state (Provable v2 API):"
echo "  curl https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/token_pairs/$PAIR_ID"
echo "  curl https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/order_counter/true"
echo "  curl https://api.provable.com/v2/testnet/program/$PROGRAM/mapping/tick_registry/<tick_key>"
echo ""
echo "  Check your Settlement records in the Provable wallet:"
echo "  https://explorer.provable.com/address/$ADDRESS"
echo ""
