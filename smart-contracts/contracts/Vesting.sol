// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import { AccessControls } from "./AccessControls.sol";

contract Vesting is ReentrancyGuard {
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
        uint256 drawDownRate;
    }

    Schedule[] vestingSchedules;

    /// @notice Schedule ID -> totalDrawn by beneficiary
    mapping(uint256 => uint256) public totalDrawn;

    /// @notice Schedule ID -> last drawn timestamp
    mapping(uint256 => uint256) public lastDrawnAt;

    // Beneficiary -> IDs of all associated vesting schedules
    mapping(address => EnumerableSet.UintSet) beneficiaryVestingSchedules;

    mapping(address => bool) public whitelistedTokens;

    uint256 constant PERIOD_ONE_DAY_IN_SECONDS = 1 days;

    bool public paused;

    AccessControls public accessControls;

    modifier whenNotPaused() {
        require(!paused, "Vesting: Method cannot be invoked as contract has been paused");
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
        require(accessControls.hasWhitelistRole(msg.sender), "Vesting.createVestingSchedule: Only whitelist");

        require(whitelistedTokens[_token], "Vesting.createVestingSchedule: token not whitelisted");
        require(_beneficiary != address(0), "Vesting.createVestingSchedule: Beneficiary cannot be empty");
        require(_amount > 0, "Vesting.createVestingSchedule: Amount cannot be empty");
        require(_durationInDays > 0, "Vesting.createVestingSchedule: Duration cannot be empty");
        require(_cliffDurationInDays <= _durationInDays, "Vesting.createVestingSchedule: Cliff can not be bigger than duration");

        // Create schedule
        uint256 durationInSecs = _durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
        uint256 cliffDurationInSecs = _cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
        uint256 scheduleId = vestingSchedules.length;
        vestingSchedules.push(
            Schedule({
                token: _token,
                beneficiary: _beneficiary,
                start : _start,
                end : _start.add(durationInSecs),
                cliff : _start.add(cliffDurationInSecs),
                amount : _amount,
                drawDownRate : _amount.div(durationInSecs)
            })
        );

        beneficiaryVestingSchedules[_beneficiary].add(scheduleId);

        emit ScheduleCreated(_beneficiary, scheduleId);
    }

    function drawDownAll() whenNotPaused nonReentrant external {
        address beneficiary = msg.sender;
        uint256[] memory activeWorkerScheduleIdsForBeneficiary_ = activeScheduleIdsForBeneficiary(beneficiary);

        for(uint i = 0; i < activeWorkerScheduleIdsForBeneficiary_.length; i++) {
            uint256 scheduleId = activeWorkerScheduleIdsForBeneficiary_[i];
            _drawDown(scheduleId);
        }
    }

    function drawDown(uint256 _scheduleId) whenNotPaused nonReentrant public {
        _drawDown(_scheduleId);
    }

    function pause() external {
        require(accessControls.hasAdminRole(msg.sender), "Vesting.pause: Only admin");

        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        require(accessControls.hasAdminRole(msg.sender), "Vesting.unpause: Only admin");

        paused = false;
        emit Unpaused(msg.sender);
    }

    function withdraw(IERC20 _token, address _to, uint256 _amount) external {
        require(accessControls.hasAdminRole(msg.sender), "Vesting.withdraw: Only admin");
        _token.transfer(_to, _amount);
    }

    function withdrawEther(address payable _to, uint256 _amount) external {
        require(accessControls.hasAdminRole(msg.sender), "Vesting.withdrawEther: Only admin");
        _to.transfer(_amount);
    }

    function whitelistToken(address _tokenAddress) external {
        require(accessControls.hasAdminRole(msg.sender), "Vesting.whitelistToken: Only admin");
        require(address(_tokenAddress) != address(0), "Vesting.whitelistToken: Cannot be address zero");
        whitelistedTokens[_tokenAddress] = true;
    }

    function removeTokenFromWhitelist(address _tokenAddress) external {
        require(accessControls.hasAdminRole(msg.sender), "Vesting.whitelistToken: Only admin");
        whitelistedTokens[_tokenAddress] = false;
    }

    ///////////////
    // Accessors //
    ///////////////


    function vestingSchedule(uint256 _scheduleId) external view returns (
        address _token,
        address _beneficiary,
        uint256 _start,
        uint256 _end,
        uint256 _cliff,
        uint256 _amount,
        uint256 _drawDownRate
    ) {
        Schedule storage schedule = vestingSchedules[_scheduleId];

        return (
        schedule.token,
        schedule.beneficiary,
        schedule.start,
        schedule.end,
        schedule.cliff,
        schedule.amount,
        schedule.drawDownRate
        );
    }

    function activeScheduleIdsForBeneficiary(address _beneficiary) public view returns (uint256[] memory _activeScheduleIds) {
        EnumerableSet.UintSet storage activeOrFutureScheduleIds = beneficiaryVestingSchedules[_beneficiary];
        uint256 activeOrFutureScheduleIdsSetSize = activeOrFutureScheduleIds.length();

        if (activeOrFutureScheduleIdsSetSize == 0) {
            uint256[] memory tmp = new uint256[](0);
            return tmp;
        }

        uint256 activeCount;
        for(uint i = 0; i < activeOrFutureScheduleIdsSetSize; i++) {
            uint256 scheduleId = activeOrFutureScheduleIds.at(i);
            uint256 availableDrawDownAmount_ = _availableDrawDownAmount(scheduleId);

            // if there is an available amount then either an unclaimed or active schedule
            if (availableDrawDownAmount_ > 0) {
                activeCount = activeCount.add(1);
            }
        }

        // loop needed twice to allocate memory for the array
        uint256[] memory activeScheduleIds = new uint256[](activeCount);
        uint256 nextIndex;
        for(uint j = 0; j < activeOrFutureScheduleIdsSetSize; j++) {
            uint256 scheduleId = activeOrFutureScheduleIds.at(j);
            uint256 availableDrawDownAmount_ = _availableDrawDownAmount(scheduleId);

            // if there is an available amount then either an unclaimed or active schedule
            if (availableDrawDownAmount_ > 0) {
                activeScheduleIds[nextIndex] = scheduleId;
                nextIndex = nextIndex.add(1);
            }
        }

        return activeScheduleIds;
    }

    function availableDrawDownAmount(uint256 _scheduleId) external view returns (uint256 _amount) {
        return _availableDrawDownAmount(_scheduleId);
    }

    //////////////
    // Internal //
    //////////////

    function _drawDown(uint256 _scheduleId) internal {
        Schedule storage schedule = vestingSchedules[_scheduleId];
        require(schedule.amount > 0, "Vesting.drawDown: There is no schedule currently in flight");

        // available right now
        uint256 amount = _availableDrawDownAmount(_scheduleId);
        require(amount > 0, "Vesting.drawDown: Nothing to withdraw");

        // Update last drawn to now
        lastDrawnAt[_scheduleId] = _getNow();

        // Increase total drawn amount
        totalDrawn[_scheduleId] = totalDrawn[_scheduleId].add(amount);

        // Issue tokens to beneficiary
        require(
            IERC20(schedule.token).transfer(schedule.beneficiary, amount),
            "Vesting.drawDown: Unable to transfer tokens"
        );

        emit DrawDown(schedule.beneficiary, amount, _getNow());
    }

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
            return schedule.amount.sub(totalDrawn[_scheduleId]);
        }

        // Active

        // Work out when the last invocation was
        uint256 timeLastDrawnOrStart = lastDrawnAt[_scheduleId] == 0 ? schedule.start : lastDrawnAt[_scheduleId];

        // Find out how much time has past since last invocation
        uint256 timePassedSinceLastInvocation = _getNow().sub(timeLastDrawnOrStart);

        // Work out how many due tokens - time passed * rate per second
        return timePassedSinceLastInvocation.mul(schedule.drawDownRate);
    }
}
