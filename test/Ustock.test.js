import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';

const BigNumber = web3.BigNumber;

const Ustock = artifacts.require('./Ustock.sol');
const Factory = artifacts.require('./Factory.sol');

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const ethBalance = (address) => web3.eth.getBalance(address).toNumber();
const toWei = (number) => number * Math.pow(10, 18);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const getYmd = (timestamp) => {
    var date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

contract('Ustock', (accounts) => {

    const owner = accounts[0];
    const fundsWallet = accounts[1];

    const privateRaiserWallet = accounts[2];
    const foundationWallet = accounts[3];

    let TOTAL_SUPPLY = 1000000000;

    const createToken = () => Ustock.new(fundsWallet);

    // 发行总量1000000000
    it('should have initial supply of 1000000000 totally', async () => {
        const ustock = await createToken();
        const expectedSupply = TOTAL_SUPPLY;

        const totalSupply = await ustock.totalSupply();
        assert.equal(totalSupply.toNumber(), expectedSupply, 'Total supply mismatch');
    });

    // 创始机构持有50%
    it('should have supply of 500000000 units assigned to funds Wallet', async () => {
        const ustock = await createToken();
        const ownerWalletBalance = await ustock.balanceOf(owner);
        const expectedOwnerWalletBalanceTotal = 0;

        const fundsWalletBalance = await ustock.balanceOf(fundsWallet);
        const expectedFundsWalletBalanceTotal = TOTAL_SUPPLY * 0.5;

        //console.log(ownerWalletBalance.toNumber(), fundsWalletBalance.toNumber())

        assert.equal(ownerWalletBalance.toNumber(), expectedOwnerWalletBalanceTotal, 'owner Wallet balance mismatch');
        assert.equal(fundsWalletBalance.toNumber(), expectedFundsWalletBalanceTotal, 'funds Wallet balance mismatch');
    });

    // 应该有一个owner
    it('should have an owner', async () => {
        const ustock = await createToken();

        let owner = await ustock.owner();
        //console.log(owner)
        owner.should.not.eq(ZERO_ADDRESS);
    });

    // 可以转移owner
    it('changes owner after transfer', async function () {
        const ustock = await createToken();
        let other = fundsWallet;
        await ustock.transferOwnership(other);
        let owner = await ustock.owner();

        owner.should.eq(other);
    });

    // 应该阻止非owner来进行所有权变更
    it('should prevent non-owners from transfering', async function () {
        const ustock = await createToken();

        const other = fundsWallet;
        const owner = await ustock.owner.call();

        owner.should.not.eq(other);

        await ustock.transferOwnership(other, {from: other}).should.be.rejectedWith(EVMRevert);
    });

    // 不能将owner权置空
    it('should guard ownership against stuck state', async function () {
        const ustock = await createToken();

        let originalOwner = await ustock.owner();
        await ustock.transferOwnership(null, {from: originalOwner}).should.be.rejectedWith(EVMRevert);
    });

    // 只有owner可以手动关闭合约
    it('can close the contract manual only by the owner', async function () {
        const ustock = await createToken();

        await ustock.close({from: owner}).should.be.fulfilled;
        //const closed = await ustock.closed();
        //console.log(closed)
        await ustock.close({from: fundsWallet}).should.be.rejectedWith(EVMRevert);
    });

    // 合约关闭前可以进行转账主动转账
    it('can transfer when contract open', async () => {
        const ustock = await createToken();

        await ustock.transfer(privateRaiserWallet, 1000, {from: fundsWallet}).should.be.fulfilled;

        const privateRaiserBalance = await ustock.balanceOf(privateRaiserWallet);
        assert.equal(privateRaiserBalance.toNumber(), 1000, 'privateRaiser Wallet balance mismatch');
    });

    // 合约关闭前可以进行转账授权被动转账
    it('can approve and transferFrom when contract open', async () => {
        const ustock = await createToken();

        await ustock.approve(privateRaiserWallet, 1500, {from: fundsWallet});
        await ustock.transferFrom(fundsWallet, privateRaiserWallet, 1000, {from: privateRaiserWallet}).should.be.fulfilled;

        const privateRaiserBalance = await ustock.balanceOf(privateRaiserWallet);
        assert.equal(privateRaiserBalance.toNumber(), 1000, 'privateRaiser Wallet balance mismatch');
    });

    // 合约关闭后不能进行主动转账
    it('can not transfer when contract closed', async () => {
        const ustock = await createToken();

        await ustock.close({from: owner});
        await ustock.transfer(privateRaiserWallet, 1000, {from: fundsWallet}).should.be.rejectedWith(EVMRevert);

        const privateRaiserBalance = await ustock.balanceOf(privateRaiserWallet);
        assert.equal(privateRaiserBalance.toNumber(), 0, 'privateRaiser Wallet balance mismatch');
    });

    // 合约关闭后不能进行被动授权转账
    it('can not approve and transferFrom when contract closed', async () => {
        const ustock = await createToken();
        await ustock.close({from: owner});

        await ustock.approve(privateRaiserWallet, 1500, {from: fundsWallet});
        await ustock.transferFrom(fundsWallet, privateRaiserWallet, 1000, {from: privateRaiserWallet}).should.be.rejectedWith(EVMRevert);

        const privateRaiserBalance = await ustock.balanceOf(privateRaiserWallet);
        assert.equal(privateRaiserBalance.toNumber(), 0, 'privateRaiser Wallet balance mismatch');
    });

    // 合约关闭前可以注册
    it('can register when contract open', async () => {
        const ustock = await createToken();

        let key1 = 'UTR859gxfnXyUriMgUeThh1fWv3oqcpLFyHa3TfFYC4PK2HqhToVM'
        let key2 = 'UTR555gxfnXyUriMgUeThh1fWv3oqcpLFyHa3TfFYC4PK2HqhT123'

        await ustock.register(key1, {from: privateRaiserWallet}).should.be.fulfilled;
        await ustock.register(key2, {from: foundationWallet}).should.be.fulfilled;

        let expectedKey1 = await ustock.keys(privateRaiserWallet)
        let expectedKey2 = await ustock.keys(foundationWallet)
        //console.log(expectedKey1, expectedKey2)

        assert.equal(expectedKey1, key1, 'key1 register mismatch');
        assert.equal(expectedKey2, key2, 'key2 register mismatch');
    });

    // 合约关闭后不可以继续注册
    it('can not register when contract closed', async () => {
        const ustock = await createToken();
        await ustock.close({from: owner});

        let key1 = 'UTR859gxfnXyUriMgUeThh1fWv3oqcpLFyHa3TfFYC4PK2HqhToVM'
        await ustock.register(key1, {from: privateRaiserWallet}).should.be.rejectedWith(EVMRevert);

        let expectedKey1 = await ustock.keys(privateRaiserWallet)
        //console.log(expectedKey1)

        assert.equal(expectedKey1, '', 'key1 register mismatch');
    });

});

contract('Factory', accounts => {

    /*it('createContract', async () => {
        const factory = await Factory.new()
        const token = await factory.createContract('0x397afadfdabd962d2316cb3ced89e995baca090d', 1526904454, 2, 5)
        console.log(token)
    });*/

});
