pragma solidity ^0.4.23;

import 'contracts/TokenVesting.sol';

contract VestingFactory {

    function createVesting(
        address _beneficiary,
        uint256 _start,
        uint256 _duration,
        uint256 _phase,
        bool _revocable
    )
    public returns (address created)
    {
        return new TokenVesting(
            _beneficiary,
            _start,
            _duration,
            _phase,
            _revocable
        );
    }
}