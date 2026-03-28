import credits.aleo;
import token_registry.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
program private_matching_orderbook_v1.aleo;

record Order:
    owner as address.private;
    trader as address.private;
    order_id as field.private;
    pair_id as u64.private;
    is_buy as boolean.private;
    price as u64.private;
    quantity as u128.private;
    base_token_id as field.private;
    quote_token_id as field.private;
    escrow_amount as u128.private;
    filled as u128.private;
    created_at as u32.private;
    expires_at as u32.private;

record Receipt:
    owner as address.private;
    order_id as field.private;
    pair_id as u64.private;
    is_buy as boolean.private;
    price as u64.private;
    quantity as u128.private;
    quote_token_id as field.private;
    escrow_amount as u128.private;
    created_at as u32.private;

record SettlementProof:
    owner as address.private;
    order_id as field.private;
    fill_quantity as u128.private;
    fill_price as u64.private;
    received_token as field.private;
    received_amount as u128.private;
    settled_at as u32.private;

struct TokenPair:
    base_token_id as field;
    quote_token_id as field;
    tick_size as u64;
    is_active as boolean;

struct OrderIdInput:
    caller as address;
    timestamp as u32;
    price as u64;
    quantity as u128;
    is_buy as boolean;
    pair_id as u64;

mapping orchestrator:
    key as boolean.public;
    value as address.public;

mapping keepers:
    key as address.public;
    value as boolean.public;

mapping token_pairs:
    key as u64.public;
    value as TokenPair.public;

mapping treasury:
    key as boolean.public;
    value as address.public;

mapping pair_volume:
    key as u64.public;
    value as u128.public;

mapping order_counter:
    key as boolean.public;
    value as u64.public;

mapping pair_count:
    key as boolean.public;
    value as u64.public;

mapping pair_ids:
    key as u64.public;
    value as u64.public;

function add_keeper:
    input r0 as address.private;
    async add_keeper self.caller r0 into r1;
    output r1 as private_matching_orderbook_v1.aleo/add_keeper.future;

finalize add_keeper:
    input r0 as address.public;
    input r1 as address.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    set true into keepers[r1];

function remove_keeper:
    input r0 as address.private;
    async remove_keeper self.caller r0 into r1;
    output r1 as private_matching_orderbook_v1.aleo/remove_keeper.future;

finalize remove_keeper:
    input r0 as address.public;
    input r1 as address.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    set false into keepers[r1];

function set_treasury:
    input r0 as address.private;
    async set_treasury self.caller r0 into r1;
    output r1 as private_matching_orderbook_v1.aleo/set_treasury.future;

finalize set_treasury:
    input r0 as address.public;
    input r1 as address.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    set r1 into treasury[true];

function register_pair:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u64.private;
    assert.neq r0 r1;
    gt r2 0u64 into r3;
    assert.eq r3 true;
    async register_pair r0 r1 r2 into r4;
    output r4 as private_matching_orderbook_v1.aleo/register_pair.future;

finalize register_pair:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u64.public;
    get.or_use pair_count[true] 0u64 into r3;
    add r3 1u64 into r4;
    cast r0 r1 r2 true into r5 as TokenPair;
    set r5 into token_pairs[r4];
    set 0u128 into pair_volume[r4];
    get.or_use pair_count[true] 0u64 into r6;
    set r4 into pair_ids[r6];
    add r6 1u64 into r7;
    set r7 into pair_count[true];

function deactivate_pair:
    input r0 as u64.private;
    async deactivate_pair self.caller r0 into r1;
    output r1 as private_matching_orderbook_v1.aleo/deactivate_pair.future;

finalize deactivate_pair:
    input r0 as address.public;
    input r1 as u64.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    get token_pairs[r1] into r3;
    cast r3.base_token_id r3.quote_token_id r3.tick_size false into r4 as TokenPair;
    set r4 into token_pairs[r1];

function activate_pair:
    input r0 as u64.private;
    async activate_pair self.caller r0 into r1;
    output r1 as private_matching_orderbook_v1.aleo/activate_pair.future;

finalize activate_pair:
    input r0 as address.public;
    input r1 as u64.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    get token_pairs[r1] into r3;
    cast r3.base_token_id r3.quote_token_id r3.tick_size true into r4 as TokenPair;
    set r4 into token_pairs[r1];

function submit_buy_order:
    input r0 as u64.private;
    input r1 as field.private;
    input r2 as field.private;
    input r3 as u64.private;
    input r4 as u128.private;
    input r5 as u128.private;
    input r6 as u32.private;
    input r7 as u32.private;
    input r8 as address.private;
    gt r4 0u128 into r9;
    assert.eq r9 true;
    gt r3 0u64 into r10;
    assert.eq r10 true;
    gt r5 0u128 into r11;
    assert.eq r11 true;
    cast self.caller r6 r3 r4 true r0 into r12 as OrderIdInput;
    hash.bhp256 r12 into r13 as field;
    cast r8 self.caller r13 r0 true r3 r4 r1 r2 r5 0u128 r6 r7 into r14 as Order.record;
    cast self.caller r13 r0 true r3 r4 r2 r5 r6 into r15 as Receipt.record;
    call token_registry.aleo/transfer_public_as_signer r2 private_matching_orderbook_v1.aleo r5 into r16;
    async submit_buy_order r0 r2 r3 r4 r5 r8 r16 into r17;
    output r14 as Order.record;
    output r15 as Receipt.record;
    output r17 as private_matching_orderbook_v1.aleo/submit_buy_order.future;

finalize submit_buy_order:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as token_registry.aleo/transfer_public_as_signer.future;
    get orchestrator[true] into r7;
    assert.eq r5 r7;
    get token_pairs[r0] into r8;
    assert.eq r8.is_active true;
    assert.eq r8.quote_token_id r1;
    cast r2 into r9 as u128;
    mul r3 r9 into r10;
    add r10 9999u128 into r11;
    div r11 10000u128 into r12;
    gte r4 r12 into r13;
    assert.eq r13 true;
    await r6;
    get.or_use order_counter[true] 0u64 into r14;
    add r14 1u64 into r15;
    set r15 into order_counter[true];

function submit_buy_order_usdcx:
    input r0 as u64.private;
    input r1 as field.private;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u32.private;
    input r6 as u32.private;
    input r7 as address.private;
    gt r3 0u128 into r8;
    assert.eq r8 true;
    gt r2 0u64 into r9;
    assert.eq r9 true;
    gt r4 0u128 into r10;
    assert.eq r10 true;
    cast self.caller r5 r2 r3 true r0 into r11 as OrderIdInput;
    hash.bhp256 r11 into r12 as field;
    cast r7 self.caller r12 r0 true r2 r3 r1 7000field r4 0u128 r5 r6 into r13 as Order.record;
    cast self.caller r12 r0 true r2 r3 7000field r4 r5 into r14 as Receipt.record;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer private_matching_orderbook_v1.aleo r4 into r15;
    async submit_buy_order_usdcx r0 7000field r2 r3 r4 r7 r15 into r16;
    output r13 as Order.record;
    output r14 as Receipt.record;
    output r16 as private_matching_orderbook_v1.aleo/submit_buy_order_usdcx.future;

finalize submit_buy_order_usdcx:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    get orchestrator[true] into r7;
    assert.eq r5 r7;
    get token_pairs[r0] into r8;
    assert.eq r8.is_active true;
    assert.eq r8.quote_token_id r1;
    cast r2 into r9 as u128;
    mul r3 r9 into r10;
    add r10 9999u128 into r11;
    div r11 10000u128 into r12;
    gte r4 r12 into r13;
    assert.eq r13 true;
    await r6;
    get.or_use order_counter[true] 0u64 into r14;
    add r14 1u64 into r15;
    set r15 into order_counter[true];

function submit_sell_order:
    input r0 as u64.private;
    input r1 as field.private;
    input r2 as field.private;
    input r3 as u64.private;
    input r4 as u128.private;
    input r5 as u128.private;
    input r6 as u32.private;
    input r7 as u32.private;
    input r8 as address.private;
    gt r4 0u128 into r9;
    assert.eq r9 true;
    gt r3 0u64 into r10;
    assert.eq r10 true;
    gt r5 0u128 into r11;
    assert.eq r11 true;
    cast self.caller r6 r3 r4 false r0 into r12 as OrderIdInput;
    hash.bhp256 r12 into r13 as field;
    cast r8 self.caller r13 r0 false r3 r4 r1 r2 r5 0u128 r6 r7 into r14 as Order.record;
    cast self.caller r13 r0 false r3 r4 r2 r5 r6 into r15 as Receipt.record;
    call token_registry.aleo/transfer_public_as_signer r1 private_matching_orderbook_v1.aleo r5 into r16;
    async submit_sell_order r0 r1 r2 r3 r4 r5 r8 r16 into r17;
    output r14 as Order.record;
    output r15 as Receipt.record;
    output r17 as private_matching_orderbook_v1.aleo/submit_sell_order.future;

finalize submit_sell_order:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u64.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as address.public;
    input r7 as token_registry.aleo/transfer_public_as_signer.future;
    get orchestrator[true] into r8;
    assert.eq r6 r8;
    get token_pairs[r0] into r9;
    assert.eq r9.is_active true;
    assert.eq r9.base_token_id r1;
    assert.eq r9.quote_token_id r2;
    assert.eq r5 r4;
    await r7;
    get.or_use order_counter[true] 0u64 into r10;
    add r10 1u64 into r11;
    set r11 into order_counter[true];

function submit_sell_order_usdcx:
    input r0 as u64.private;
    input r1 as field.private;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u32.private;
    input r6 as u32.private;
    input r7 as address.private;
    gt r3 0u128 into r8;
    assert.eq r8 true;
    gt r2 0u64 into r9;
    assert.eq r9 true;
    gt r4 0u128 into r10;
    assert.eq r10 true;
    cast self.caller r5 r2 r3 false r0 into r11 as OrderIdInput;
    hash.bhp256 r11 into r12 as field;
    cast r7 self.caller r12 r0 false r2 r3 7000field r1 r4 0u128 r5 r6 into r13 as Order.record;
    cast self.caller r12 r0 false r2 r3 r1 r4 r5 into r14 as Receipt.record;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer private_matching_orderbook_v1.aleo r4 into r15;
    async submit_sell_order_usdcx r0 7000field r1 r2 r3 r4 r7 r15 into r16;
    output r13 as Order.record;
    output r14 as Receipt.record;
    output r16 as private_matching_orderbook_v1.aleo/submit_sell_order_usdcx.future;

finalize submit_sell_order_usdcx:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u64.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as address.public;
    input r7 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    get orchestrator[true] into r8;
    assert.eq r6 r8;
    get token_pairs[r0] into r9;
    assert.eq r9.is_active true;
    assert.eq r9.base_token_id r1;
    assert.eq r9.quote_token_id r2;
    assert.eq r5 r4;
    await r7;
    get.or_use order_counter[true] 0u64 into r10;
    add r10 1u64 into r11;
    set r11 into order_counter[true];

function settle_match:
    input r0 as Order.record;
    input r1 as Order.record;
    input r2 as u128.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as address.private;
    assert.eq r0.is_buy true;
    not r1.is_buy into r6;
    assert.eq r6 true;
    assert.eq r0.pair_id r1.pair_id;
    assert.eq r0.quote_token_id r1.quote_token_id;
    gte r3 r1.price into r7;
    assert.eq r7 true;
    lte r3 r0.price into r8;
    assert.eq r8 true;
    gt r2 0u128 into r9;
    assert.eq r9 true;
    sub r0.quantity r0.filled into r10;
    lte r2 r10 into r11;
    assert.eq r11 true;
    sub r1.quantity r1.filled into r12;
    lte r2 r12 into r13;
    assert.eq r13 true;
    cast r3 into r14 as u128;
    mul r2 r14 into r15;
    div r15 10000u128 into r16;
    mul r16 10u128 into r17;
    div r17 10000u128 into r18;
    mul r16 5u128 into r19;
    div r19 10000u128 into r20;
    sub r16 r18 into r21;
    sub r21 r20 into r22;
    lte r16 r0.escrow_amount into r23;
    assert.eq r23 true;
    lte r2 r1.escrow_amount into r24;
    assert.eq r24 true;
    sub r0.escrow_amount r16 into r25;
    add r0.filled r2 into r26;
    cast r0.owner r0.trader r0.order_id r0.pair_id r0.is_buy r0.price r0.quantity r0.base_token_id r0.quote_token_id r25 r26 r0.created_at r0.expires_at into r27 as Order.record;
    sub r1.escrow_amount r2 into r28;
    add r1.filled r2 into r29;
    cast r1.owner r1.trader r1.order_id r1.pair_id r1.is_buy r1.price r1.quantity r1.base_token_id r1.quote_token_id r28 r29 r1.created_at r1.expires_at into r30 as Order.record;
    cast r0.trader r0.order_id r2 r3 r0.base_token_id r2 r4 into r31 as SettlementProof.record;
    cast r1.trader r1.order_id r2 r3 r0.quote_token_id r22 r4 into r32 as SettlementProof.record;
    call token_registry.aleo/transfer_public r1.base_token_id r0.trader r2 into r33;
    call token_registry.aleo/transfer_public r0.quote_token_id r1.trader r22 into r34;
    call token_registry.aleo/transfer_public r0.quote_token_id self.caller r18 into r35;
    call token_registry.aleo/transfer_public r0.quote_token_id r5 r20 into r36;
    async settle_match r0.pair_id r1.base_token_id r0.quote_token_id r0.expires_at r1.expires_at r2 r16 self.caller r5 r33 r34 r35 r36 into r37;
    output r27 as Order.record;
    output r30 as Order.record;
    output r31 as SettlementProof.record;
    output r32 as SettlementProof.record;
    output r37 as private_matching_orderbook_v1.aleo/settle_match.future;

finalize settle_match:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u32.public;
    input r4 as u32.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as address.public;
    input r8 as address.public;
    input r9 as token_registry.aleo/transfer_public.future;
    input r10 as token_registry.aleo/transfer_public.future;
    input r11 as token_registry.aleo/transfer_public.future;
    input r12 as token_registry.aleo/transfer_public.future;
    get.or_use keepers[r7] false into r13;
    assert.eq r13 true;
    get treasury[true] into r14;
    assert.eq r8 r14;
    get token_pairs[r0] into r15;
    assert.eq r15.is_active true;
    assert.eq r15.base_token_id r1;
    assert.eq r15.quote_token_id r2;
    lte block.height r3 into r16;
    assert.eq r16 true;
    lte block.height r4 into r17;
    assert.eq r17 true;
    await r9;
    await r10;
    await r11;
    await r12;
    get.or_use pair_volume[r0] 0u128 into r18;
    add r18 r6 into r19;
    set r19 into pair_volume[r0];

function settle_match_usdcx:
    input r0 as Order.record;
    input r1 as Order.record;
    input r2 as u128.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as address.private;
    assert.eq r0.is_buy true;
    not r1.is_buy into r6;
    assert.eq r6 true;
    assert.eq r0.pair_id r1.pair_id;
    assert.eq r0.quote_token_id 7000field;
    assert.eq r1.quote_token_id 7000field;
    gte r3 r1.price into r7;
    assert.eq r7 true;
    lte r3 r0.price into r8;
    assert.eq r8 true;
    gt r2 0u128 into r9;
    assert.eq r9 true;
    sub r0.quantity r0.filled into r10;
    lte r2 r10 into r11;
    assert.eq r11 true;
    sub r1.quantity r1.filled into r12;
    lte r2 r12 into r13;
    assert.eq r13 true;
    cast r3 into r14 as u128;
    mul r2 r14 into r15;
    div r15 10000u128 into r16;
    mul r16 10u128 into r17;
    div r17 10000u128 into r18;
    mul r16 5u128 into r19;
    div r19 10000u128 into r20;
    sub r16 r18 into r21;
    sub r21 r20 into r22;
    lte r16 r0.escrow_amount into r23;
    assert.eq r23 true;
    lte r2 r1.escrow_amount into r24;
    assert.eq r24 true;
    sub r0.escrow_amount r16 into r25;
    add r0.filled r2 into r26;
    cast r0.owner r0.trader r0.order_id r0.pair_id r0.is_buy r0.price r0.quantity r0.base_token_id r0.quote_token_id r25 r26 r0.created_at r0.expires_at into r27 as Order.record;
    sub r1.escrow_amount r2 into r28;
    add r1.filled r2 into r29;
    cast r1.owner r1.trader r1.order_id r1.pair_id r1.is_buy r1.price r1.quantity r1.base_token_id r1.quote_token_id r28 r29 r1.created_at r1.expires_at into r30 as Order.record;
    cast r0.trader r0.order_id r2 r3 r0.base_token_id r2 r4 into r31 as SettlementProof.record;
    cast r1.trader r1.order_id r2 r3 7000field r22 r4 into r32 as SettlementProof.record;
    call token_registry.aleo/transfer_public r1.base_token_id r0.trader r2 into r33;
    call test_usdcx_stablecoin.aleo/transfer_public r1.trader r22 into r34;
    call test_usdcx_stablecoin.aleo/transfer_public self.caller r18 into r35;
    call test_usdcx_stablecoin.aleo/transfer_public r5 r20 into r36;
    async settle_match_usdcx r0.pair_id r1.base_token_id 7000field r0.expires_at r1.expires_at r2 r16 self.caller r5 r33 r34 r35 r36 into r37;
    output r27 as Order.record;
    output r30 as Order.record;
    output r31 as SettlementProof.record;
    output r32 as SettlementProof.record;
    output r37 as private_matching_orderbook_v1.aleo/settle_match_usdcx.future;

finalize settle_match_usdcx:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u32.public;
    input r4 as u32.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as address.public;
    input r8 as address.public;
    input r9 as token_registry.aleo/transfer_public.future;
    input r10 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r11 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r12 as test_usdcx_stablecoin.aleo/transfer_public.future;
    get.or_use keepers[r7] false into r13;
    assert.eq r13 true;
    get treasury[true] into r14;
    assert.eq r8 r14;
    get token_pairs[r0] into r15;
    assert.eq r15.is_active true;
    assert.eq r15.base_token_id r1;
    assert.eq r15.quote_token_id r2;
    lte block.height r3 into r16;
    assert.eq r16 true;
    lte block.height r4 into r17;
    assert.eq r17 true;
    await r9;
    await r10;
    await r11;
    await r12;
    get.or_use pair_volume[r0] 0u128 into r18;
    add r18 r6 into r19;
    set r19 into pair_volume[r0];

function settle_match_usdcx_base:
    input r0 as Order.record;
    input r1 as Order.record;
    input r2 as u128.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as address.private;
    assert.eq r0.is_buy true;
    not r1.is_buy into r6;
    assert.eq r6 true;
    assert.eq r0.pair_id r1.pair_id;
    assert.eq r0.quote_token_id r1.quote_token_id;
    gte r3 r1.price into r7;
    assert.eq r7 true;
    lte r3 r0.price into r8;
    assert.eq r8 true;
    gt r2 0u128 into r9;
    assert.eq r9 true;
    sub r0.quantity r0.filled into r10;
    lte r2 r10 into r11;
    assert.eq r11 true;
    sub r1.quantity r1.filled into r12;
    lte r2 r12 into r13;
    assert.eq r13 true;
    cast r3 into r14 as u128;
    mul r2 r14 into r15;
    div r15 10000u128 into r16;
    mul r16 10u128 into r17;
    div r17 10000u128 into r18;
    mul r16 5u128 into r19;
    div r19 10000u128 into r20;
    sub r16 r18 into r21;
    sub r21 r20 into r22;
    lte r16 r0.escrow_amount into r23;
    assert.eq r23 true;
    lte r2 r1.escrow_amount into r24;
    assert.eq r24 true;
    sub r0.escrow_amount r16 into r25;
    add r0.filled r2 into r26;
    cast r0.owner r0.trader r0.order_id r0.pair_id r0.is_buy r0.price r0.quantity r0.base_token_id r0.quote_token_id r25 r26 r0.created_at r0.expires_at into r27 as Order.record;
    sub r1.escrow_amount r2 into r28;
    add r1.filled r2 into r29;
    cast r1.owner r1.trader r1.order_id r1.pair_id r1.is_buy r1.price r1.quantity r1.base_token_id r1.quote_token_id r28 r29 r1.created_at r1.expires_at into r30 as Order.record;
    cast r0.trader r0.order_id r2 r3 r0.base_token_id r2 r4 into r31 as SettlementProof.record;
    cast r1.trader r1.order_id r2 r3 r0.quote_token_id r22 r4 into r32 as SettlementProof.record;
    call test_usdcx_stablecoin.aleo/transfer_public r0.trader r2 into r33;
    call token_registry.aleo/transfer_public r0.quote_token_id r1.trader r22 into r34;
    call token_registry.aleo/transfer_public r0.quote_token_id self.caller r18 into r35;
    call token_registry.aleo/transfer_public r0.quote_token_id r5 r20 into r36;
    async settle_match_usdcx_base r0.pair_id 7000field r0.quote_token_id r0.expires_at r1.expires_at r2 r16 self.caller r5 r33 r34 r35 r36 into r37;
    output r27 as Order.record;
    output r30 as Order.record;
    output r31 as SettlementProof.record;
    output r32 as SettlementProof.record;
    output r37 as private_matching_orderbook_v1.aleo/settle_match_usdcx_base.future;

finalize settle_match_usdcx_base:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u32.public;
    input r4 as u32.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as address.public;
    input r8 as address.public;
    input r9 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r10 as token_registry.aleo/transfer_public.future;
    input r11 as token_registry.aleo/transfer_public.future;
    input r12 as token_registry.aleo/transfer_public.future;
    get.or_use keepers[r7] false into r13;
    assert.eq r13 true;
    get treasury[true] into r14;
    assert.eq r8 r14;
    get token_pairs[r0] into r15;
    assert.eq r15.is_active true;
    assert.eq r15.base_token_id r1;
    assert.eq r15.quote_token_id r2;
    lte block.height r3 into r16;
    assert.eq r16 true;
    lte block.height r4 into r17;
    assert.eq r17 true;
    await r9;
    await r10;
    await r11;
    await r12;
    get.or_use pair_volume[r0] 0u128 into r18;
    add r18 r6 into r19;
    set r19 into pair_volume[r0];

function settle_cross_pair:
    input r0 as Order.record;
    input r1 as Order.record;
    input r2 as Order.record;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u64.private;
    input r7 as field.private;
    input r8 as u32.private;
    input r9 as address.private;
    not r0.is_buy into r10;
    assert.eq r10 true;
    assert.eq r1.is_buy true;
    not r2.is_buy into r11;
    assert.eq r11 true;
    assert.eq r0.pair_id r1.pair_id;
    assert.eq r0.quote_token_id r1.quote_token_id;
    assert.eq r0.quote_token_id 7000field;
    assert.eq r2.quote_token_id 7000field;
    gte r4 r0.price into r12;
    assert.eq r12 true;
    lte r4 r1.price into r13;
    assert.eq r13 true;
    gte r6 r2.price into r14;
    assert.eq r14 true;
    gt r3 0u128 into r15;
    assert.eq r15 true;
    sub r0.quantity r0.filled into r16;
    lte r3 r16 into r17;
    assert.eq r17 true;
    sub r1.quantity r1.filled into r18;
    lte r3 r18 into r19;
    assert.eq r19 true;
    gt r5 0u128 into r20;
    assert.eq r20 true;
    sub r2.quantity r2.filled into r21;
    lte r5 r21 into r22;
    assert.eq r22 true;
    cast r4 into r23 as u128;
    mul r3 r23 into r24;
    div r24 10000u128 into r25;
    cast r6 into r26 as u128;
    mul r5 r26 into r27;
    div r27 10000u128 into r28;
    mul r25 10u128 into r29;
    div r29 10000u128 into r30;
    mul r25 5u128 into r31;
    div r31 10000u128 into r32;
    sub r25 r30 into r33;
    sub r33 r32 into r34;
    assert.eq r34 r28;
    lte r3 r0.escrow_amount into r35;
    assert.eq r35 true;
    lte r25 r1.escrow_amount into r36;
    assert.eq r36 true;
    lte r5 r2.escrow_amount into r37;
    assert.eq r37 true;
    sub r0.escrow_amount r3 into r38;
    add r0.filled r3 into r39;
    cast r0.owner r0.trader r0.order_id r0.pair_id r0.is_buy r0.price r0.quantity r0.base_token_id r0.quote_token_id r38 r39 r0.created_at r0.expires_at into r40 as Order.record;
    sub r1.escrow_amount r25 into r41;
    add r1.filled r3 into r42;
    cast r1.owner r1.trader r1.order_id r1.pair_id r1.is_buy r1.price r1.quantity r1.base_token_id r1.quote_token_id r41 r42 r1.created_at r1.expires_at into r43 as Order.record;
    sub r2.escrow_amount r5 into r44;
    add r2.filled r5 into r45;
    cast r2.owner r2.trader r2.order_id r2.pair_id r2.is_buy r2.price r2.quantity r2.base_token_id r2.quote_token_id r44 r45 r2.created_at r2.expires_at into r46 as Order.record;
    cast r0.trader r0.order_id r3 r4 r7 r5 r8 into r47 as SettlementProof.record;
    cast r1.trader r1.order_id r3 r4 0field r3 r8 into r48 as SettlementProof.record;
    cast r2.trader r2.order_id r5 r6 7000field r34 r8 into r49 as SettlementProof.record;
    call token_registry.aleo/transfer_public r0.base_token_id r1.trader r3 into r50;
    call token_registry.aleo/transfer_public r7 r0.trader r5 into r51;
    call test_usdcx_stablecoin.aleo/transfer_public r2.trader r34 into r52;
    call test_usdcx_stablecoin.aleo/transfer_public self.caller r30 into r53;
    call test_usdcx_stablecoin.aleo/transfer_public r9 r32 into r54;
    async settle_cross_pair r0.pair_id r2.pair_id r7 r0.expires_at r1.expires_at r2.expires_at r25 self.caller r9 r50 r51 r52 r53 r54 into r55;
    output r40 as Order.record;
    output r43 as Order.record;
    output r46 as Order.record;
    output r47 as SettlementProof.record;
    output r48 as SettlementProof.record;
    output r49 as SettlementProof.record;
    output r55 as private_matching_orderbook_v1.aleo/settle_cross_pair.future;

finalize settle_cross_pair:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as u32.public;
    input r4 as u32.public;
    input r5 as u32.public;
    input r6 as u128.public;
    input r7 as address.public;
    input r8 as address.public;
    input r9 as token_registry.aleo/transfer_public.future;
    input r10 as token_registry.aleo/transfer_public.future;
    input r11 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r12 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r13 as test_usdcx_stablecoin.aleo/transfer_public.future;
    get.or_use keepers[r7] false into r14;
    assert.eq r14 true;
    get treasury[true] into r15;
    assert.eq r8 r15;
    get token_pairs[r0] into r16;
    assert.eq r16.is_active true;
    assert.eq r16.quote_token_id 7000field;
    get token_pairs[r1] into r17;
    assert.eq r17.is_active true;
    assert.eq r17.quote_token_id 7000field;
    assert.eq r17.base_token_id r2;
    lte block.height r3 into r18;
    assert.eq r18 true;
    lte block.height r4 into r19;
    assert.eq r19 true;
    lte block.height r5 into r20;
    assert.eq r20 true;
    await r9;
    await r10;
    await r11;
    await r12;
    await r13;
    get.or_use pair_volume[r0] 0u128 into r21;
    add r21 r6 into r22;
    set r22 into pair_volume[r0];
    get.or_use pair_volume[r1] 0u128 into r23;
    add r23 r6 into r24;
    set r24 into pair_volume[r1];

constructor:
    set program_owner into orchestrator[true];
    set true into keepers[program_owner];
    set program_owner into treasury[true];
    set 0u64 into order_counter[true];
    set 0u64 into pair_count[true];
