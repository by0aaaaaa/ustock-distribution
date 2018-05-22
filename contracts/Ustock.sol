pragma solidity ^0.4.23;

import 'openzeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';


contract Ustock is StandardToken, Ownable {
    using SafeMath for uint256;

    string public name = "UStock";
    string public symbol = "USK";
    uint256 public decimals = 18;

    uint256 public INITIAL_SUPPLY = 1000000 * (10 ** uint256(decimals)); //total supply
    uint256 public constant MINING_RESERVE = 0.6 * 1000000 * (10 ** uint256(decimals));   // amount reserved for mining

    uint256 public totalRaised; // total ether raised (in wei)

    uint256 public startTimestamp; // timestamp after which ICO will start
    uint256 public durationSeconds = 4 * 7 * 24 * 60 * 60; // 4 weeks

    uint256 public minCap; // the ICO ether goal (in wei)
    uint256 public maxCap; // the ICO ether max cap (in wei)

    mapping(address => string)                 public  keys;

    /**
     * Address which will receive raised funds 
     * and owns the total supply of tokens
     */
    address public fundsWallet;

    constructor(
        address _fundsWallet,
        uint256 _startTimestamp,
        uint256 _minCap,
        uint256 _maxCap) public {
        fundsWallet = _fundsWallet;
        startTimestamp = _startTimestamp;
        minCap = _minCap;
        maxCap = _maxCap;

        totalSupply_ = INITIAL_SUPPLY;
        // 销掉60%
        balances[0xb1] = MINING_RESERVE;

        // founder持有40%
        balances[fundsWallet] = INITIAL_SUPPLY - MINING_RESERVE;
        emit Transfer(0x0, 0xb1, MINING_RESERVE);
        emit Transfer(0x0, fundsWallet, INITIAL_SUPPLY - MINING_RESERVE);
    }

    function() isIcoOpen public payable {
        totalRaised = totalRaised.add(msg.value);

        uint256 tokenAmount = calculateTokenAmount(msg.value);
        balances[fundsWallet] = balances[fundsWallet].sub(tokenAmount);
        balances[msg.sender] = balances[msg.sender].add(tokenAmount);
        emit Transfer(fundsWallet, msg.sender, tokenAmount);

        // immediately transfer ether to fundsWallet
        fundsWallet.transfer(msg.value);
    }

    function calculateTokenAmount(uint256 weiAmount) public constant returns (uint256) {
        // standard rate: 1 ETH : 50 USK
        uint256 tokenAmount = weiAmount.mul(50);
        if (now <= startTimestamp + 7 days) {
            // +50% bonus during first week
            return tokenAmount.mul(150).div(100);
        } else {
            return tokenAmount;
        }
    }

    function transfer(address _to, uint _value) isIcoFinished public returns (bool) {
        return super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint _value) isIcoFinished public returns (bool) {
        return super.transferFrom(_from, _to, _value);
    }

    //用于内部指派
    function assignTo(address _to, uint _value) onlyOwner public returns (bool) {
        return super.transfer(_to, _value);
    }

    //由ultrain链生成的公钥
    function register(string key) {
        assert(bytes(key).length <= 64);
        keys[msg.sender] = key;
    }

    modifier isIcoOpen() {
        require(now >= startTimestamp);
        require(now <= (startTimestamp + durationSeconds) || totalRaised < minCap);
        require(totalRaised <= maxCap);
        _;
    }

    modifier isIcoFinished() {
        require(now >= startTimestamp);
        require(totalRaised >= maxCap || (now >= (startTimestamp + durationSeconds) && totalRaised >= minCap));
        _;
    }
}