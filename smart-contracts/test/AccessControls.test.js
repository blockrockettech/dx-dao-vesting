const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;

const { expect } = require('chai');

const AccessControls = artifacts.require('AccessControls')

contract('AccessControls Contract tests', function ([deployer, roleRecipient, ...otherAccounts]) {
  beforeEach(async () => {
    this.accessControls = await AccessControls.new({from: deployer})
  })

  describe('addAdminRole()', () => {
    it('Grants admin role from an admin account', async () => {
      const { receipt } = await this.accessControls.addAdminRole(roleRecipient, {from: deployer})
      await expectEvent(receipt, 'AdminRoleGranted', {
        beneficiary: roleRecipient,
        caller: deployer
      })

      expect(await this.accessControls.hasAdminRole(roleRecipient)).to.be.true
    })

    it('Reverts when not admin', async () => {
      await expectRevert(
        this.accessControls.addAdminRole(roleRecipient, {from: roleRecipient}),
        "AccessControls: sender must be an admin"
      )
    })
  })

  describe('removeAdminRole()', () => {
    it('Revokes admin role from a sender admin account', async () => {
      await this.accessControls.addAdminRole(roleRecipient, {from: deployer})
      expect(await this.accessControls.hasAdminRole(roleRecipient)).to.be.true

      const { receipt } = await this.accessControls.removeAdminRole(roleRecipient, {from: deployer})
      await expectEvent(receipt, 'AdminRoleRemoved', {
        beneficiary: roleRecipient,
        caller: deployer
      })

      expect(await this.accessControls.hasAdminRole(roleRecipient)).to.be.false
    })

    it('Reverts when not admin', async () => {
      await expectRevert(
        this.accessControls.removeAdminRole(roleRecipient, {from: roleRecipient}),
        "AccessControls: sender must be an admin"
      )
    })
  })

  describe('addWhitelistRole()', () => {
    it('Grants whitelist role from an admin account', async () => {
      const { receipt } = await this.accessControls.addWhitelistRole(roleRecipient, {from: deployer})
      await expectEvent(receipt, 'WhitelistRoleGranted', {
        beneficiary: roleRecipient,
        caller: deployer
      })

      expect(await this.accessControls.hasWhitelistRole(roleRecipient)).to.be.true
    })

    it('Reverts when not admin', async () => {
      await expectRevert(
        this.accessControls.addWhitelistRole(roleRecipient, {from: roleRecipient}),
        "AccessControls: sender must be an admin"
      )
    })
  })

  describe('removeWhitelistRole()', () => {
    it('Revokes admin role from a sender admin account', async () => {
      await this.accessControls.addWhitelistRole(roleRecipient, {from: deployer})
      expect(await this.accessControls.hasWhitelistRole(roleRecipient)).to.be.true

      const { receipt } = await this.accessControls.removeWhitelistRole(roleRecipient, {from: deployer})
      await expectEvent(receipt, 'WhitelistRoleRemoved', {
        beneficiary: roleRecipient,
        caller: deployer
      })

      expect(await this.accessControls.hasWhitelistRole(roleRecipient)).to.be.false
    })

    it('Reverts when not admin', async () => {
      await expectRevert(
        this.accessControls.removeWhitelistRole(roleRecipient, {from: roleRecipient}),
        "AccessControls: sender must be an admin"
      )
    })
  })
})
