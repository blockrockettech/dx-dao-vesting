const {BN, constants, expectEvent, expectRevert, ether, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const { expect } = require('chai');

const AccessControls = artifacts.require('AccessControls');
const MockERC20 = artifacts.require('MockERC20');
const Vesting = artifacts.require('Vesting');

contract('Vesting contract tests', function ([admin, dao, beneficiary, random, ...otherAccounts]) {
  const firstScheduleId = '0'

  const PERIOD_ONE_DAY_IN_SECONDS = new BN('86400')

  beforeEach(async () => {
    this.accessControls = await AccessControls.new({from: admin})
    await this.accessControls.addWhitelistRole(dao, {from: admin})

    this.mockToken = await MockERC20.new()

    this.vesting = await Vesting.new([this.mockToken.address], this.accessControls.address, {from: admin})
  })

  it('Has deployed the vesting contract correctly', async () => {
    expect(await this.vesting.whitelistedTokens(this.mockToken.address)).to.be.true
    expect(await this.vesting.accessControls()).to.be.equal(this.accessControls.address)
  })

  describe('createVestingSchedule()', () => {
    it('Can successfully create a schedule with valid params', async () => {
      // this will create schedule ID #0
      await this.vesting.createVestingSchedule(
        this.mockToken.address,
        beneficiary,
        '5',
        '0',
        '3',
        '1',
        {from: dao}
      )

      const {
        _token,
        _beneficiary,
        _start,
        _end,
        _cliff,
        _amount,
        _totalDrawn,
        _lastDrawnAt,
        _drawDownRate,
        _remainingBalance
      } = await this.vesting.workerVestingSchedule(firstScheduleId)

      const _durationInSecs = new BN('3').mul(PERIOD_ONE_DAY_IN_SECONDS);
      const _cliffDurationInSecs = new BN('1').mul(PERIOD_ONE_DAY_IN_SECONDS);

      expect(_token).to.be.equal(this.mockToken.address)
      expect(_beneficiary).to.be.equal(_beneficiary)
      expect(_start).to.be.bignumber.equal('0')
      expect(_end).to.be.bignumber.equal(_durationInSecs)
      expect(_cliff).to.be.bignumber.equal(_cliffDurationInSecs)
      expect(_amount).to.be.bignumber.equal('5')
      expect(_totalDrawn).to.be.bignumber.equal('0')
      expect(_lastDrawnAt).to.be.bignumber.equal('0')
      expect(_drawDownRate).to.be.bignumber.equal(new BN('5').div(_durationInSecs))
      expect(_remainingBalance).to.be.bignumber.equal(new BN('5'))
    })

    it('Reverts when sender does not have whitelist', async () => {
      await expectRevert(
        this.vesting.createVestingSchedule(
          this.mockToken.address,
          beneficiary,
          '5',
          '0',
          '3',
          '1',
          {from: random}
        ),
        "VestingContract.createVestingSchedule: Only whitelist"
      )
    })

    it('Reverts when token is not whitelisted', async () => {
      await expectRevert(
        this.vesting.createVestingSchedule(
          random,
          beneficiary,
          '5',
          '0',
          '3',
          '1',
          {from: dao}
        ),
        "VestingContract.createVestingSchedule: token not whitelisted"
      )
    })

    it('Reverts when beneficiary is address zero', async () => {
      await expectRevert(
        this.vesting.createVestingSchedule(
          this.mockToken.address,
          ZERO_ADDRESS,
          '5',
          '0',
          '3',
          '1',
          {from: dao}
        ),
        "VestingContract.createVestingSchedule: Beneficiary cannot be empty"
      )
    })

    it('Reverts when amount is zero', async () => {
      await expectRevert(
        this.vesting.createVestingSchedule(
          this.mockToken.address,
          beneficiary,
          '0',
          '0',
          '3',
          '1',
          {from: dao}
        ),
        "VestingContract.createVestingSchedule: Amount cannot be empty"
      )
    })

    it('Reverts when duration is zero', async () => {
      await expectRevert(
        this.vesting.createVestingSchedule(
          this.mockToken.address,
          beneficiary,
          '5',
          '0',
          '0',
          '1',
          {from: dao}
        ),
        "VestingContract.createVestingSchedule: Duration cannot be empty"
      )
    })

    it('Reverts when cliff is bigger than duration', async () => {
      await expectRevert(
        this.vesting.createVestingSchedule(
          this.mockToken.address,
          beneficiary,
          '5',
          '0',
          '3',
          '4',
          {from: dao}
        ),
        "VestingContract.createVestingSchedule: Cliff can not be bigger than duration"
      )
    })
  })
})
