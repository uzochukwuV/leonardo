// The 'test_mock_usdc' test program.
import mock_usdc.aleo;
program test_mock_usdc.aleo {
    @test
    script test_it() {
        let result: u32 = mock_usdc.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = mock_usdc.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
