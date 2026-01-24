import credits.aleo;
import token_registry.aleo;
program private_orderbook_v1.aleo;

record Token:
    owner as address.private;
    amount as u64.private;
    token_id as field.private;
    external_authorization_required as boolean.private;
    authorized_until as u32.private;

record TickOrder:
    owner as address.private;
    token_pair as u64.private;
    tick_lower as u64.private;
    tick_upper as u64.private;
    is_buy as boolean.private;
    quantity as u64.private;
    limit_price as u64.private;
    token_id as field.private;
    escrowed_amount as u64.private;
    filled as u64.private;
    timestamp as u32.private;

record Settlement:
    owner as address.private;
    token_pair as u64.private;
    quantity as u64.private;
    price as u64.private;
    is_buy as boolean.private;
    timestamp as u32.private;

struct TokenPair:
    pair_id as u64;
    base_token_id as field;
    quote_token_id as field;
    tick_size as u64;
    active as boolean;

struct TickInfo:
    token_pair as u64;
    tick_id as u64;
    order_count as u32;
    total_volume_settled as u64;
    last_updated as u32;

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

mapping token_pairs:
    key as u64.public;
    value as TokenPair.public;

mapping tick_registry:
    key as field.public;
    value as TickInfo.public;

mapping order_fills:
    key as field.public;
    value as u64.public;

mapping tick_volumes:
    key as field.public;
    value as u64.public;

function register_token_pair:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u64.public;
    gt r0 0u64 into r4;
    assert.eq r4 true;
    is.neq r1 r2 into r5;
    assert.eq r5 true;
    gt r3 0u64 into r6;
    assert.eq r6 true;
    async register_token_pair r0 r1 r2 r3 into r7;
    output r7 as private_orderbook_v1.aleo/register_token_pair.future;

finalize register_token_pair:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u64.public;
    cast r0 r1 r2 r3 true into r4 as TokenPair;
    set r4 into token_pairs[r0];

function deactivate_token_pair:
    input r0 as u64.public;
    async deactivate_token_pair r0 into r1;
    output r1 as private_orderbook_v1.aleo/deactivate_token_pair.future;

finalize deactivate_token_pair:
    input r0 as u64.public;
    get token_pairs[r0] into r1;
    cast r1.pair_id r1.base_token_id r1.quote_token_id r1.tick_size false into r2 as TokenPair;
    set r2 into token_pairs[r0];

function reactivate_token_pair:
    input r0 as u64.public;
    async reactivate_token_pair r0 into r1;
    output r1 as private_orderbook_v1.aleo/reactivate_token_pair.future;

finalize reactivate_token_pair:
    input r0 as u64.public;
    get token_pairs[r0] into r1;
    cast r1.pair_id r1.base_token_id r1.quote_token_id r1.tick_size true into r2 as TokenPair;
    set r2 into token_pairs[r0];

function submit_tick_order_with_escrow:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u32.public;
    input r5 as u64.private;
    input r6 as u64.private;
    input r7 as Token.record;
    sub r3 r2 into r8;
    lte r8 50u64 into r9;
    assert.eq r9 true;
    mul r2 100u64 into r10;
    add r3 1u64 into r11;
    mul r11 100u64 into r12;
    gte r5 r10 into r13;
    assert.eq r13 true;
    lte r5 r12 into r14;
    assert.eq r14 true;
    gt r6 0u64 into r15;
    assert.eq r15 true;
    mul r6 r5 into r16;
    div r16 10000u64 into r17;
    ternary r1 r17 r6 into r18;
    gte r7.amount r18 into r19;
    assert.eq r19 true;
    is.eq r7.owner self.caller into r20;
    assert.eq r20 true;
    cast self.caller r0 r2 r3 r1 r6 r5 r7.token_id r18 0u64 r4 into r21 as TickOrder.record;
    sub r7.amount r18 into r22;
    cast self.caller r22 r7.token_id r7.external_authorization_required r7.authorized_until into r23 as Token.record;
    async submit_tick_order_with_escrow r0 r7.token_id r1 into r24;
    output r21 as TickOrder.record;
    output r23 as Token.record;
    output r24 as private_orderbook_v1.aleo/submit_tick_order_with_escrow.future;

finalize submit_tick_order_with_escrow:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as boolean.public;
    get token_pairs[r0] into r3;
    assert.eq r3.active true;
    branch.eq r2 false to end_then_0_0;
    is.eq r1 r3.quote_token_id into r4;
    assert.eq r4 true;
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    is.eq r1 r3.base_token_id into r5;
    assert.eq r5 true;
    position end_otherwise_0_1;

function submit_tick_order:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u32.public;
    input r5 as u64.private;
    input r6 as u64.private;
    sub r3 r2 into r7;
    lte r7 50u64 into r8;
    assert.eq r8 true;
    mul r2 100u64 into r9;
    add r3 1u64 into r10;
    mul r10 100u64 into r11;
    gte r5 r9 into r12;
    assert.eq r12 true;
    lte r5 r11 into r13;
    assert.eq r13 true;
    gt r6 0u64 into r14;
    assert.eq r14 true;
    cast self.caller r0 r2 r3 r1 r6 r5 0field 0u64 0u64 r4 into r15 as TickOrder.record;
    async submit_tick_order r0 r2 r3 into r16;
    output r15 as TickOrder.record;
    output r16 as private_orderbook_v1.aleo/submit_tick_order.future;

finalize submit_tick_order:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u64.public;
    get token_pairs[r0] into r3;
    assert.eq r3.active true;
    add r1 r2 into r4;
    div r4 2u64 into r5;
    mul r5 1000000u64 into r6;
    add r0 r6 into r7;
    hash.bhp256 r7 into r8 as field;
    cast r0 r5 0u32 0u64 0u32 into r9 as TickInfo;
    get.or_use tick_registry[r8] r9 into r10;
    add r10.order_count 1u32 into r11;
    cast r10.token_pair r10.tick_id r11 r10.total_volume_settled r10.last_updated into r12 as TickInfo;
    set r12 into tick_registry[r8];

function update_order:
    input r0 as TickOrder.record;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as u64.private;
    input r4 as u64.private;
    is.eq r0.owner self.caller into r5;
    assert.eq r5 true;
    lt r0.filled r0.quantity into r6;
    assert.eq r6 true;
    sub r2 r1 into r7;
    lte r7 50u64 into r8;
    assert.eq r8 true;
    mul r1 100u64 into r9;
    add r2 1u64 into r10;
    mul r10 100u64 into r11;
    gte r3 r9 into r12;
    assert.eq r12 true;
    lte r3 r11 into r13;
    assert.eq r13 true;
    gte r4 r0.filled into r14;
    assert.eq r14 true;
    gt r4 0u64 into r15;
    assert.eq r15 true;
    cast r0.owner r0.token_pair r1 r2 r0.is_buy r4 r3 r0.token_id r0.escrowed_amount r0.filled r0.timestamp into r16 as TickOrder.record;
    output r16 as TickOrder.record;

function settle_match:
    input r0 as TickOrder.record;
    input r1 as TickOrder.record;
    input r2 as u32.public;
    is.eq r0.token_pair r1.token_pair into r3;
    assert.eq r3 true;
    is.eq r0.is_buy true into r4;
    assert.eq r4 true;
    is.eq r1.is_buy false into r5;
    assert.eq r5 true;
    gt r0.tick_lower r1.tick_lower into r6;
    ternary r6 r0.tick_lower r1.tick_lower into r7;
    lt r0.tick_upper r1.tick_upper into r8;
    ternary r8 r0.tick_upper r1.tick_upper into r9;
    lte r7 r9 into r10;
    assert.eq r10 true;
    gte r0.limit_price r1.limit_price into r11;
    assert.eq r11 true;
    mul r0.tick_lower 100u64 into r12;
    gte r0.limit_price r12 into r13;
    assert.eq r13 true;
    add r0.tick_upper 1u64 into r14;
    mul r14 100u64 into r15;
    lte r0.limit_price r15 into r16;
    assert.eq r16 true;
    mul r1.tick_lower 100u64 into r17;
    gte r1.limit_price r17 into r18;
    assert.eq r18 true;
    add r1.tick_upper 1u64 into r19;
    mul r19 100u64 into r20;
    lte r1.limit_price r20 into r21;
    assert.eq r21 true;
    lt r0.filled r0.quantity into r22;
    assert.eq r22 true;
    lt r1.filled r1.quantity into r23;
    assert.eq r23 true;
    sub r0.quantity r0.filled into r24;
    sub r1.quantity r1.filled into r25;
    lt r24 r25 into r26;
    ternary r26 r24 r25 into r27;
    add r0.limit_price r1.limit_price into r28;
    div r28 2u64 into r29;
    add r0.filled r27 into r30;
    cast r0.owner r0.token_pair r0.tick_lower r0.tick_upper r0.is_buy r0.quantity r0.limit_price r0.token_id r0.escrowed_amount r30 r0.timestamp into r31 as TickOrder.record;
    add r1.filled r27 into r32;
    cast r1.owner r1.token_pair r1.tick_lower r1.tick_upper r1.is_buy r1.quantity r1.limit_price r1.token_id r1.escrowed_amount r32 r1.timestamp into r33 as TickOrder.record;
    cast r0.owner r0.token_pair r27 r29 true r2 into r34 as Settlement.record;
    cast r1.owner r1.token_pair r27 r29 false r2 into r35 as Settlement.record;
    output r31 as TickOrder.record;
    output r33 as TickOrder.record;
    output r34 as Settlement.record;
    output r35 as Settlement.record;

function settle_match_with_transfer:
    input r0 as TickOrder.record;
    input r1 as TickOrder.record;
    input r2 as Token.record;
    input r3 as Token.record;
    input r4 as u32.public;
    is.eq r0.token_pair r1.token_pair into r5;
    assert.eq r5 true;
    is.eq r0.is_buy true into r6;
    assert.eq r6 true;
    is.eq r1.is_buy false into r7;
    assert.eq r7 true;
    gt r0.tick_lower r1.tick_lower into r8;
    ternary r8 r0.tick_lower r1.tick_lower into r9;
    lt r0.tick_upper r1.tick_upper into r10;
    ternary r10 r0.tick_upper r1.tick_upper into r11;
    lte r9 r11 into r12;
    assert.eq r12 true;
    gte r0.limit_price r1.limit_price into r13;
    assert.eq r13 true;
    lt r0.filled r0.quantity into r14;
    assert.eq r14 true;
    lt r1.filled r1.quantity into r15;
    assert.eq r15 true;
    sub r0.quantity r0.filled into r16;
    sub r1.quantity r1.filled into r17;
    lt r16 r17 into r18;
    ternary r18 r16 r17 into r19;
    add r0.limit_price r1.limit_price into r20;
    div r20 2u64 into r21;
    mul r19 r21 into r22;
    div r22 10000u64 into r23;
    is.eq r2.owner r1.owner into r24;
    assert.eq r24 true;
    is.eq r3.owner r0.owner into r25;
    assert.eq r25 true;
    gte r2.amount r19 into r26;
    assert.eq r26 true;
    gte r3.amount r23 into r27;
    assert.eq r27 true;
    cast r0.owner r19 r2.token_id r2.external_authorization_required r2.authorized_until into r28 as Token.record;
    cast r1.owner r23 r3.token_id r3.external_authorization_required r3.authorized_until into r29 as Token.record;
    add r0.filled r19 into r30;
    cast r0.owner r0.token_pair r0.tick_lower r0.tick_upper r0.is_buy r0.quantity r0.limit_price r0.token_id r0.escrowed_amount r30 r0.timestamp into r31 as TickOrder.record;
    add r1.filled r19 into r32;
    cast r1.owner r1.token_pair r1.tick_lower r1.tick_upper r1.is_buy r1.quantity r1.limit_price r1.token_id r1.escrowed_amount r32 r1.timestamp into r33 as TickOrder.record;
    cast r0.owner r0.token_pair r19 r21 true r4 into r34 as Settlement.record;
    cast r1.owner r1.token_pair r19 r21 false r4 into r35 as Settlement.record;
    output r31 as TickOrder.record;
    output r33 as TickOrder.record;
    output r28 as Token.record;
    output r29 as Token.record;
    output r34 as Settlement.record;
    output r35 as Settlement.record;

function cancel_order:
    input r0 as TickOrder.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    lt r0.filled r0.quantity into r2;
    assert.eq r2 true;
    output true as boolean.private;

function cancel_order_with_refund:
    input r0 as TickOrder.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    lt r0.filled r0.quantity into r2;
    assert.eq r2 true;
    mul r0.filled r0.limit_price into r3;
    div r3 10000u64 into r4;
    ternary r0.is_buy r4 r0.filled into r5;
    sub r0.escrowed_amount r5 into r6;
    cast r0.owner r6 r0.token_id false 0u32 into r7 as Token.record;
    output true as boolean.private;
    output r7 as Token.record;

function get_order_info:
    input r0 as TickOrder.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    output r0.token_pair as u64.private;
    output r0.tick_lower as u64.private;
    output r0.tick_upper as u64.private;
    output r0.quantity as u64.private;
    output r0.is_buy as boolean.private;
    output r0.filled as u64.private;

constructor:
    assert.eq edition 0u16;
