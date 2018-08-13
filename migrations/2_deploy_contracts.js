var TokenVestingFactory = artifacts.require("./TokenVestingFactory.sol");
var Ustock = artifacts.require("./Ustock.sol");

module.exports = function(deployer) {
    deployer.deploy(Ustock);
    deployer.deploy(TokenVestingFactory);
};
