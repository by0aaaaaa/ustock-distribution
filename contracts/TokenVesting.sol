/* solium-disable security/no-block-members */

pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title TokenVesting
 * @dev A token holder contract that can release its token balance gradually like a
 * typical vesting scheme, with a cliff and vesting period. Optionally revocable by the
 * owner.
 */
contract TokenVesting is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20Basic;

    event Released(uint256 amount);
    event Revoked();

    // beneficiary of tokens after they are released
    address public beneficiary;
    // start time of vesting
    uint256 public start;
    // duration time of vesting
    uint256 public duration;
    // total sum of phase that the duration are divided
    uint256 public phase;
    // whether can be revocable
    bool public revocable;

    mapping(address => uint256) public released;
    mapping(address => bool) public revoked;

    /**
     * @dev Creates a vesting contract that vests its balance of any ERC20 token to the
     * _beneficiary, gradually in a linear fashion until _start + _duration. By then all
     * of the balance will have vested.
     * @param _beneficiary address of the beneficiary to whom vested tokens are transferred
     * @param _duration duration in seconds of the period in which the tokens will vest
     * @param _phase total sum of phase that the duration are divided
     * @param _revocable whether the vesting is revocable or not
     */
    constructor(
        address _beneficiary,
        uint256 _start,
        uint256 _duration,
        uint256 _phase,
        bool _revocable
    )
    public
    {
        require(_beneficiary != address(0));
        require(_phase >= 1);

        beneficiary = _beneficiary;
        start = _start;
        duration = _duration;
        phase = _phase;
        revocable = _revocable;
    }

    /**
     * @notice Transfers vested tokens to beneficiary.
     * @param token ERC20 token which is being vested
     */
    function release(ERC20Basic token) public {
        uint256 unreleased = releasableAmount(token);

        require(unreleased >= 0);

        released[token] = released[token].add(unreleased);

        token.transfer(beneficiary, unreleased);

        emit Released(unreleased);
    }

    /**
     * @notice Allows the owner to revoke the vesting. Tokens already vested
     * remain in the contract, the rest are returned to the owner.
     * @param token ERC20 token which is being vested
     */
    function revoke(ERC20Basic token) public onlyOwner {
        require(revocable);
        require(!revoked[token]);

        uint256 balance = token.balanceOf(this);

        uint256 unreleased = releasableAmount(token);
        uint256 refund = balance.sub(unreleased);

        revoked[token] = true;

        token.transfer(owner, refund);

        emit Revoked();
    }

    /**
     * @dev Calculates the amount that has already vested but hasn't been released yet.
     * @param token ERC20 token which is being vested
     */
    function releasableAmount(ERC20Basic token) public view returns (uint256) {
        return vestedAmount(token).sub(released[token]);
    }

    /**
     * @dev Calculates the amount that has already vested.
     * @param token ERC20 token which is being vested
     */
    function vestedAmount(ERC20Basic token) public view returns (uint256) {
        uint256 currentBalance = token.balanceOf(this);
        uint256 totalBalance = currentBalance.add(released[token]);

        if (block.timestamp < start) {
            return 0;
        } else if (block.timestamp >= start.add(duration) || revoked[token]) {
            return totalBalance;
        } else {
            uint256 everyPhaseDuration = duration.div(phase);
            uint256 currentPhase = (block.timestamp - start).div(everyPhaseDuration);
            return totalBalance.div(phase).mul(currentPhase);
        }
    }
}
