// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20("MockERC20", "MCK") {

    uint256 public constant INITIAL_SUPPLY = 50000;

    constructor() {
        _mint(msg.sender, INITIAL_SUPPLY * (10 ** uint256(decimals())));
    }
}
