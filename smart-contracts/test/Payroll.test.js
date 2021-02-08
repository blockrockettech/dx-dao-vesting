const {BN, constants, expectEvent, expectRevert, ether, balance, send} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {fromWei} = require('web3-utils');

const { expect } = require('chai');

const AccessControls = artifacts.require('AccessControls');
const MockERC20 = artifacts.require('MockERC20');
const PayrollWithFixedTime = artifacts.require('PayrollWithFixedTime');

contract('Payroll contract tests', function ([admin, dao, beneficiary, ...otherAccounts]) {

  const PERIOD_ONE_DAY_IN_SECONDS = new BN('86400')

  const to18dp = (value) => {
    return new BN(value).mul(new BN('10').pow(new BN('18')))
  }

  const experienceToSalary = {
    1: '4000',
    2: '5000',
    3: '6000',
    4: '7000',
    5: '8000'
  }

  beforeEach(async () => {
    this.accessControls = await AccessControls.new({from: admin})
    await this.accessControls.addWhitelistRole(dao, {from: admin})

    this.mockToken = await MockERC20.new()

    const experienceLevels = Object.keys(experienceToSalary)
    this.payroll = await PayrollWithFixedTime.new(
      [this.mockToken.address],
      this.accessControls.address,
      experienceLevels,
      experienceLevels.map(level => to18dp(experienceToSalary[level])),
      {from: admin}
    )
  })

  it('Can create a worker schedule based on experience level', async () => {
    // this will create schedule #0
    await this.payroll.createPayroll(
      this.mockToken.address,
      beneficiary,
      '5',
      '100',
      '0',
      '3',
      '0',
      {from: dao}
    )

    const {
      _token,
      _beneficiary,
      _start,
      _end,
      _cliff,
      _amount,
      _drawDownRate
    } = await this.payroll.vestingSchedule('0')

    const _durationInSecs = new BN('3').mul(PERIOD_ONE_DAY_IN_SECONDS);
    const _cliffDurationInSecs = new BN('0').mul(PERIOD_ONE_DAY_IN_SECONDS);

    const yearlySalary = to18dp('8000').muln(12);
    const dailyAmount = yearlySalary.divn(365);
    const fullAmountToVest = new BN('3').mul(dailyAmount);

    const amountToVest = fullAmountToVest.divn(100).muln(100);

    expect(_token).to.be.equal(this.mockToken.address)
    expect(_beneficiary).to.be.equal(beneficiary)
    expect(_start).to.be.bignumber.equal('0')
    expect(_end).to.be.bignumber.equal(_durationInSecs)
    expect(_cliff).to.be.bignumber.equal(_cliffDurationInSecs)
    expect(_amount).to.be.bignumber.equal(amountToVest)
    expect(_drawDownRate).to.be.bignumber.equal(amountToVest.div(_durationInSecs))

    await this.payroll.setNow('1')

    const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary)
    expect(activeScheduleIdsForBeneficiary.length).to.be.equal(1)
    expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0')
  })

  it('Reverts when specifying an invalid experience level', async () => {
    await expectRevert(
      this.payroll.createPayroll(
        this.mockToken.address,
        beneficiary,
        '7',
        '100',
        '0',
        '3',
        '0',
        {from: dao}
      ),
      "createPayroll: Invalid experience level"
    )
  })

  describe('Deploying', () => {
    it('Reverts when experience array is empty', async () => {
      await expectRevert(
        PayrollWithFixedTime.new(
          [this.mockToken.address],
          this.accessControls.address,
          [],
          [],
          {from: admin}
        ),
        "No experience configs supplied"
      )
    })

    it('Reverts when experience array lengths are inconsistent', async () => {
      await expectRevert(
        PayrollWithFixedTime.new(
          [this.mockToken.address],
          this.accessControls.address,
          ['1'],
          [],
          {from: admin}
        ),
        "Inconsistent experience level array lengths"
      )
    })
  })
})
