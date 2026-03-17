import credits.aleo;
import token_registry.aleo;
program private_orderbook_v18.aleo;

record Order:
    owner as address.private;
    trader as address.private;
    order_id as field.private;
    pair_id as u64.private;
    is_buy as boolean.private;
    price as u64.private;
    quantity as u128.private;
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

record CancellationRequest:
    owner as address.private;
    order_id as field.private;
    trader as address.private;
    is_buy as boolean.private;
    created_at as u32.private;

record CancellationProof:
    owner as address.private;
    order_id as field.private;
    is_buy as boolean.private;
    returned_amount as u128.private;
    cancelled_at as u32.private;

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

struct SplitOrderIdInput:
    original_order_id as field;
    remaining_quantity as u128;

struct TokenMetadata:
    token_id as field;
    name as u128;
    symbol as u128;
    decimals as u8;
    supply as u128;
    max_supply as u128;
    admin as address;
    external_authorization_required as boolean;
    external_authorization_party as address;

struct TokenOwner:
    account as address;
    token_id as field;

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
    output r1 as private_orderbook_v18.aleo/add_keeper.future;

finalize add_keeper:
    input r0 as address.public;
    input r1 as address.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    set true into keepers[r1];

function remove_keeper:
    input r0 as address.private;
    async remove_keeper self.caller r0 into r1;
    output r1 as private_orderbook_v18.aleo/remove_keeper.future;

finalize remove_keeper:
    input r0 as address.public;
    input r1 as address.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    set false into keepers[r1];

function set_treasury:
    input r0 as address.private;
    async set_treasury self.caller r0 into r1;
    output r1 as private_orderbook_v18.aleo/set_treasury.future;

finalize set_treasury:
    input r0 as address.public;
    input r1 as address.public;
    get orchestrator[true] into r2;
    assert.eq r0 r2;
    set r1 into treasury[true];

function register_pair:
    input r0 as u64.private;
    input r1 as field.private;
    input r2 as field.private;
    input r3 as u64.private;
    async register_pair self.caller r0 r1 r2 r3 into r4;
    output r4 as private_orderbook_v18.aleo/register_pair.future;

finalize register_pair:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u64.public;
    get orchestrator[true] into r5;
    assert.eq r0 r5;
    cast r2 r3 r4 true into r6 as TokenPair;
    set r6 into token_pairs[r1];
    set 0u128 into pair_volume[r1];
    get.or_use pair_count[true] 0u64 into r7;
    set r1 into pair_ids[r7];
    add r7 1u64 into r8;
    set r8 into pair_count[true];

function deactivate_pair:
    input r0 as u64.private;
    async deactivate_pair self.caller r0 into r1;
    output r1 as private_orderbook_v18.aleo/deactivate_pair.future;

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
    output r1 as private_orderbook_v18.aleo/activate_pair.future;

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
    cast r7 self.caller r12 r0 true r2 r3 r1 r4 0u128 r5 r6 into r13 as Order.record;
    cast self.caller r12 r0 true r2 r3 r1 r4 r5 into r14 as Receipt.record;
    call token_registry.aleo/transfer_public_as_signer r1 private_orderbook_v18.aleo r4 into r15;
    async submit_buy_order r0 r1 r2 r3 r4 r7 r15 into r16;
    output r13 as Order.record;
    output r14 as Receipt.record;
    output r16 as private_orderbook_v18.aleo/submit_buy_order.future;

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

function submit_sell_order:
    input r0 as u64.private;
    input r1 as field.private;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u32.private;
    input r6 as u32.private;
    input r7 as address.private;
    gt r3 0u128 into r8;
    assert.eq r8 true;
    gt r2 0u64 into r9;
    assert.eq r9 true;
    gt r4 0u64 into r10;
    assert.eq r10 true;
    cast self.caller r5 r2 r3 false r0 into r11 as OrderIdInput;
    hash.bhp256 r11 into r12 as field;
    cast r4 into r13 as u128;
    cast r7 self.caller r12 r0 false r2 r3 r1 r13 0u128 r5 r6 into r14 as Order.record;
    cast r4 into r15 as u128;
    cast self.caller r12 r0 false r2 r3 r1 r15 r5 into r16 as Receipt.record;
    call credits.aleo/transfer_public_as_signer private_orderbook_v18.aleo r4 into r17;
    cast r4 into r18 as u128;
    async submit_sell_order r0 r1 r2 r3 r18 r7 r17 into r19;
    output r14 as Order.record;
    output r16 as Receipt.record;
    output r19 as private_orderbook_v18.aleo/submit_sell_order.future;

finalize submit_sell_order:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as credits.aleo/transfer_public_as_signer.future;
    get orchestrator[true] into r7;
    assert.eq r5 r7;
    get token_pairs[r0] into r8;
    assert.eq r8.is_active true;
    assert.eq r8.quote_token_id r1;
    assert.eq r4 r3;
    await r6;
    get.or_use order_counter[true] 0u64 into r9;
    add r9 1u64 into r10;
    set r10 into order_counter[true];

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
    cast r0.owner r0.trader r0.order_id r0.pair_id r0.is_buy r0.price r0.quantity r0.quote_token_id r25 r26 r0.created_at r0.expires_at into r27 as Order.record;
    sub r1.escrow_amount r2 into r28;
    add r1.filled r2 into r29;
    cast r1.owner r1.trader r1.order_id r1.pair_id r1.is_buy r1.price r1.quantity r1.quote_token_id r28 r29 r1.created_at r1.expires_at into r30 as Order.record;
    cast r0.trader r0.order_id r2 r3 0field r2 r4 into r31 as SettlementProof.record;
    cast r1.trader r1.order_id r2 r3 r0.quote_token_id r22 r4 into r32 as SettlementProof.record;
    cast r2 into r33 as u64;
    call credits.aleo/transfer_public r0.trader r33 into r34;
    call token_registry.aleo/transfer_public r0.quote_token_id r1.trader r22 into r35;
    call token_registry.aleo/transfer_public r0.quote_token_id self.caller r18 into r36;
    call token_registry.aleo/transfer_public r0.quote_token_id r5 r20 into r37;
    async settle_match r0.pair_id r0.expires_at r1.expires_at r2 r16 self.caller r5 r34 r35 r36 r37 into r38;
    output r27 as Order.record;
    output r30 as Order.record;
    output r31 as SettlementProof.record;
    output r32 as SettlementProof.record;
    output r38 as private_orderbook_v18.aleo/settle_match.future;

finalize settle_match:
    input r0 as u64.public;
    input r1 as u32.public;
    input r2 as u32.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as address.public;
    input r7 as credits.aleo/transfer_public.future;
    input r8 as token_registry.aleo/transfer_public.future;
    input r9 as token_registry.aleo/transfer_public.future;
    input r10 as token_registry.aleo/transfer_public.future;
    get.or_use keepers[r5] false into r11;
    assert.eq r11 true;
    get treasury[true] into r12;
    assert.eq r6 r12;
    get token_pairs[r0] into r13;
    assert.eq r13.is_active true;
    lte block.height r1 into r14;
    assert.eq r14 true;
    lte block.height r2 into r15;
    assert.eq r15 true;
    await r7;
    await r8;
    await r9;
    await r10;
    get.or_use pair_volume[r0] 0u128 into r16;
    add r16 r4 into r17;
    set r17 into pair_volume[r0];

function request_cancel:
    input r0 as Receipt.record;
    input r1 as address.private;
    input r2 as u32.private;
    cast r1 r0.order_id self.caller r0.is_buy r2 into r3 as CancellationRequest.record;
    async request_cancel r1 into r4;
    output r3 as CancellationRequest.record;
    output r4 as private_orderbook_v18.aleo/request_cancel.future;

finalize request_cancel:
    input r0 as address.public;
    get orchestrator[true] into r1;
    assert.eq r0 r1;

function cancel_buy_order:
    input r0 as Order.record;
    input r1 as CancellationRequest.record;
    input r2 as u32.private;
    assert.eq r0.is_buy true;
    assert.eq r0.order_id r1.order_id;
    assert.eq r1.trader r0.trader;
    gt r0.escrow_amount 0u128 into r3;
    assert.eq r3 true;
    cast r1.trader r0.order_id true r0.escrow_amount r2 into r4 as CancellationProof.record;
    call token_registry.aleo/transfer_public r0.quote_token_id r1.trader r0.escrow_amount into r5;
    async cancel_buy_order self.caller r5 into r6;
    output r4 as CancellationProof.record;
    output r6 as private_orderbook_v18.aleo/cancel_buy_order.future;

finalize cancel_buy_order:
    input r0 as address.public;
    input r1 as token_registry.aleo/transfer_public.future;
    get.or_use keepers[r0] false into r2;
    assert.eq r2 true;
    await r1;

function cancel_sell_order:
    input r0 as Order.record;
    input r1 as CancellationRequest.record;
    input r2 as u32.private;
    not r0.is_buy into r3;
    assert.eq r3 true;
    assert.eq r0.order_id r1.order_id;
    assert.eq r1.trader r0.trader;
    gt r0.escrow_amount 0u128 into r4;
    assert.eq r4 true;
    cast r1.trader r0.order_id false r0.escrow_amount r2 into r5 as CancellationProof.record;
    cast r0.escrow_amount into r6 as u64;
    call credits.aleo/transfer_public r1.trader r6 into r7;
    async cancel_sell_order self.caller r7 into r8;
    output r5 as CancellationProof.record;
    output r8 as private_orderbook_v18.aleo/cancel_sell_order.future;

finalize cancel_sell_order:
    input r0 as address.public;
    input r1 as credits.aleo/transfer_public.future;
    get.or_use keepers[r0] false into r2;
    assert.eq r2 true;
    await r1;

function split_order:
    input r0 as Order.record;
    input r1 as u128.private;
    assert.eq r0.owner self.caller;
    lt r1 r0.quantity into r2;
    assert.eq r2 true;
    gt r1 0u128 into r3;
    assert.eq r3 true;
    sub r0.quantity r1 into r4;
    mul r0.escrow_amount r1 into r5;
    div r5 r0.quantity into r6;
    sub r0.escrow_amount r6 into r7;
    cast self.caller r0.trader r0.order_id r0.pair_id r0.is_buy r0.price r1 r0.quote_token_id r6 0u128 r0.created_at r0.expires_at into r8 as Order.record;
    cast r0.order_id r4 into r9 as SplitOrderIdInput;
    hash.bhp256 r9 into r10 as field;
    cast self.caller r0.trader r10 r0.pair_id r0.is_buy r0.price r4 r0.quote_token_id r7 0u128 r0.created_at r0.expires_at into r11 as Order.record;
    output r8 as Order.record;
    output r11 as Order.record;

constructor:
    set program_owner into orchestrator[true];
    set true into keepers[program_owner];
    set program_owner into treasury[true];
    set 0u64 into order_counter[true];
    set 0u64 into pair_count[true];

