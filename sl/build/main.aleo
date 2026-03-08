import credits.aleo;
import token_registry.aleo;
import test_usdc_token.aleo;
program private_orderbook_0000v8testnet.aleo;

record OrderReceipt:
    owner as address.private;
    order_id as field.private;
    token_pair as u64.private;
    is_buy as boolean.private;
    quantity as u128.private;
    limit_price as u64.private;
    timestamp as u32.private;

record Settlement:
    owner as address.private;
    token_pair as u64.private;
    quantity as u128.private;
    price as u64.private;
    is_buy as boolean.private;
    timestamp as u32.private;

struct TokenPair:
    pair_id as u64;
    base_token_id as field;
    quote_token_id as field;
    tick_size as u64;
    active as boolean;
    settler_fee_bps as u64;
    protocol_fee_bps as u64;
    treasury as address;

struct Order:
    trader as address;
    token_pair as u64;
    tick_lower as u64;
    tick_upper as u64;
    is_buy as boolean;
    quantity as u128;
    limit_price as u64;
    token_id as field;
    escrowed_amount as u128;
    filled as u128;
    timestamp as u32;
    expires_at as u32;
    status as u8;
    order_type as u8;

struct StopLossOrder:
    trader as address;
    token_pair as u64;
    is_buy as boolean;
    quantity as u128;
    stop_price_hash as field;
    limit_price as u64;
    token_id as field;
    escrowed_amount as u128;
    triggered as boolean;
    timestamp as u32;
    expires_at as u32;

struct IcebergOrder:
    trader as address;
    token_pair as u64;
    tick_lower as u64;
    tick_upper as u64;
    is_buy as boolean;
    total_quantity as u128;
    visible_quantity as u128;
    refill_quantity as u128;
    limit_price as u64;
    token_id as field;
    escrowed_amount as u128;
    filled as u128;
    timestamp as u32;
    expires_at as u32;
    status as u8;

struct TickInfo:
    token_pair as u64;
    tick_id as u64;
    order_count as u32;
    total_volume_settled as u128;
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

mapping admin:
    key as boolean.public;
    value as address.public;

mapping token_pairs:
    key as u64.public;
    value as TokenPair.public;

mapping orders:
    key as field.public;
    value as Order.public;

mapping stop_orders:
    key as field.public;
    value as StopLossOrder.public;

mapping iceberg_orders:
    key as field.public;
    value as IcebergOrder.public;

mapping tick_registry:
    key as field.public;
    value as TickInfo.public;

mapping total_escrowed:
    key as field.public;
    value as u128.public;

mapping order_counter:
    key as boolean.public;
    value as u64.public;

function initialize_admin:
    async initialize_admin self.caller into r0;
    output r0 as private_orderbook_0000v8testnet.aleo/initialize_admin.future;

finalize initialize_admin:
    input r0 as address.public;
    contains admin[true] into r1;
    not r1 into r2;
    assert.eq r2 true;
    set r0 into admin[true];
    set 0u64 into order_counter[true];

function transfer_admin:
    input r0 as address.public;
    async transfer_admin self.caller r0 into r1;
    output r1 as private_orderbook_0000v8testnet.aleo/transfer_admin.future;

finalize transfer_admin:
    input r0 as address.public;
    input r1 as address.public;
    get admin[true] into r2;
    assert.eq r0 r2;
    set r1 into admin[true];

function register_token_pair:
    input r0 as u64.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as u64.public;
    input r6 as address.public;
    gt r0 0u64 into r7;
    assert.eq r7 true;
    is.neq r1 r2 into r8;
    assert.eq r8 true;
    gt r3 0u64 into r9;
    assert.eq r9 true;
    lte r4 200u64 into r10;
    assert.eq r10 true;
    lte r5 100u64 into r11;
    assert.eq r11 true;
    async register_token_pair self.caller r0 r1 r2 r3 r4 r5 r6 into r12;
    output r12 as private_orderbook_0000v8testnet.aleo/register_token_pair.future;

finalize register_token_pair:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u64.public;
    input r5 as u64.public;
    input r6 as u64.public;
    input r7 as address.public;
    get admin[true] into r8;
    assert.eq r0 r8;
    contains token_pairs[r1] into r9;
    not r9 into r10;
    assert.eq r10 true;
    cast r1 r2 r3 r4 true r5 r6 r7 into r11 as TokenPair;
    set r11 into token_pairs[r1];

function submit_order:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u32.public;
    input r5 as u32.public;
    input r6 as u64.public;
    input r7 as u128.public;
    input r8 as field.public;
    gt r7 0u128 into r9;
    assert.eq r9 true;
    gte r3 r2 into r10;
    assert.eq r10 true;
    cast r6 into r11 as u128;
    mul r7 r11 into r12;
    add r12 9999u128 into r13;
    div r13 10000u128 into r14;
    ternary r1 r14 r7 into r15;
    call token_registry.aleo/transfer_public_as_signer r8 self.signer r15 into r16;
    cast self.caller 0field r0 r1 r7 r6 r4 into r17 as OrderReceipt.record;
    async submit_order self.caller r0 r1 r2 r3 r4 r5 r6 r7 r8 r15 r16 into r18;
    output r17 as OrderReceipt.record;
    output r18 as private_orderbook_0000v8testnet.aleo/submit_order.future;

finalize submit_order:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as u32.public;
    input r6 as u32.public;
    input r7 as u64.public;
    input r8 as u128.public;
    input r9 as field.public;
    input r10 as u128.public;
    input r11 as token_registry.aleo/transfer_public_as_signer.future;
    await r11;
    get token_pairs[r1] into r12;
    assert.eq r12.active true;
    ternary r2 r12.quote_token_id r12.base_token_id into r13;
    assert.eq r9 r13;
    mul 50u64 r12.tick_size into r14;
    sub r4 r3 into r15;
    lte r15 r14 into r16;
    assert.eq r16 true;
    mul r3 r12.tick_size into r17;
    gte r7 r17 into r18;
    assert.eq r18 true;
    add r4 1u64 into r19;
    mul r19 r12.tick_size into r20;
    lte r7 r20 into r21;
    assert.eq r21 true;
    gt r6 0u32 into r22;
    branch.eq r22 false to end_then_0_0;
    gt r6 block.height into r23;
    assert.eq r23 true;
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;
    get.or_use order_counter[true] 0u64 into r24;
    add r24 1u64 into r25;
    set r25 into order_counter[true];
    cast r0 into r26 as field;
    cast r25 into r27 as field;
    add r26 r27 into r28;
    cast r5 into r29 as field;
    add r28 r29 into r30;
    hash.bhp256 r30 into r31 as field;
    cast r0 r1 r3 r4 r2 r8 r7 r9 r10 0u128 r5 r6 0u8 0u8 into r32 as Order;
    set r32 into orders[r31];
    get.or_use total_escrowed[r9] 0u128 into r33;
    add r33 r10 into r34;
    set r34 into total_escrowed[r9];
    add r3 r4 into r35;
    div r35 2u64 into r36;
    cast r1 into r37 as u128;
    cast r36 into r38 as u128;
    mul r38 1000000u128 into r39;
    add r37 r39 into r40;
    hash.bhp256 r40 into r41 as field;
    cast r1 r36 0u32 0u128 0u32 into r42 as TickInfo;
    get.or_use tick_registry[r41] r42 into r43;
    add r43.order_count 1u32 into r44;
    cast r43.token_pair r43.tick_id r44 r43.total_volume_settled block.height into r45 as TickInfo;
    set r45 into tick_registry[r41];

function submit_order_credits:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u32.public;
    input r5 as u32.public;
    input r6 as u64.public;
    input r7 as u128.public;
    gt r7 0u128 into r8;
    assert.eq r8 true;
    gte r3 r2 into r9;
    assert.eq r9 true;
    cast r6 into r10 as u128;
    mul r7 r10 into r11;
    add r11 9999u128 into r12;
    div r12 10000u128 into r13;
    ternary r1 r13 r7 into r14;
    cast r14 into r15 as u64;
    call credits.aleo/transfer_public_as_signer private_orderbook_0000v8testnet.aleo r15 into r16;
    cast self.caller 0field r0 r1 r7 r6 r4 into r17 as OrderReceipt.record;
    async submit_order_credits self.caller r0 r1 r2 r3 r4 r5 r6 r7 r14 r16 into r18;
    output r17 as OrderReceipt.record;
    output r18 as private_orderbook_0000v8testnet.aleo/submit_order_credits.future;

finalize submit_order_credits:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as u32.public;
    input r6 as u32.public;
    input r7 as u64.public;
    input r8 as u128.public;
    input r9 as u128.public;
    input r10 as credits.aleo/transfer_public_as_signer.future;
    await r10;
    get token_pairs[r1] into r11;
    assert.eq r11.active true;
    ternary r2 r11.quote_token_id r11.base_token_id into r12;
    assert.eq r12 0field;
    mul 50u64 r11.tick_size into r13;
    sub r4 r3 into r14;
    lte r14 r13 into r15;
    assert.eq r15 true;
    mul r3 r11.tick_size into r16;
    gte r7 r16 into r17;
    assert.eq r17 true;
    add r4 1u64 into r18;
    mul r18 r11.tick_size into r19;
    lte r7 r19 into r20;
    assert.eq r20 true;
    gt r6 0u32 into r21;
    branch.eq r21 false to end_then_0_2;
    gt r6 block.height into r22;
    assert.eq r22 true;
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    position end_otherwise_0_3;
    get.or_use order_counter[true] 0u64 into r23;
    add r23 1u64 into r24;
    set r24 into order_counter[true];
    cast r0 into r25 as field;
    cast r24 into r26 as field;
    add r25 r26 into r27;
    cast r5 into r28 as field;
    add r27 r28 into r29;
    hash.bhp256 r29 into r30 as field;
    cast r0 r1 r3 r4 r2 r8 r7 0field r9 0u128 r5 r6 0u8 0u8 into r31 as Order;
    set r31 into orders[r30];
    get.or_use total_escrowed[0field] 0u128 into r32;
    add r32 r9 into r33;
    set r33 into total_escrowed[0field];
    add r3 r4 into r34;
    div r34 2u64 into r35;
    cast r1 into r36 as u128;
    cast r35 into r37 as u128;
    mul r37 1000000u128 into r38;
    add r36 r38 into r39;
    hash.bhp256 r39 into r40 as field;
    cast r1 r35 0u32 0u128 0u32 into r41 as TickInfo;
    get.or_use tick_registry[r40] r41 into r42;
    add r42.order_count 1u32 into r43;
    cast r42.token_pair r42.tick_id r43 r42.total_volume_settled block.height into r44 as TickInfo;
    set r44 into tick_registry[r40];

function submit_order_usdc:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u32.public;
    input r5 as u32.public;
    input r6 as u64.public;
    input r7 as u128.public;
    gt r7 0u128 into r8;
    assert.eq r8 true;
    gte r3 r2 into r9;
    assert.eq r9 true;
    cast r6 into r10 as u128;
    mul r7 r10 into r11;
    add r11 9999u128 into r12;
    div r12 10000u128 into r13;
    ternary r1 r13 r7 into r14;
    call test_usdc_token.aleo/transfer_from_public self.caller private_orderbook_0000v8testnet.aleo r14 into r15;
    cast self.caller 0field r0 r1 r7 r6 r4 into r16 as OrderReceipt.record;
    async submit_order_usdc self.caller r0 r1 r2 r3 r4 r5 r6 r7 r14 r15 into r17;
    output r16 as OrderReceipt.record;
    output r17 as private_orderbook_0000v8testnet.aleo/submit_order_usdc.future;

finalize submit_order_usdc:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as u32.public;
    input r6 as u32.public;
    input r7 as u64.public;
    input r8 as u128.public;
    input r9 as u128.public;
    input r10 as test_usdc_token.aleo/transfer_from_public.future;
    await r10;
    get token_pairs[r1] into r11;
    assert.eq r11.active true;
    ternary r2 r11.quote_token_id r11.base_token_id into r12;
    assert.eq r12 1field;
    mul 50u64 r11.tick_size into r13;
    sub r4 r3 into r14;
    lte r14 r13 into r15;
    assert.eq r15 true;
    mul r3 r11.tick_size into r16;
    gte r7 r16 into r17;
    assert.eq r17 true;
    add r4 1u64 into r18;
    mul r18 r11.tick_size into r19;
    lte r7 r19 into r20;
    assert.eq r20 true;
    gt r6 0u32 into r21;
    branch.eq r21 false to end_then_0_4;
    gt r6 block.height into r22;
    assert.eq r22 true;
    branch.eq true true to end_otherwise_0_5;
    position end_then_0_4;
    position end_otherwise_0_5;
    get.or_use order_counter[true] 0u64 into r23;
    add r23 1u64 into r24;
    set r24 into order_counter[true];
    cast r0 into r25 as field;
    cast r24 into r26 as field;
    add r25 r26 into r27;
    cast r5 into r28 as field;
    add r27 r28 into r29;
    hash.bhp256 r29 into r30 as field;
    cast r0 r1 r3 r4 r2 r8 r7 1field r9 0u128 r5 r6 0u8 0u8 into r31 as Order;
    set r31 into orders[r30];
    get.or_use total_escrowed[1field] 0u128 into r32;
    add r32 r9 into r33;
    set r33 into total_escrowed[1field];
    add r3 r4 into r34;
    div r34 2u64 into r35;
    cast r1 into r36 as u128;
    cast r35 into r37 as u128;
    mul r37 1000000u128 into r38;
    add r36 r38 into r39;
    hash.bhp256 r39 into r40 as field;
    cast r1 r35 0u32 0u128 0u32 into r41 as TickInfo;
    get.or_use tick_registry[r40] r41 into r42;
    add r42.order_count 1u32 into r43;
    cast r42.token_pair r42.tick_id r43 r42.total_volume_settled block.height into r44 as TickInfo;
    set r44 into tick_registry[r40];

function submit_stop_loss:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u32.public;
    input r3 as u32.public;
    input r4 as u64.private;
    input r5 as u64.public;
    input r6 as u128.public;
    input r7 as field.public;
    gt r6 0u128 into r8;
    assert.eq r8 true;
    cast r4 into r9 as field;
    hash.bhp256 r9 into r10 as field;
    cast r5 into r11 as u128;
    mul r6 r11 into r12;
    add r12 9999u128 into r13;
    div r13 10000u128 into r14;
    ternary r1 r14 r6 into r15;
    call token_registry.aleo/transfer_from_public r7 self.caller private_orderbook_0000v8testnet.aleo r15 into r16;
    async submit_stop_loss self.caller r0 r1 r2 r3 r10 r5 r6 r7 r15 r16 into r17;
    output r17 as private_orderbook_0000v8testnet.aleo/submit_stop_loss.future;

finalize submit_stop_loss:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u32.public;
    input r4 as u32.public;
    input r5 as field.public;
    input r6 as u64.public;
    input r7 as u128.public;
    input r8 as field.public;
    input r9 as u128.public;
    input r10 as token_registry.aleo/transfer_from_public.future;
    await r10;
    get token_pairs[r1] into r11;
    assert.eq r11.active true;
    ternary r2 r11.quote_token_id r11.base_token_id into r12;
    assert.eq r8 r12;
    get.or_use order_counter[true] 0u64 into r13;
    add r13 1u64 into r14;
    set r14 into order_counter[true];
    cast r0 into r15 as field;
    cast r14 into r16 as field;
    add r15 r16 into r17;
    cast r3 into r18 as field;
    add r17 r18 into r19;
    hash.bhp256 r19 into r20 as field;
    cast r0 r1 r2 r7 r5 r6 r8 r9 false r3 r4 into r21 as StopLossOrder;
    set r21 into stop_orders[r20];
    get.or_use total_escrowed[r8] 0u128 into r22;
    add r22 r9 into r23;
    set r23 into total_escrowed[r8];

function trigger_stop_loss:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as u64.public;
    async trigger_stop_loss r0 r1 r2 self.caller into r3;
    output r3 as private_orderbook_0000v8testnet.aleo/trigger_stop_loss.future;

finalize trigger_stop_loss:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as address.public;
    get stop_orders[r0] into r4;
    cast r1 into r5 as field;
    hash.bhp256 r5 into r6 as field;
    assert.eq r6 r4.stop_price_hash;
    branch.eq r4.is_buy false to end_then_0_6;
    gte r2 r1 into r7;
    assert.eq r7 true;
    branch.eq true true to end_otherwise_0_7;
    position end_then_0_6;
    lte r2 r1 into r8;
    assert.eq r8 true;
    position end_otherwise_0_7;
    not r4.triggered into r9;
    assert.eq r9 true;
    cast r4.trader r4.token_pair r4.is_buy r4.quantity r4.stop_price_hash r4.limit_price r4.token_id r4.escrowed_amount true r4.timestamp r4.expires_at into r10 as StopLossOrder;
    set r10 into stop_orders[r0];

function submit_stop_loss_credits:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u32.public;
    input r3 as u32.public;
    input r4 as u64.private;
    input r5 as u64.public;
    input r6 as u128.public;
    gt r6 0u128 into r7;
    assert.eq r7 true;
    cast r4 into r8 as field;
    hash.bhp256 r8 into r9 as field;
    cast r5 into r10 as u128;
    mul r6 r10 into r11;
    add r11 9999u128 into r12;
    div r12 10000u128 into r13;
    ternary r1 r13 r6 into r14;
    cast r14 into r15 as u64;
    call credits.aleo/transfer_public_as_signer private_orderbook_0000v8testnet.aleo r15 into r16;
    async submit_stop_loss_credits self.caller r0 r1 r2 r3 r9 r5 r6 r14 r16 into r17;
    output r17 as private_orderbook_0000v8testnet.aleo/submit_stop_loss_credits.future;

finalize submit_stop_loss_credits:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u32.public;
    input r4 as u32.public;
    input r5 as field.public;
    input r6 as u64.public;
    input r7 as u128.public;
    input r8 as u128.public;
    input r9 as credits.aleo/transfer_public_as_signer.future;
    await r9;
    get token_pairs[r1] into r10;
    assert.eq r10.active true;
    ternary r2 r10.quote_token_id r10.base_token_id into r11;
    assert.eq r11 0field;
    get.or_use order_counter[true] 0u64 into r12;
    add r12 1u64 into r13;
    set r13 into order_counter[true];
    cast r0 into r14 as field;
    cast r13 into r15 as field;
    add r14 r15 into r16;
    cast r3 into r17 as field;
    add r16 r17 into r18;
    hash.bhp256 r18 into r19 as field;
    cast r0 r1 r2 r7 r5 r6 0field r8 false r3 r4 into r20 as StopLossOrder;
    set r20 into stop_orders[r19];
    get.or_use total_escrowed[0field] 0u128 into r21;
    add r21 r8 into r22;
    set r22 into total_escrowed[0field];

function submit_iceberg:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u32.public;
    input r5 as u32.public;
    input r6 as u64.public;
    input r7 as u128.private;
    input r8 as u128.public;
    input r9 as u128.public;
    input r10 as field.public;
    gt r7 0u128 into r11;
    assert.eq r11 true;
    gt r8 0u128 into r12;
    assert.eq r12 true;
    lte r8 r7 into r13;
    assert.eq r13 true;
    gt r9 0u128 into r14;
    assert.eq r14 true;
    cast r6 into r15 as u128;
    mul r7 r15 into r16;
    add r16 9999u128 into r17;
    div r17 10000u128 into r18;
    ternary r1 r18 r7 into r19;
    call token_registry.aleo/transfer_from_public r10 self.caller private_orderbook_0000v8testnet.aleo r19 into r20;
    async submit_iceberg self.caller r0 r1 r2 r3 r4 r5 r6 r7 r8 r9 r10 r19 r20 into r21;
    output r21 as private_orderbook_0000v8testnet.aleo/submit_iceberg.future;

finalize submit_iceberg:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as u32.public;
    input r6 as u32.public;
    input r7 as u64.public;
    input r8 as u128.public;
    input r9 as u128.public;
    input r10 as u128.public;
    input r11 as field.public;
    input r12 as u128.public;
    input r13 as token_registry.aleo/transfer_from_public.future;
    await r13;
    get token_pairs[r1] into r14;
    assert.eq r14.active true;
    ternary r2 r14.quote_token_id r14.base_token_id into r15;
    assert.eq r11 r15;
    get.or_use order_counter[true] 0u64 into r16;
    add r16 1u64 into r17;
    set r17 into order_counter[true];
    cast r0 into r18 as field;
    cast r17 into r19 as field;
    add r18 r19 into r20;
    cast r5 into r21 as field;
    add r20 r21 into r22;
    hash.bhp256 r22 into r23 as field;
    cast r0 r1 r3 r4 r2 r8 r9 r10 r7 r11 r12 0u128 r5 r6 0u8 into r24 as IcebergOrder;
    set r24 into iceberg_orders[r23];
    add r3 r4 into r25;
    div r25 2u64 into r26;
    cast r1 into r27 as u128;
    cast r26 into r28 as u128;
    mul r28 1000000u128 into r29;
    add r27 r29 into r30;
    hash.bhp256 r30 into r31 as field;
    cast r1 r26 0u32 0u128 0u32 into r32 as TickInfo;
    get.or_use tick_registry[r31] r32 into r33;
    add r33.order_count 1u32 into r34;
    cast r33.token_pair r33.tick_id r34 r33.total_volume_settled block.height into r35 as TickInfo;
    set r35 into tick_registry[r31];
    get.or_use total_escrowed[r11] 0u128 into r36;
    add r36 r12 into r37;
    set r37 into total_escrowed[r11];

function submit_iceberg_credits:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u32.public;
    input r5 as u32.public;
    input r6 as u64.public;
    input r7 as u128.private;
    input r8 as u128.public;
    input r9 as u128.public;
    gt r7 0u128 into r10;
    assert.eq r10 true;
    gt r8 0u128 into r11;
    assert.eq r11 true;
    lte r8 r7 into r12;
    assert.eq r12 true;
    gt r9 0u128 into r13;
    assert.eq r13 true;
    cast r6 into r14 as u128;
    mul r7 r14 into r15;
    add r15 9999u128 into r16;
    div r16 10000u128 into r17;
    ternary r1 r17 r7 into r18;
    cast r18 into r19 as u64;
    call credits.aleo/transfer_public_as_signer private_orderbook_0000v8testnet.aleo r19 into r20;
    async submit_iceberg_credits self.caller r0 r1 r2 r3 r4 r5 r6 r7 r8 r9 r18 r20 into r21;
    output r21 as private_orderbook_0000v8testnet.aleo/submit_iceberg_credits.future;

finalize submit_iceberg_credits:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as u32.public;
    input r6 as u32.public;
    input r7 as u64.public;
    input r8 as u128.public;
    input r9 as u128.public;
    input r10 as u128.public;
    input r11 as u128.public;
    input r12 as credits.aleo/transfer_public_as_signer.future;
    await r12;
    get token_pairs[r1] into r13;
    assert.eq r13.active true;
    ternary r2 r13.quote_token_id r13.base_token_id into r14;
    assert.eq r14 0field;
    get.or_use order_counter[true] 0u64 into r15;
    add r15 1u64 into r16;
    set r16 into order_counter[true];
    cast r0 into r17 as field;
    cast r16 into r18 as field;
    add r17 r18 into r19;
    cast r5 into r20 as field;
    add r19 r20 into r21;
    hash.bhp256 r21 into r22 as field;
    cast r0 r1 r3 r4 r2 r8 r9 r10 r7 0field r11 0u128 r5 r6 0u8 into r23 as IcebergOrder;
    set r23 into iceberg_orders[r22];
    add r3 r4 into r24;
    div r24 2u64 into r25;
    cast r1 into r26 as u128;
    cast r25 into r27 as u128;
    mul r27 1000000u128 into r28;
    add r26 r28 into r29;
    hash.bhp256 r29 into r30 as field;
    cast r1 r25 0u32 0u128 0u32 into r31 as TickInfo;
    get.or_use tick_registry[r30] r31 into r32;
    add r32.order_count 1u32 into r33;
    cast r32.token_pair r32.tick_id r33 r32.total_volume_settled block.height into r34 as TickInfo;
    set r34 into tick_registry[r30];
    get.or_use total_escrowed[0field] 0u128 into r35;
    add r35 r11 into r36;
    set r36 into total_escrowed[0field];

function cancel_order:
    input r0 as field.public;
    async cancel_order self.caller r0 into r1;
    output r1 as private_orderbook_0000v8testnet.aleo/cancel_order.future;

finalize cancel_order:
    input r0 as address.public;
    input r1 as field.public;
    get orders[r1] into r2;
    assert.eq r2.trader r0;
    is.eq r2.status 0u8 into r3;
    assert.eq r3 true;
    lt r2.filled r2.quantity into r4;
    assert.eq r4 true;
    cast r2.limit_price into r5 as u128;
    mul r2.filled r5 into r6;
    add r6 9999u128 into r7;
    div r7 10000u128 into r8;
    ternary r2.is_buy r8 r2.filled into r9;
    sub r2.escrowed_amount r9 into r10;
    cast r2.trader r2.token_pair r2.tick_lower r2.tick_upper r2.is_buy r2.quantity r2.limit_price r2.token_id 0u128 r2.filled r2.timestamp r2.expires_at 2u8 r2.order_type into r11 as Order;
    set r11 into orders[r1];
    get total_escrowed[r2.token_id] into r12;
    sub r12 r10 into r13;
    set r13 into total_escrowed[r2.token_id];
    add r2.tick_lower r2.tick_upper into r14;
    div r14 2u64 into r15;
    cast r2.token_pair into r16 as u128;
    cast r15 into r17 as u128;
    mul r17 1000000u128 into r18;
    add r16 r18 into r19;
    hash.bhp256 r19 into r20 as field;
    get tick_registry[r20] into r21;
    sub r21.order_count 1u32 into r22;
    cast r21.token_pair r21.tick_id r22 r21.total_volume_settled block.height into r23 as TickInfo;
    set r23 into tick_registry[r20];

function withdraw_cancelled:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    call token_registry.aleo/transfer_public r1 self.caller r2 into r3;
    async withdraw_cancelled self.caller r0 r1 r2 r3 into r4;
    output r4 as private_orderbook_0000v8testnet.aleo/withdraw_cancelled.future;

finalize withdraw_cancelled:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as token_registry.aleo/transfer_public.future;
    get orders[r1] into r5;
    assert.eq r5.trader r0;
    is.eq r5.status 2u8 into r6;
    assert.eq r6 true;
    assert.eq r5.token_id r2;
    is.neq r2 0field into r7;
    assert.eq r7 true;
    cast r5.limit_price into r8 as u128;
    mul r5.filled r8 into r9;
    add r9 9999u128 into r10;
    div r10 10000u128 into r11;
    ternary r5.is_buy r11 r5.filled into r12;
    sub r5.escrowed_amount r12 into r13;
    assert.eq r3 r13;
    await r4;

function withdraw_cancelled_credits:
    input r0 as field.public;
    input r1 as u64.public;
    call credits.aleo/transfer_public self.caller r1 into r2;
    cast r1 into r3 as u128;
    async withdraw_cancelled_credits self.caller r0 r3 r2 into r4;
    output r4 as private_orderbook_0000v8testnet.aleo/withdraw_cancelled_credits.future;

finalize withdraw_cancelled_credits:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as credits.aleo/transfer_public.future;
    get orders[r1] into r4;
    assert.eq r4.trader r0;
    is.eq r4.status 2u8 into r5;
    assert.eq r5 true;
    assert.eq r4.token_id 0field;
    cast r4.limit_price into r6 as u128;
    mul r4.filled r6 into r7;
    add r7 9999u128 into r8;
    div r8 10000u128 into r9;
    ternary r4.is_buy r9 r4.filled into r10;
    sub r4.escrowed_amount r10 into r11;
    assert.eq r2 r11;
    await r3;

function settle_match:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u32.public;
    cast self.caller 0u64 0u128 0u64 true r2 into r3 as Settlement.record;
    cast self.caller 0u64 0u128 0u64 false r2 into r4 as Settlement.record;
    async settle_match r0 r1 self.caller r2 into r5;
    output r3 as Settlement.record;
    output r4 as Settlement.record;
    output r5 as private_orderbook_0000v8testnet.aleo/settle_match.future;

finalize settle_match:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as u32.public;
    get orders[r0] into r4;
    get orders[r1] into r5;
    assert.eq r4.token_pair r5.token_pair;
    is.eq r4.is_buy true into r6;
    assert.eq r6 true;
    is.eq r5.is_buy false into r7;
    assert.eq r7 true;
    is.eq r4.status 0u8 into r8;
    assert.eq r8 true;
    is.eq r5.status 0u8 into r9;
    assert.eq r9 true;
    gt r4.expires_at 0u32 into r10;
    branch.eq r10 false to end_then_0_8;
    gt r4.expires_at block.height into r11;
    assert.eq r11 true;
    branch.eq true true to end_otherwise_0_9;
    position end_then_0_8;
    position end_otherwise_0_9;
    gt r5.expires_at 0u32 into r12;
    branch.eq r12 false to end_then_0_10;
    gt r5.expires_at block.height into r13;
    assert.eq r13 true;
    branch.eq true true to end_otherwise_0_11;
    position end_then_0_10;
    position end_otherwise_0_11;
    gt r4.tick_lower r5.tick_lower into r14;
    ternary r14 r4.tick_lower r5.tick_lower into r15;
    lt r4.tick_upper r5.tick_upper into r16;
    ternary r16 r4.tick_upper r5.tick_upper into r17;
    lte r15 r17 into r18;
    assert.eq r18 true;
    gte r4.limit_price r5.limit_price into r19;
    assert.eq r19 true;
    lt r4.filled r4.quantity into r20;
    assert.eq r20 true;
    lt r5.filled r5.quantity into r21;
    assert.eq r21 true;
    sub r4.quantity r4.filled into r22;
    sub r5.quantity r5.filled into r23;
    lt r22 r23 into r24;
    ternary r24 r22 r23 into r25;
    add r4.limit_price r5.limit_price into r26;
    div r26 2u64 into r27;
    cast r27 into r28 as u128;
    mul r25 r28 into r29;
    add r29 9999u128 into r30;
    div r30 10000u128 into r31;
    get token_pairs[r4.token_pair] into r32;
    cast r32.settler_fee_bps into r33 as u128;
    mul r31 r33 into r34;
    div r34 10000u128 into r35;
    cast r32.protocol_fee_bps into r36 as u128;
    mul r31 r36 into r37;
    div r37 10000u128 into r38;
    gte r25 r22 into r39;
    sub r4.escrowed_amount r31 into r40;
    add r4.filled r25 into r41;
    ternary r39 1u8 0u8 into r42;
    cast r4.trader r4.token_pair r4.tick_lower r4.tick_upper true r4.quantity r4.limit_price r4.token_id r40 r41 r4.timestamp r4.expires_at r42 r4.order_type into r43 as Order;
    set r43 into orders[r0];
    gte r25 r23 into r44;
    sub r5.escrowed_amount r25 into r45;
    add r5.filled r25 into r46;
    ternary r44 1u8 0u8 into r47;
    cast r5.trader r5.token_pair r5.tick_lower r5.tick_upper false r5.quantity r5.limit_price r5.token_id r45 r46 r5.timestamp r5.expires_at r47 r5.order_type into r48 as Order;
    set r48 into orders[r1];
    get total_escrowed[r5.token_id] into r49;
    sub r49 r25 into r50;
    set r50 into total_escrowed[r5.token_id];
    get total_escrowed[r4.token_id] into r51;
    sub r51 r31 into r52;
    set r52 into total_escrowed[r4.token_id];
    add r4.tick_lower r4.tick_upper into r53;
    div r53 2u64 into r54;
    cast r4.token_pair into r55 as u128;
    cast r54 into r56 as u128;
    mul r56 1000000u128 into r57;
    add r55 r57 into r58;
    hash.bhp256 r58 into r59 as field;
    get tick_registry[r59] into r60;
    sub r60.order_count 1u32 into r61;
    ternary r39 r61 r60.order_count into r62;
    add r60.total_volume_settled r25 into r63;
    cast r60.token_pair r60.tick_id r62 r63 block.height into r64 as TickInfo;
    set r64 into tick_registry[r59];
    add r5.tick_lower r5.tick_upper into r65;
    div r65 2u64 into r66;
    cast r5.token_pair into r67 as u128;
    cast r66 into r68 as u128;
    mul r68 1000000u128 into r69;
    add r67 r69 into r70;
    hash.bhp256 r70 into r71 as field;
    get tick_registry[r71] into r72;
    sub r72.order_count 1u32 into r73;
    ternary r44 r73 r72.order_count into r74;
    add r72.total_volume_settled r25 into r75;
    cast r72.token_pair r72.tick_id r74 r75 block.height into r76 as TickInfo;
    set r76 into tick_registry[r71];

function execute_transfers_arc21:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as u128.public;
    input r8 as address.public;
    input r9 as address.public;
    call token_registry.aleo/transfer_public r2 r8 r4 into r10;
    call token_registry.aleo/transfer_public r3 r9 r6 into r11;
    call token_registry.aleo/transfer_public r3 self.caller r7 into r12;
    async execute_transfers_arc21 r0 r1 r2 r3 r4 r5 r8 r9 r10 r11 r12 into r13;
    output r13 as private_orderbook_0000v8testnet.aleo/execute_transfers_arc21.future;

finalize execute_transfers_arc21:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as address.public;
    input r7 as address.public;
    input r8 as token_registry.aleo/transfer_public.future;
    input r9 as token_registry.aleo/transfer_public.future;
    input r10 as token_registry.aleo/transfer_public.future;
    get orders[r0] into r11;
    get orders[r1] into r12;
    get token_pairs[r11.token_pair] into r13;
    assert.eq r13.base_token_id r2;
    assert.eq r13.quote_token_id r3;
    assert.eq r11.trader r6;
    assert.eq r12.trader r7;
    is.neq r2 0field into r14;
    assert.eq r14 true;
    is.neq r3 0field into r15;
    assert.eq r15 true;
    await r8;
    await r9;
    await r10;

function execute_transfers_credits_base:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u64.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as address.public;
    input r8 as address.public;
    call credits.aleo/transfer_public r7 r3 into r9;
    call token_registry.aleo/transfer_public r2 r8 r5 into r10;
    call token_registry.aleo/transfer_public r2 self.caller r6 into r11;
    cast r3 into r12 as u128;
    async execute_transfers_credits_base r0 r1 r2 r12 r4 r7 r8 r9 r10 r11 into r13;
    output r13 as private_orderbook_0000v8testnet.aleo/execute_transfers_credits_base.future;

finalize execute_transfers_credits_base:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as address.public;
    input r7 as credits.aleo/transfer_public.future;
    input r8 as token_registry.aleo/transfer_public.future;
    input r9 as token_registry.aleo/transfer_public.future;
    get orders[r0] into r10;
    get orders[r1] into r11;
    get token_pairs[r10.token_pair] into r12;
    assert.eq r12.base_token_id 0field;
    assert.eq r12.quote_token_id r2;
    assert.eq r10.trader r5;
    assert.eq r11.trader r6;
    is.neq r2 0field into r13;
    assert.eq r13 true;
    await r7;
    await r8;
    await r9;

function execute_transfers_credits_quote:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u64.public;
    input r5 as u64.public;
    input r6 as address.public;
    input r7 as address.public;
    call token_registry.aleo/transfer_public r2 r6 r3 into r8;
    call credits.aleo/transfer_public r7 r4 into r9;
    call credits.aleo/transfer_public self.caller r5 into r10;
    cast r4 into r11 as u128;
    async execute_transfers_credits_quote r0 r1 r2 r3 r11 r6 r7 r8 r9 r10 into r12;
    output r12 as private_orderbook_0000v8testnet.aleo/execute_transfers_credits_quote.future;

finalize execute_transfers_credits_quote:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as address.public;
    input r7 as token_registry.aleo/transfer_public.future;
    input r8 as credits.aleo/transfer_public.future;
    input r9 as credits.aleo/transfer_public.future;
    get orders[r0] into r10;
    get orders[r1] into r11;
    get token_pairs[r10.token_pair] into r12;
    assert.eq r12.base_token_id r2;
    assert.eq r12.quote_token_id 0field;
    assert.eq r10.trader r5;
    assert.eq r11.trader r6;
    is.neq r2 0field into r13;
    assert.eq r13 true;
    await r7;
    await r8;
    await r9;

function execute_transfers_credits_both:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as address.public;
    input r6 as address.public;
    call credits.aleo/transfer_public r5 r2 into r7;
    call credits.aleo/transfer_public r6 r3 into r8;
    call credits.aleo/transfer_public self.caller r4 into r9;
    cast r2 into r10 as u128;
    cast r3 into r11 as u128;
    async execute_transfers_credits_both r0 r1 r10 r11 r5 r6 r7 r8 r9 into r12;
    output r12 as private_orderbook_0000v8testnet.aleo/execute_transfers_credits_both.future;

finalize execute_transfers_credits_both:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as address.public;
    input r5 as address.public;
    input r6 as credits.aleo/transfer_public.future;
    input r7 as credits.aleo/transfer_public.future;
    input r8 as credits.aleo/transfer_public.future;
    get orders[r0] into r9;
    get orders[r1] into r10;
    get token_pairs[r9.token_pair] into r11;
    assert.eq r11.base_token_id 0field;
    assert.eq r11.quote_token_id 0field;
    assert.eq r9.trader r4;
    assert.eq r10.trader r5;
    await r6;
    await r7;
    await r8;

function execute_transfers_usdc_quote:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as address.public;
    call credits.aleo/transfer_public r5 r2 into r7;
    call test_usdc_token.aleo/transfer_public r6 r3 into r8;
    call test_usdc_token.aleo/transfer_public self.caller r4 into r9;
    cast r2 into r10 as u128;
    async execute_transfers_usdc_quote r0 r1 r10 r3 r5 r6 r7 r8 r9 into r11;
    output r11 as private_orderbook_0000v8testnet.aleo/execute_transfers_usdc_quote.future;

finalize execute_transfers_usdc_quote:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as address.public;
    input r5 as address.public;
    input r6 as credits.aleo/transfer_public.future;
    input r7 as test_usdc_token.aleo/transfer_public.future;
    input r8 as test_usdc_token.aleo/transfer_public.future;
    get orders[r0] into r9;
    get orders[r1] into r10;
    get token_pairs[r9.token_pair] into r11;
    assert.eq r11.base_token_id 0field;
    assert.eq r11.quote_token_id 1field;
    assert.eq r9.trader r4;
    assert.eq r10.trader r5;
    await r6;
    await r7;
    await r8;

function execute_transfers_arc21_usdc:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as address.public;
    input r7 as address.public;
    call token_registry.aleo/transfer_public r2 r6 r3 into r8;
    call test_usdc_token.aleo/transfer_public r7 r4 into r9;
    call test_usdc_token.aleo/transfer_public self.caller r5 into r10;
    async execute_transfers_arc21_usdc r0 r1 r2 r3 r4 r6 r7 r8 r9 r10 into r11;
    output r11 as private_orderbook_0000v8testnet.aleo/execute_transfers_arc21_usdc.future;

finalize execute_transfers_arc21_usdc:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    input r6 as address.public;
    input r7 as token_registry.aleo/transfer_public.future;
    input r8 as test_usdc_token.aleo/transfer_public.future;
    input r9 as test_usdc_token.aleo/transfer_public.future;
    get orders[r0] into r10;
    get orders[r1] into r11;
    get token_pairs[r10.token_pair] into r12;
    assert.eq r12.base_token_id r2;
    assert.eq r12.quote_token_id 1field;
    assert.eq r10.trader r5;
    assert.eq r11.trader r6;
    is.neq r2 0field into r13;
    assert.eq r13 true;
    is.neq r2 1field into r14;
    assert.eq r14 true;
    await r7;
    await r8;
    await r9;

function withdraw_cancelled_usdc:
    input r0 as field.public;
    input r1 as u128.public;
    call test_usdc_token.aleo/transfer_public self.caller r1 into r2;
    async withdraw_cancelled_usdc self.caller r0 r1 r2 into r3;
    output r3 as private_orderbook_0000v8testnet.aleo/withdraw_cancelled_usdc.future;

finalize withdraw_cancelled_usdc:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as test_usdc_token.aleo/transfer_public.future;
    get orders[r1] into r4;
    assert.eq r4.trader r0;
    is.eq r4.status 2u8 into r5;
    assert.eq r5 true;
    assert.eq r4.token_id 1field;
    cast r4.limit_price into r6 as u128;
    mul r4.filled r6 into r7;
    add r7 9999u128 into r8;
    div r8 10000u128 into r9;
    ternary r4.is_buy r9 r4.filled into r10;
    sub r4.escrowed_amount r10 into r11;
    assert.eq r2 r11;
    await r3;

function get_order_info:
    input r0 as field.public;
    output r0 as field.private;

constructor:
    assert.eq edition 0u16;
