pragma solidity ^0.4.23;

import 'contracts/TokenVesting.sol';

contract TokenVestingFactory is Ownable {

    event Created(TokenVesting vesting);

    function create(
        address _owner,
        address _beneficiary,
        uint256 _start,
        uint256 _duration,
        uint256 _phase,
        bool _revocable
    ) onlyOwner public returns (TokenVesting) {
        TokenVesting vesting = new TokenVesting(
            _owner,
            _beneficiary,
            _start,
            _duration,
            _phase,
            _revocable
        );
        emit Created(vesting);
        return vesting;
    }
}

