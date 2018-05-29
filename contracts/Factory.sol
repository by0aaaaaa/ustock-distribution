pragma solidity ^0.4.23;

import 'contracts/Ustock.sol';


contract Factory {

    function createContract(
        address _fundsWallet) public returns (address created)
    {
        return new Ustock(
            _fundsWallet
        );
    }
}