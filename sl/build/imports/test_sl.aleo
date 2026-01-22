import sl.aleo;
program test_sl.aleo;

function dummy:
    output 1u32 as u32.private;

constructor:
    assert.eq edition 0u16;
