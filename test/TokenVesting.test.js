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
        this.cliff = duration.years(1);
        this.duration = duration.years(2);

        //构造锁仓合约
        this.vesting = await TokenVesting.new(beneficiary, this.start, this.cliff, this.duration, true, {from: owner});

        //将代币合约转入到锁仓合约的地址中
        await this.token.transfer(this.vesting.address, amount, {from: owner});
    });


    // 在断崖前不能释放代币
    it('cannot be released before cliff', async function () {
        await this.vesting.release(this.token.address).should.be.rejectedWith(EVMRevert);
    });

    // 在断崖后可以释放代币
    it('can be released after cliff', async function () {
        await increaseTimeTo(this.start + this.cliff + duration.weeks(1));
        await this.vesting.release(this.token.address).should.be.fulfilled;
    });

    // 在断崖后能够释放合适数量的代币
    it('should release proper amount after cliff', async function () {
        await increaseTimeTo(this.start + this.cliff);

        const {receipt} = await this.vesting.release(this.token.address);
        const releaseTime = web3.eth.getBlock(receipt.blockNumber).timestamp;

        const balance = await this.token.balanceOf(beneficiary);
        //console.log(balance.toNumber())
        balance.should.bignumber.equal(amount.mul(releaseTime - this.start).div(this.duration).floor());
    });

    // 在归属期应该线性归属（在归属期取4个点进行测试）
    it('should linearly release tokens during vesting period', async function () {
        const vestingPeriod = this.duration - this.cliff;
        const checkpoints = 4;

        for (let i = 1; i <= checkpoints; i++) {
            const now = this.start + this.cliff + i * (vestingPeriod / checkpoints);
            await increaseTimeTo(now);

            await this.vesting.release(this.token.address);
            const balance = await this.token.balanceOf(beneficiary);
            //console.log(balance.toNumber())

            const expectedVesting = amount.mul(now - this.start).div(this.duration).floor();
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
        const vesting = await TokenVesting.new(beneficiary, this.start, this.cliff, this.duration, false, {from: owner});
        await vesting.revoke(this.token.address, {from: owner}).should.be.rejectedWith(EVMRevert);
    });

    // 在废除后，不有归属的部分要被回收到owner帐户中
    it('should return the non-vested tokens when revoked by owner', async function () {
        await increaseTimeTo(this.start + this.cliff + duration.weeks(12));

        const vested = await this.vesting.vestedAmount(this.token.address);
        //console.log(vested.toNumber())

        const originalOwnerBalance = await this.token.balanceOf(owner);
        //console.log(originalOwnerBalance.toNumber())

        //const beneficiaryBalance2 = await this.token.balanceOf(beneficiary);
        //console.log(beneficiaryBalance2.toNumber())

        // 你可以自己去释放，这一步我们不关心
        //await this.vesting.release(this.token.address);

        //const beneficiaryBalance3 = await this.token.balanceOf(beneficiary);
        //console.log(beneficiaryBalance3.toNumber())

        await this.vesting.revoke(this.token.address, {from: owner});

        const ownerBalance = await this.token.balanceOf(owner);
        //console.log(ownerBalance.toNumber())

        ownerBalance.should.bignumber.equal(originalOwnerBalance.add(amount.sub(vested)));
    });

    // 在废除前后，已归属的部分应该保持不变
    it('should keep the vested tokens when revoked by owner', async function () {
        await increaseTimeTo(this.start + this.cliff + duration.weeks(12));

        const vestedPre = await this.vesting.vestedAmount(this.token.address);

        await this.vesting.revoke(this.token.address, {from: owner});

        const vestedPost = await this.vesting.vestedAmount(this.token.address);

        vestedPre.should.bignumber.equal(vestedPost);
    });

    // 应该只能废除一遍
    it('should fail to be revoked a second time', async function () {
        await increaseTimeTo(this.start + this.cliff + duration.weeks(12));

        await this.vesting.vestedAmount(this.token.address);

        await this.vesting.revoke(this.token.address, {from: owner});

        await this.vesting.revoke(this.token.address, {from: owner}).should.be.rejectedWith(EVMRevert);
    });
});
