const {BN, constants, expectEvent, expectRevert, ether, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {fromWei} = require('web3-utils');

const { expect } = require('chai');

const AccessControls = artifacts.require('AccessControls');
const MockERC20 = artifacts.require('MockERC20');
const Vesting = artifacts.require('Vesting');
const VestingWithFixedTime = artifacts.require('VestingWithFixedTime');

contract('Vesting contract tests', function ([admin, dao, beneficiary, random, ...otherAccounts]) {
  const firstScheduleId = '0'

  const PERIOD_ONE_DAY_IN_SECONDS = new BN('86400')

  const to18dp = (value) => {
    return new BN(value).mul(new BN('10').pow(new BN('18')))
  }

  const shouldBeNumberInEtherCloseTo = (valInWei, expected) => parseFloat(fromWei(valInWei)).should.be.closeTo(parseFloat(expected.toString()), 0.000001);

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

      const activeWorkerScheduleIdsForBeneficiary = await this.vesting.activeWorkerScheduleIdsForBeneficiary(_beneficiary)
      expect(activeWorkerScheduleIdsForBeneficiary.length).to.be.equal(1)
      expect(activeWorkerScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0')
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

  describe('drawing down', () => {
    beforeEach(async () => {
      // we need to override the real vesting contract with a mock one that allows time to be moved easily
      this.vesting = await VestingWithFixedTime.new([this.mockToken.address], this.accessControls.address, {from: admin})

      // set now
      await this.vesting.setNow('1');

      // send funds to the contract
      await this.mockToken.transfer(this.vesting.address, to18dp('5'))
    })

    describe('When a single vesting schedule is set up', () => {
      beforeEach(async () => {
        this.vestedAmount = to18dp('2')

        // this will create schedule #0
        await this.vesting.createVestingSchedule(
          this.mockToken.address,
          beneficiary,
          this.vestedAmount,
          '1',
          '4',
          '0', // no cliff
          {from: dao}
        )
      })

      it('Can draw down a quarter in 1 day after start', async () => {
        const oneDayAfterStart = PERIOD_ONE_DAY_IN_SECONDS.addn(1) // add start time

        await this.vesting.setNow(oneDayAfterStart);

        const beneficiaryBalBefore = await this.mockToken.balanceOf(beneficiary)

        // draw down from schedule zero. Anyone can call but only beneficiary gets
        await this.vesting.drawDown('0')

        const beneficiaryBalAfter = await this.mockToken.balanceOf(beneficiary)

        // expect(
        //   beneficiaryBalAfter.sub(beneficiaryBalBefore)
        // ).to.be.bignumber.equal(this.vestedAmount.divn('4'))

        shouldBeNumberInEtherCloseTo(
          beneficiaryBalAfter.sub(beneficiaryBalBefore),
          fromWei(this.vestedAmount.divn('4'))
        )
      })
    })
  })
})
