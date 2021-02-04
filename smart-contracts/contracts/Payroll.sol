// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import { Vesting } from "./Vesting.sol";
import { AccessControls } from "./AccessControls.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

contract Payroll is Vesting {
    using SafeMath for uint256;

    mapping(uint256 => uint256) public workerExperienceLevelToSalary;

    constructor(
        address[] memory _whitelistedTokens,
        AccessControls _accessControls,
        uint256[] memory _experienceLevels,
        uint256[] memory _salaries
    ) Vesting(_whitelistedTokens, _accessControls) {
        require(_experienceLevels.length > 0, "No experience configs supplied");
        require(_salaries.length == _experienceLevels.length, "Inconsistent experience level array lengths");

        for(uint i = 0; i < _salaries.length; i++) {
            workerExperienceLevelToSalary[_experienceLevels[i]] = _salaries[i];
        }
    }

    function createPayroll(
        address _token,
        address _beneficiary,
        uint256 _experienceLevel,
        uint256 _percentageWorked,
        uint256 _start,
        uint256 _durationInDays,
        uint256 _cliffDurationInDays
    ) external {
        uint256 monthlySalary = workerExperienceLevelToSalary[_experienceLevel];
        require(monthlySalary > 0, "createPayroll: Invalid experience level");

        uint256 yearlySalary = monthlySalary.mul(12);
        uint256 dailyAmount = yearlySalary.div(365);
        uint256 fullAmountToVest = _durationInDays.mul(dailyAmount);

        uint256 amountToVest = fullAmountToVest.div(100).mul(_percentageWorked);

        createVestingSchedule(
            _token,
            _beneficiary,
            amountToVest,
            _start,
            _durationInDays,
            _cliffDurationInDays
        );
    }
}
