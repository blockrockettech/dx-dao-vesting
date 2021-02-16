// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import { Vesting } from "../Vesting.sol";
import { AccessControls } from "../AccessControls.sol";

contract VestingWithFixedTime is Vesting {
    uint256 public nowOverride;

    constructor(address[] memory _whitelistedTokens,
        AccessControls _accessControls,
        uint256[] memory _experienceLevels,
        uint256[] memory _salaries
    )
    Vesting(_whitelistedTokens, _accessControls, _experienceLevels, _salaries) {}

    function setNow(uint256 _now) external {
        nowOverride = _now;
    }

    function _getNow() internal view override returns (uint256) {
        return nowOverride;
    }
}
