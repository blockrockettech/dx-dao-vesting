// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import { Vesting } from "../Vesting.sol";
import { AccessControls } from "../AccessControls.sol";

contract VestingWithFixedTime is Vesting {
    uint256 public nowOverride;

    constructor(address[] memory _whitelistedTokens, AccessControls _accessControls)
    Vesting(_whitelistedTokens, _accessControls) {}

    function setNow(uint256 _now) external {
        nowOverride = _now;
    }

    function _getNow() internal view override returns (uint256) {
        return nowOverride;
    }
}
