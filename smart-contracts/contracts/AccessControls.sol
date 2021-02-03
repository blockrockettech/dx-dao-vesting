// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract AccessControls is AccessControl {
    // Role definitions
    bytes32 public constant WHITELISTED_ROLE = keccak256("WHITELISTED_ROLE");

    // Events
    event AdminRoleGranted(
        address indexed beneficiary,
        address indexed caller
    );

    event AdminRoleRemoved(
        address indexed beneficiary,
        address indexed caller
    );

    event WhitelistRoleGranted(
        address indexed beneficiary,
        address indexed caller
    );

    event WhitelistRoleRemoved(
        address indexed beneficiary,
        address indexed caller
    );

    modifier onlyAdminRole() {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "AccessControls: sender must be an admin");
        _;
    }

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /////////////
    // Lookups //
    /////////////

    function hasAdminRole(address _address) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function hasWhitelistRole(address _address) external view returns (bool) {
        return hasRole(WHITELISTED_ROLE, _address);
    }

    ///////////////
    // Modifiers //
    ///////////////

    function addAdminRole(address _address) external onlyAdminRole {
        _setupRole(DEFAULT_ADMIN_ROLE, _address);
        emit AdminRoleGranted(_address, _msgSender());
    }

    function removeAdminRole(address _address) external onlyAdminRole {
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
        emit AdminRoleRemoved(_address, _msgSender());
    }

    function addWhitelistRole(address _address) external onlyAdminRole {
        _setupRole(WHITELISTED_ROLE, _address);
        emit WhitelistRoleGranted(_address, _msgSender());
    }

    function removeWhitelistRole(address _address) external onlyAdminRole {
        revokeRole(WHITELISTED_ROLE, _address);
        emit WhitelistRoleRemoved(_address, _msgSender());
    }
}
