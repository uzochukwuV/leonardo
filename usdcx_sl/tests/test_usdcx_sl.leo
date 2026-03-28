// The 'test_usdcx_sl' test program.
import usdcx_sl.aleo;
program test_usdcx_sl.aleo {
    @test
    script test_it() {
        let result: u32 = usdcx_sl.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = usdcx_sl.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
