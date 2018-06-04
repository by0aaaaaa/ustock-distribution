var VestingFactory = artifacts.require("./VestingFactory.sol");

module.exports = function(deployer) {
    deployer.deploy(VestingFactory);
};
