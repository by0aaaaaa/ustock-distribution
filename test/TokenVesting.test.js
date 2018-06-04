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

    const amount = new BigNumber(toWei(10000000));

    const owner = accounts[0];
    const privateRaiseWallet = accounts[1];
    const beneficiary = accounts[5];

    beforeEach(async function () {
        // initialize a token contract
        this.token = await Ustock.new({from: owner});

        // for private equity firms, initialize a contract half an year earlier
        //this.start = new Date(2017, 11, 1).getTime() / 1000; // +1 minute so it starts after contract instantiation
        //console.log(this.start,latestTime())

        this.start = latestTime() + duration.minutes(1); // +1 minute so it starts after contract instantiation
        //console.log(this.start)
        //console.log(new Date(2017, 12, 1).getTime())

        this.duration = duration.years(2);
        //console.log(this.duration)

        this.phase = 4;

        //构造锁仓合约
        // initialize a locking contract
        this.vesting = await TokenVesting.new(beneficiary, this.start, this.duration, this.phase, true, {from: owner});

        //const balanceOwner = await this.token.balanceOf(owner);
        //console.log(balanceOwner.toNumber())

        // transfer token to the locking contract
        console.log(amount.toNumber())
        await this.token.transfer(this.vesting.address, amount, {from: owner});

        //const balanceOwner2 = await this.token.balanceOf(owner);
        //console.log(balanceOwner2.toNumber())
    });


    // 在归属第一个阶段结束前可以主动释放代币，但只能释放0个
    // cannot be released before the first phase end
    it('cannot be released before the first phase end', async function () {
        await increaseTimeTo(this.start + duration.minutes(1));
        await this.vesting.release(this.token.address).should.be.fulfilled;
        const balance = await this.token.balanceOf(beneficiary);
        balance.should.bignumber.equal(0);
    });

    // after the first phase, release (amount = 1/phase) token
    it('should release proper amount after the first phase', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(100));

        await this.vesting.release(this.token.address);

        const balance = await this.token.balanceOf(beneficiary);
        //console.log(balance.toNumber())

        balance.should.bignumber.equal(amount.div(this.phase).floor());
    });

    // after the time point of n phase, release (amount = n*1/phase) token
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

    // before the time point of n phase, only release (amount = (n-1)*1/phase) token
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

    // in the end, release all
    it('should have released all after end', async function () {
        await increaseTimeTo(this.start + this.duration);

        await this.vesting.release(this.token.address);

        const balance = await this.token.balanceOf(beneficiary);
        balance.should.bignumber.equal(amount);
    });

    // if revocable is set, can be revoked by owner
    it('should be revoked by owner if revocable is set', async function () {
        await this.vesting.revoke(this.token.address, {from: owner}).should.be.fulfilled;
    });

    // if revocable is not set, cannot be revoked by owner
    it('should fail to be revoked by owner if revocable not set', async function () {
        const vesting = await TokenVesting.new(beneficiary, this.start, this.duration, this.phase, false, {from: owner});
        await vesting.revoke(this.token.address, {from: owner}).should.be.rejectedWith(EVMRevert);
    });

    // when rovoked, non-vested tokens are returned to owner's account
    it('should return the non-vested tokens when revoked by owner', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(1));

        const vested = await this.vesting.vestedAmount(this.token.address);
        //console.log(vested.toNumber())

        const originalOwnerBalance = await this.token.balanceOf(owner);
        //console.log(originalOwnerBalance.toNumber())

        const beneficiaryBalance2 = await this.token.balanceOf(beneficiary);
        //console.log(beneficiaryBalance2.toNumber())

        // release at will
        await this.vesting.release(this.token.address);

        const beneficiaryBalance3 = await this.token.balanceOf(beneficiary);
        //console.log(beneficiaryBalance3.toNumber())

        await this.vesting.revoke(this.token.address, {from: owner});

        const ownerBalance = await this.token.balanceOf(owner);
        //console.log(ownerBalance.toNumber())

        ownerBalance.should.bignumber.equal(originalOwnerBalance.add(amount.sub(vested)));
    });

    // vested tokens are untouched, when revoked by owner
    it('should keep the vested tokens when revoked by owner', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(1));

        const vestedPre = await this.vesting.vestedAmount(this.token.address);

        await this.vesting.revoke(this.token.address, {from: owner});

        const vestedPost = await this.vesting.vestedAmount(this.token.address);

        vestedPre.should.bignumber.equal(vestedPost);
    });

    // revoked only once
    it('should fail to be revoked a second time', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(1));

        const vested = await this.vesting.vestedAmount(this.token.address);

        await this.vesting.revoke(this.token.address, {from: owner});
        //console.log(vested.toNumber())

        await this.vesting.revoke(this.token.address, {from: owner}).should.be.rejectedWith(EVMRevert);
        //console.log(vested.toNumber())
    });

    // release only once
    it('should fail to be released a second time', async function () {
        await increaseTimeTo(this.start + duration.seconds(this.duration / this.phase) + duration.minutes(1));

        await this.vesting.release(this.token.address);
        const balanceFirst = await this.token.balanceOf(beneficiary);
        //console.log(balanceFirst.toNumber())

        await this.vesting.release(this.token.address);
        const balanceSec = await this.token.balanceOf(beneficiary);
        //console.log(balanceSec.toNumber())

        balanceFirst.should.bignumber.equal(balanceSec);
    });
});
