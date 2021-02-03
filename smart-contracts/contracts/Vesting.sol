// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import { AccessControls } from "./AccessControls.sol";

contract VestingContract is ReentrancyGuard {
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
        address beneficiary;
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

    AccessControls public accessControls;

    modifier whenNotPaused() {
        require(!paused, "VestingContract: Method cannot be invoked as contract has been paused");
        _;
    }

    constructor(address[] memory _whitelistedTokens, AccessControls _accessControls) {
        require(_whitelistedTokens.length > 0, "At least 1 token must be whitelisted");

        for(uint i = 0; i < _whitelistedTokens.length; i++) {
            address _token = _whitelistedTokens[i];
            require(_token != address(0), "Supplied address cannot be the zero address");

            whitelistedTokens[_token] = true;
        }

        accessControls = _accessControls;
    }

    function createVestingSchedule(address _token, address _beneficiary, uint256 _amount, uint256 _start, uint256 _durationInDays, uint256 _cliffDurationInDays) external {
        require(accessControls.hasWhitelistRole(msg.sender), "VestingContract.createVestingSchedule: Only whitelist");

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
                beneficiary: _beneficiary,
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

    function drawDownAll() whenNotPaused nonReentrant external {
        address beneficiary = msg.sender;
        uint256[] memory activeWorkerScheduleIdsForBeneficiary_ = activeWorkerScheduleIdsForBeneficiary(beneficiary);

        for(uint i = 0; i < activeWorkerScheduleIdsForBeneficiary_.length; i++) {
            uint256 scheduleId = activeWorkerScheduleIdsForBeneficiary_[i];
            drawDown(scheduleId);
        }
    }

    // todo: this action should update workerVestingSchedules i.e. when total drawn == amount, remove the schedule ID from workerVestingSchedules
    function drawDown(uint256 _scheduleId) whenNotPaused nonReentrant public {
        Schedule storage schedule = vestingSchedules[_scheduleId];
        require(schedule.amount > 0, "VestingContract.drawDown: There is no schedule currently in flight");

        // available right now
        uint256 amount = _availableDrawDownAmount(_scheduleId);
        require(amount > 0, "VestingContract.drawDown: Nothing to withdraw");

        // Update last drawn to now
        schedule.lastDrawnAt = _getNow();

        // Increase total drawn amount
        schedule.totalDrawn = schedule.totalDrawn.add(amount);

        // Issue tokens to beneficiary
        require(
            IERC20(schedule.token).transfer(schedule.beneficiary, amount),
            "VestingContract.drawDown: Unable to transfer tokens"
        );

        emit DrawDown(schedule.beneficiary, amount, _getNow());
    }

    function pause() external {
        require(accessControls.hasAdminRole(msg.sender), "VestingContract.pause: Only admin");

        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        require(accessControls.hasAdminRole(msg.sender), "VestingContract.unpause: Only admin");

        paused = false;
        emit Unpaused(msg.sender);
    }

    ///////////////
    // Accessors //
    ///////////////


    function workerVestingSchedule(uint256 _scheduleId) external view returns (
        address _token,
        address _beneficiary,
        uint256 _start,
        uint256 _end,
        uint256 _cliff,
        uint256 _amount,
        uint256 _totalDrawn,
        uint256 _lastDrawnAt,
        uint256 _drawDownRate,
        uint256 _remainingBalance
    ) {
        Schedule storage schedule = vestingSchedules[_scheduleId];

        return (
        schedule.token,
        schedule.beneficiary,
        schedule.start,
        schedule.end,
        schedule.cliff,
        schedule.amount,
        schedule.totalDrawn,
        schedule.lastDrawnAt,
        schedule.drawDownRate,
        schedule.amount.sub(schedule.totalDrawn)
        );
    }

    function activeWorkerScheduleIdsForBeneficiary(address _beneficiary) public view returns (uint256[] memory _activeScheduleIds) {
        EnumerableSet.UintSet storage activeOrFutureScheduleIds = workerVestingSchedules[_beneficiary];
        uint256 activeOrFutureScheduleIdsSetSize = activeOrFutureScheduleIds.length();

        require(activeOrFutureScheduleIdsSetSize > 0, "activeScheduleIdForBeneficiary: no active schedules");

        uint256[] memory activeScheduleIds = new uint256[](activeOrFutureScheduleIdsSetSize);
        for(uint i = 0; i < activeOrFutureScheduleIdsSetSize; i++) {
            uint256 scheduleId = activeOrFutureScheduleIds.at(i);
            uint256 availableDrawDownAmount_ = availableDrawDownAmount(scheduleId);

            // if the schedule has not ended, this is the current schedule
            if (availableDrawDownAmount_ > 0 && _getNow() > vestingSchedules[scheduleId].cliff) {
                activeScheduleIds[i] = scheduleId;
            }
        }

        return activeScheduleIds;
    }

    function availableDrawDownAmount(uint256 _scheduleId) public view returns (uint256 _amount) {
        return _availableDrawDownAmount(_scheduleId);
    }

    //////////////
    // Internal //
    //////////////

    function _getNow() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    function _availableDrawDownAmount(uint256 _scheduleId) internal view returns (uint256 _amount) {
        Schedule storage schedule = vestingSchedules[_scheduleId];

        // Cliff

        // the cliff period has not ended, therefore, no tokens to draw down
        if (_getNow() <= schedule.cliff) {
            return 0;
        }

        // Ended
        if (_getNow() > schedule.end) {
            return schedule.amount.sub(schedule.totalDrawn);
        }

        // Active

        // Work out when the last invocation was
        uint256 timeLastDrawnOrStart = schedule.lastDrawnAt == 0 ? schedule.start : schedule.lastDrawnAt;

        // Find out how much time has past since last invocation
        uint256 timePassedSinceLastInvocation = _getNow().sub(timeLastDrawnOrStart);

        // Work out how many due tokens - time passed * rate per second
        return timePassedSinceLastInvocation.mul(schedule.drawDownRate);
    }
}
