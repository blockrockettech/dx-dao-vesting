// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import { Vesting } from "./Vesting.sol";
import { AccessControls } from "./AccessControls.sol";

contract Payroll is Vesting {
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


}
