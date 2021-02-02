// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

contract VestingContract is ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.UintSet;

    event Paused(address account);
    event Unpaused(address account);

    event ScheduleCreated(
        address indexed _beneficiary,
        uint256 indexed _id
    );

    event DrawDown(
        address indexed _beneficiary,
        uint256 indexed _amount,
        uint256 indexed _time
    );

    struct Schedule {
        address token;
        uint256 start;
        uint256 end;
        uint256 cliff;
        uint256 amount;
        uint256 totalDrawn;
        uint256 lastDrawnAt;
        uint256 drawDownRate;
    }

    Schedule[] vestingSchedules;

    // Worker address to IDs of active or future vesting schedules
    mapping(address => EnumerableSet.UintSet) workerVestingSchedules;

    mapping(address => bool) public whitelistedTokens;

    uint256 constant PERIOD_ONE_DAY_IN_SECONDS = 1 days;

    bool public paused;

    modifier whenNotPaused() {
        require(!paused, "VestingContract: Method cannot be invoked as contract has been paused");
        _;
    }

    constructor(address[] memory _whitelistedTokens, address _owner) {
        require(_whitelistedTokens.length > 0, "At least 1 token must be whitelisted");

        for(uint i = 0; i < _whitelistedTokens.length; i++) {
            address _token = _whitelistedTokens[i];
            require(_token != address(0), "Supplied address cannot be the zero address");

            whitelistedTokens[_token] = true;
        }

        // todo: this may need to change to an access controls setup to be more flexible
        transferOwnership(_owner);
    }

    function createVestingSchedule(address _token, address _beneficiary, uint256 _amount, uint256 _start, uint256 _durationInDays, uint256 _cliffDurationInDays) external {
        // fixme
        //require(accessControls.hasAdminRole(_msgSender()), "VestingContract.createVestingSchedule: Only admin");

        require(whitelistedTokens[_token], "VestingContract.createVestingSchedule: token not whitelisted");
        require(_beneficiary != address(0), "VestingContract.createVestingSchedule: Beneficiary cannot be empty");
        require(_amount > 0, "VestingContract.createVestingSchedule: Amount cannot be empty");
        require(_durationInDays > 0, "VestingContract.createVestingSchedule: Duration cannot be empty");
        require(_cliffDurationInDays <= _durationInDays, "VestingContract.createVestingSchedule: Cliff can not be bigger than duration");

        // Create schedule
        uint256 _durationInSecs = _durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
        uint256 _cliffDurationInSecs = _cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
        uint256 scheduleId = vestingSchedules.length;
        vestingSchedules.push(
            Schedule({
                token: _token,
                start : _start,
                end : _start.add(_durationInSecs),
                cliff : _start.add(_cliffDurationInSecs),
                amount : _amount,
                totalDrawn : 0, // no tokens drawn yet
                lastDrawnAt : 0, // never invoked
                drawDownRate : _amount.div(_durationInSecs)
            })
        );

        // todo: what if this is a dxd schedule being created?
        workerVestingSchedules[_beneficiary].add(scheduleId);

        emit ScheduleCreated(_beneficiary, scheduleId);
    }

//    function drawDown() whenNotPaused nonReentrant external {
//        Schedule storage schedule = vestingSchedule[msg.sender];
//        require(schedule.amount > 0, "VestingContract.drawDown: There is no schedule currently in flight");
//
//        // available right now
//        uint256 amount = _availableDrawDownAmount(msg.sender);
//        require(amount > 0, "VestingContract.drawDown: Nothing to withdraw");
//
//        // Update last drawn to now
//        schedule.lastDrawnAt = _getNow();
//
//        // Increase total drawn amount
//        schedule.totalDrawn = schedule.totalDrawn.add(amount);
//
//        // Issue tokens to beneficiary
//        require(token.transfer(msg.sender, amount), "VestingContract.drawDown: Unable to transfer tokens");
//
//        emit DrawDown(msg.sender, amount, _getNow());
//    }

//    function pause() external {
//        require(accessControls.hasAdminRole(_msgSender()), "VestingContract.pause: Only admin");
//
//        paused = true;
//        emit Paused(msg.sender);
//    }
//
//    function unpause() external {
//        require(accessControls.hasAdminRole(_msgSender()), "VestingContract.unpause: Only admin");
//
//        paused = false;
//        emit Unpaused(msg.sender);
//    }

    ///////////////
    // Accessors //
    ///////////////

//
//    function vestingScheduleForBeneficiary(address _beneficiary) external view returns (uint256 _start, uint256 _end, uint256 _cliff, uint256 _amount, uint256 _totalDrawn, uint256 _lastDrawnAt, uint256 _drawDownRate, uint256 _remainingBalance) {
//        Schedule memory schedule = vestingSchedule[_beneficiary];
//        return (
//        schedule.start,
//        schedule.end,
//        schedule.cliff,
//        schedule.amount,
//        schedule.totalDrawn,
//        schedule.lastDrawnAt,
//        schedule.drawDownRate,
//        schedule.amount.sub(schedule.totalDrawn)
//        );
//    }

//    function availableDrawDownAmount(address _beneficiary) external view returns (uint256 _amount) {
//        return _availableDrawDownAmount(_beneficiary);
//    }

    //////////////
    // Internal //
    //////////////

    function _getNow() internal view virtual returns (uint256) {
        return block.timestamp;
    }

//    function _availableDrawDownAmount(address _beneficiary) internal view returns (uint256 _amount) {
//        Schedule memory schedule = vestingSchedule[_beneficiary];
//
//        // Cliff
//
//        // the cliff period has not ended, therefore, no tokens to draw down
//        if (_getNow() <= schedule.cliff) {
//            return 0;
//        }
//
//        // Ended
//        if (_getNow() > schedule.end) {
//            return schedule.amount.sub(schedule.totalDrawn);
//        }
//
//        // Active
//
//        // Work out when the last invocation was
//        uint256 timeLastDrawnOrStart = schedule.lastDrawnAt == 0 ? schedule.start : schedule.lastDrawnAt;
//
//        // Find out how much time has past since last invocation
//        uint256 timePassedSinceLastInvocation = _getNow().sub(timeLastDrawnOrStart);
//
//        // Work out how many due tokens - time passed * rate per second
//        return timePassedSinceLastInvocation.mul(schedule.drawDownRate);
//    }
}
