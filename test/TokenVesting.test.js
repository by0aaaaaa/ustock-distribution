import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import latestTime from 'openzeppelin-solidity/test/helpers/latestTime';
import {increaseTimeTo, duration} from 'openzeppelin-solidity/test/helpers/increaseTime';

const BigNumber = web3.BigNumber;
const transaction = (address, wei) => ({
    from: address,
    value: wei
});
const ethBalance = (address) => web3.eth.getBalance(address).toNumber();
const toWei = (number) => number * Math.pow(10, 18);
const getYmd = (timestamp) => {
    var date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const Ustock = artifacts.require('Ustock');
const TokenVesting = artifacts.require('TokenVesting');

contract('TokenVesting', async (accounts) => {

    const amount = new BigNumber(10000);

    const owner = accounts[0];
    const privateRaiseWallet = accounts[1];
    const beneficiary = accounts[5];

    beforeEach(async function () {
        //构造代币合约
        this.token = await Ustock.new(owner, {from: owner});

        this.start = latestTime() + duration.minutes(1); // +1 minute so it starts after contract instantiation
        this.duration = duration.years(2);
        this.phase = 4;

        //构造锁仓合约
        this.vesting = await TokenVesting.new(beneficiary, this.start, this.duration, this.phase, true, {from: owner});

        //将代币合约转入到锁仓合约的地址中
        await this.token.transfer(this.vesting.address, amount, {from: owner});
    });


    // 在归属第一个阶段结束前可以主动释放代币，但只能释放0个
    it('cannot be released before the first phase end', async function () {
        await increaseTimeTo(this.start + duration.minutes(1));
        await this.vesting.release(this.token.address).should.be.fulfilled;
        const balance = await this.token.balanceOf(beneficiary);
        balance.should.bignumber.equal(0);
    });

    // 在归属第一个阶段后能够释放 1/phase 数量的代币
    it('should release proper amount after the first phase', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase));
        await this.vesting.release(this.token.address);
        const balance = await this.token.balanceOf(beneficiary);
        balance.should.bignumber.equal(amount.div(this.phase).floor());
    });

    // 在归属第n个阶段结束时，直接释放 n*(1/phase) 数量的代币
    it('should directly release n*(1/phase) tokens when at the time point of n phase', async function () {
        const vestingPeriod = this.duration;
        const checkpoints = 4;

        for (let i = 1; i <= this.phase; i++) {

            const now = this.start + i * (vestingPeriod / checkpoints);
            await increaseTimeTo(now);

            await this.vesting.release(this.token.address);
            const balance = await this.token.balanceOf(beneficiary);
            //console.log(balance.toNumber())

            const expectedVesting = amount.div(this.phase).mul(i);
            balance.should.bignumber.equal(expectedVesting);
        }
    });

    // 在归属第n个阶段结束前，仍只能释放 (n-1)*(1/phase) 数量的代币
    it('should still release (n-1)*(1/phase) tokens when before the time point of n phase', async function () {
        const vestingPeriod = this.duration;
        const checkpoints = 4;

        for (let i = 1; i <= this.phase; i++) {

            const now = this.start + i * (vestingPeriod / checkpoints) - (vestingPeriod / (checkpoints * 2));
            await increaseTimeTo(now);
            //console.log(getYmd(this.start) + '~~~~~' + getYmd(now))

            await this.vesting.release(this.token.address);
            const balance = await this.token.balanceOf(beneficiary);
            const expectedVesting = amount.div(this.phase).mul(i - 1);

            //console.log(balance.toNumber() + '~~~~~' + expectedVesting.toNumber())
            balance.should.bignumber.equal(expectedVesting);
        }
    });

    // 应该在归属期结束后，释放所有
    it('should have released all after end', async function () {
        await increaseTimeTo(this.start + this.duration);

        await this.vesting.release(this.token.address);

        const balance = await this.token.balanceOf(beneficiary);
        balance.should.bignumber.equal(amount);
    });

    // 如果设置了可废除，则可以废除
    it('should be revoked by owner if revocable is set', async function () {
        await this.vesting.revoke(this.token.address, {from: owner}).should.be.fulfilled;
    });

    // 如果没有设置可废除，则可不以废除
    it('should fail to be revoked by owner if revocable not set', async function () {
        const vesting = await TokenVesting.new(beneficiary, this.start, this.duration, this.phase, false, {from: owner});
        await vesting.revoke(this.token.address, {from: owner}).should.be.rejectedWith(EVMRevert);
    });

    // 在废除后，没有归属的部分要被回收到owner帐户中
    it('should return the non-vested tokens when revoked by owner', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(1));

        const vested = await this.vesting.vestedAmount(this.token.address);
        //console.log(vested.toNumber())

        const originalOwnerBalance = await this.token.balanceOf(owner);
        //console.log(originalOwnerBalance.toNumber())

        const beneficiaryBalance2 = await this.token.balanceOf(beneficiary);
        //console.log(beneficiaryBalance2.toNumber())

        // 你可以自己去释放，这一步我们不关心
        await this.vesting.release(this.token.address);

        const beneficiaryBalance3 = await this.token.balanceOf(beneficiary);
        //console.log(beneficiaryBalance3.toNumber())

        await this.vesting.revoke(this.token.address, {from: owner});

        const ownerBalance = await this.token.balanceOf(owner);
        //console.log(ownerBalance.toNumber())

        ownerBalance.should.bignumber.equal(originalOwnerBalance.add(amount.sub(vested)));
    });

    // 在废除前后，已归属的部分应该保持不变
    it('should keep the vested tokens when revoked by owner', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(1));

        const vestedPre = await this.vesting.vestedAmount(this.token.address);

        await this.vesting.revoke(this.token.address, {from: owner});

        const vestedPost = await this.vesting.vestedAmount(this.token.address);

        vestedPre.should.bignumber.equal(vestedPost);
    });

    // 应该只能废除一遍
    it('should fail to be revoked a second time', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(1));

        const vested = await this.vesting.vestedAmount(this.token.address);

        await this.vesting.revoke(this.token.address, {from: owner});
        //console.log(vested.toNumber())

        await this.vesting.revoke(this.token.address, {from: owner}).should.be.rejectedWith(EVMRevert);
        //console.log(vested.toNumber())
    });
});
