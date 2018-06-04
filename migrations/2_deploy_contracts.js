var TokenVestingFactory = artifacts.require("./TokenVestingFactory.sol");

module.exports = function(deployer) {
    deployer.deploy(TokenVestingFactory);
};
