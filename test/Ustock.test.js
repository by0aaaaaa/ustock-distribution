const Ustock = artifacts.require('./Ustock.sol');

// various test utility functions
const transaction = (address, wei) => ({
    from: address,
    value: wei
});

const ethBalance = (address) => web3.eth.getBalance(address).toNumber();
const toWei = (number) => number * Math.pow(10, 18);
const fail = (msg) => (error) => assert(false, error ? `${msg}, but got error: ${error.message}` : msg);
const assertExpectedError = async (promise) => {
    try {
        await promise;
        fail('expected to fail')();
    } catch (error) {
        const invalidOpcode = error.message.search('revert') >= -1 || error.message.search('invalid opcode') > -1;
        console.log(invalidOpcode)
        assert(invalidOpcode, `Expected throw, but got: ${error.message}`);
    }
}

const getYmd = (timestamp) => {
    var date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

const timeController = (() => {

    const addSeconds = (seconds) => new Promise((resolve, reject) =>
        web3.currentProvider.sendAsync({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [seconds],
            id: new Date().getTime()
        }, (error, result) => error ? reject(error) : resolve(result.result)));

    const addDays = (days) => addSeconds(days * 24 * 60 * 60);

    const currentTimestamp = () => web3.eth.getBlock(web3.eth.blockNumber).timestamp;

    return {
        addSeconds,
        addDays,
        currentTimestamp
    };
})();

contract('Ustock', accounts => {

    const fundsWallet = accounts[1];
    const buyerOneWallet = accounts[2];
    const buyerTwoWallet = accounts[3];
    const buyerThreeWallet = accounts[4];

    const oneEth = toWei(1);
    const minCap = toWei(2);
    const maxCap = toWei(5);

    const createToken = () => Ustock.new(fundsWallet, timeController.currentTimestamp(), minCap, maxCap);

    // REQ001: Basic ERC20 “Ustock” with symbol of “USK”,
    // 18 decimals (reflecting ether’s smallest unit - wei)
    // and total supply of 1,000,000 units created at contract deployment
    // and assigned to a specific wallet,
    it('should have initial supply of 1,000,000 units assigned to funds wallet', async () => {
        const ustock = await createToken();
        const expectedSupply = toWei(1000000);

        const totalSupply = await ustock.totalSupply();
        assert.equal(totalSupply, expectedSupply, 'Total supply mismatch');

        const fundsWalletBalance = await ustock.balanceOf(fundsWallet);
        assert.equal(fundsWalletBalance.toNumber(), expectedSupply, 'Initial funds wallet balance mismatch');
    });

    // REQ002: The ICO is going to last 4 weeks,
    // trying to raise a minimum of 1,000 ETH and maximum of 20,000 ETH;
    // if the goal is not met the ICO continues until the payments reach the min cap
    it('should open at startTimestamp', async () => {
        const startTimestamp = timeController.currentTimestamp() + 3600;
        console.log(getYmd(startTimestamp))

        //将开盘时间设为一个小时后开启
        const ustock = await Ustock.new(fundsWallet, startTimestamp, minCap, maxCap);

        // should be closed
        await assertExpectedError(ustock.sendTransaction(transaction(buyerOneWallet, oneEth)));

        //时钟拨至一个小时后
        await timeController.addSeconds(3600);

        // should be open
        ustock.sendTransaction(transaction(buyerOneWallet, oneEth));
    });

    it('should last 4 weeks if the goal is reached and allow token transfers afterwards', async () => {
        const ustock = await createToken();

        await ustock.sendTransaction(transaction(buyerOneWallet, minCap));

        const totalRaised = await ustock.totalRaised();
        console.log(totalRaised.toNumber())

        await timeController.addDays(4 * 7);

        // should be closed
        await assertExpectedError(ustock.sendTransaction(transaction(buyerTwoWallet, oneEth)));

        const totalRaised2 = await ustock.totalRaised();
        console.log(totalRaised2.toNumber())

        assert.equal(totalRaised2.toNumber(), minCap, 'Total raised amount mismatch')

        const balance1 = ethBalance(buyerOneWallet);
        const balance2 = ethBalance(buyerTwoWallet);
        console.log(balance1, balance2)

        // REQ004 should allow token transfer
        await ustock.transfer(buyerTwoWallet, 100000000000, {from: buyerOneWallet});

        const balance3 = ethBalance(buyerOneWallet);
        const balance4 = ethBalance(buyerTwoWallet);
        console.log(balance3, balance4)
    });

    it('should last more then 4 weeks if the goal is not reached and allow token transfers after closing', async () => {
        const ustock = await createToken();

        await ustock.sendTransaction(transaction(buyerOneWallet, oneEth));
        await timeController.addDays(4 * 7 + 1);
        const totalRaised = await ustock.totalRaised();
        console.log(totalRaised.toNumber())

        // should still be open
        await ustock.sendTransaction(transaction(buyerTwoWallet, minCap - oneEth));
        const totalRaised2 = await ustock.totalRaised();
        console.log(totalRaised2.toNumber())

        // should be closed
        await assertExpectedError(ustock.sendTransaction(transaction(buyerThreeWallet, oneEth)));
        const totalRaised3 = await ustock.totalRaised();
        console.log(totalRaised3.toNumber())

        assert.equal(totalRaised3.toNumber(), minCap, 'Total raised amount mismatch');

        // REQ004 should allow token transfer
        await ustock.transfer(buyerTwoWallet, 1, {from: buyerOneWallet});
    });

    it('should close after the max cap is reached and allow token transfers afterwards', async () => {
        const ustock = await createToken();
        const totalRaised = await ustock.totalRaised();
        console.log(totalRaised.toNumber())

        await ustock.sendTransaction(transaction(buyerOneWallet, oneEth));
        const totalRaised2 = await ustock.totalRaised();
        console.log(totalRaised2.toNumber())

        // should allow going over max cap
        await ustock.sendTransaction(transaction(buyerTwoWallet, maxCap));
        const totalRaised3 = await ustock.totalRaised();
        console.log(totalRaised3.toNumber())

        // should close after reaching max cap
        await assertExpectedError(ustock.sendTransaction(transaction(buyerThreeWallet, oneEth)));

        const totalRaised4 = await ustock.totalRaised();
        console.log(totalRaised4.toNumber())

        assert.equal(totalRaised4.toNumber(), maxCap + oneEth, 'Total raised amount mismatch');
    });

    // REQ003: Raised ether is going to be transferred to a specific wallet after each payment,
    it('should transfer raised funds to fundsWallet after each payment', async () => {
        const initialFundsWalletBalance = ethBalance(fundsWallet);
        const expectedBalanceGrowth = (wei) => initialFundsWalletBalance + wei;

        const ustock = await createToken();

        await ustock.sendTransaction(transaction(buyerOneWallet, oneEth));

        console.log(ustock.address)
        assert.equal(ethBalance(ustock.address), 0, 'Contract balance mismatch');
        assert.equal(ethBalance(fundsWallet), expectedBalanceGrowth(oneEth), 'Funds wallet balance mismatch');

        await ustock.sendTransaction(transaction(buyerTwoWallet, oneEth));

        assert.equal(ethBalance(ustock.address), 0, 'Contract balance mismatch');
        assert.equal(ethBalance(fundsWallet), expectedBalanceGrowth(oneEth * 2), 'Funds wallet balance mismatch');
    });

    // REQ004: Tokens are going to be available for transfers only after the ICO ends,
    it('should not allow token transfers before ICO', async () => {
        const startTimestamp = timeController.currentTimestamp() + 3600;
        const ustock = await Ustock.new(fundsWallet, startTimestamp, minCap, maxCap);

        // should not allow token transfer before ICO
        await assertExpectedError(ustock.transfer(buyerTwoWallet, 1, {from: buyerOneWallet}));
    });

    it('should not allow token transfers during ICO', async () => {
        const ustock = await createToken();

        await ustock.sendTransaction(transaction(buyerOneWallet, oneEth));

        // should not allow token transfer during ICO
        await assertExpectedError(ustock.transfer(buyerTwoWallet, 1, {from: buyerOneWallet}));
    });

    // REQ005: The tokens are going to be sold at a flat rate of 1 ETH : 50 ESP,
    // with added +50% bonus during the first week.
    it('should be sold with +50% bonus during the first week', async () => {
        const ustock = await createToken();

        await ustock.sendTransaction(transaction(buyerOneWallet, oneEth));

        const buyerOneBalance = await ustock.balanceOf(buyerOneWallet);
        assert.equal(buyerOneBalance.toNumber(), 50 * oneEth * 1.5, 'Buyer one token balance mismatch');
    });

    it('should be sold with no bonus after the first week', async () => {
        const ustock = await createToken();

        await timeController.addDays(8);//7 will fail
        await ustock.sendTransaction(transaction(buyerOneWallet, oneEth));

        const buyerOneBalance = await ustock.balanceOf(buyerOneWallet);

        assert.equal(buyerOneBalance.toNumber(), 50 * oneEth, 'Buyer one token balance mismatch');
    });

});