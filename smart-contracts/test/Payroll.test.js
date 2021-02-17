const {BN, constants, expectEvent, expectRevert, ether, balance, send} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {fromWei} = require('web3-utils');

const {expect} = require('chai');

const AccessControls = artifacts.require('AccessControls');
const MockERC20 = artifacts.require('MockERC20');
const Payroll = artifacts.require('Payroll');
const PayrollWithFixedTime = artifacts.require('PayrollWithFixedTime');

contract('Payroll contract tests', function ([admin, admin2, dao, beneficiary, random, ...otherAccounts]) {
  const firstScheduleId = '0';

  const PERIOD_ONE_DAY_IN_SECONDS = new BN('86400');

  const to18dp = (value) => {
    return new BN(value).mul(new BN('10').pow(new BN('18')));
  };

  const shouldBeNumberInEtherCloseTo = (valInWei, expected) => {
    return expect(
      parseFloat(fromWei(valInWei))
    ).to.be.closeTo(parseFloat(expected.toString()), 0.000001);
  };

  const experienceToSalary = {
    1: '4000',
    2: '5000',
    3: '6000',
    4: '7000',
    5: '8000'
  };

  const experienceLevels = Object.keys(experienceToSalary);
  const salaries = experienceLevels.map(level => to18dp(experienceToSalary[level]));

  beforeEach(async () => {
    this.accessControls = await AccessControls.new({from: admin});
    await this.accessControls.addWhitelistRole(dao, {from: admin});

    this.mockToken = await MockERC20.new();
    this.mockDxdToken = await MockERC20.new();

    this.payroll = await PayrollWithFixedTime.new(
      [this.mockDxdToken.address, this.mockToken.address],
      this.accessControls.address,
      experienceLevels,
      salaries,
      {from: admin}
    );

    this.durationInDays = await this.payroll.durationInDays();
    this.cliffDurationInDays = await this.payroll.cliffDurationInDays();
  });

  describe('Deployments', () => {
    it('Has deployed the vesting contract correctly', async () => {
      expect(await this.payroll.whitelistedTokens(this.mockToken.address)).to.be.true;
      expect(await this.payroll.accessControls()).to.be.equal(this.accessControls.address);
    });

    it('Reverts when whitelist token array is empty', async () => {
      await expectRevert(
        Payroll.new(
          [],
          this.accessControls.address,
          experienceLevels,
          salaries,
          {from: admin}
        ),
        "At least 1 token must be whitelisted"
      );
    });

    it('Reverts when a whitelist token is address zero', async () => {
      await expectRevert(
        Payroll.new(
          [ZERO_ADDRESS],
          this.accessControls.address,
          experienceLevels,
          salaries, {from: admin}
        ),
        "Supplied address cannot be the zero address"
      );
    });
  });

  describe('createPayrollWithDefaults()', () => {
    it('Can successfully create a schedule with valid params', async () => {

      // this will create schedule ID #0
      const amount = to18dp('5');
      await this.payroll.createPayrollWithDefaults(
        this.mockToken.address,
        beneficiary,
        amount,
        '0',
        {from: dao}
      );

      const {
        _token,
        _beneficiary,
        _start,
        _end,
        _cliff,
        _amount,
        _drawDownRate
      } = await this.payroll.vestingSchedule(firstScheduleId);

      const _durationInSecs = this.durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
      const _cliffDurationInSecs = this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);

      expect(_token).to.be.equal(this.mockToken.address);
      expect(_beneficiary).to.be.equal(beneficiary);
      expect(_start).to.be.bignumber.equal('0');
      expect(_end).to.be.bignumber.equal(_durationInSecs);
      expect(_cliff).to.be.bignumber.equal(_cliffDurationInSecs);
      expect(_amount).to.be.bignumber.equal(amount);
      expect(_drawDownRate).to.be.bignumber.equal(amount.div(_durationInSecs));

      await this.payroll.setNow(_cliffDurationInSecs.addn(1));

      const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(_beneficiary);
      expect(activeScheduleIdsForBeneficiary.length).to.be.equal(1);
      expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0');
    });

    it('Reverts when sender does not have whitelist', async () => {
      await expectRevert(
        this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          '5',
          '0',
          {from: random}
        ),
        "Vesting.createVestingSchedule: Only whitelist"
      );
    });

    it('Reverts when token is not whitelisted', async () => {
      await expectRevert(
        this.payroll.createPayrollWithDefaults(
          random,
          beneficiary,
          '5',
          '0',
          {from: dao}
        ),
        "Vesting.createVestingSchedule: token not whitelisted"
      );
    });

    it('Reverts when beneficiary is address zero', async () => {
      await expectRevert(
        this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          ZERO_ADDRESS,
          '5',
          '0',
          {from: dao}
        ),
        "Vesting.createVestingSchedule: Beneficiary cannot be empty"
      );
    });

    it('Reverts when amount is zero', async () => {
      await expectRevert(
        this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          '0',
          '0',
          {from: dao}
        ),
        "Vesting.createVestingSchedule: Amount cannot be empty"
      );
    });

    it.skip('Reverts when duration is zero', async () => {
      await expectRevert(
        this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          '5',
          '0',
          {from: dao}
        ),
        "Vesting.createVestingSchedule: Duration cannot be empty"
      );
    });

    it.skip('Reverts when cliff is bigger than duration', async () => {
      await expectRevert(
        this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          '5',
          '0',
          {from: dao}
        ),
        "Vesting.createVestingSchedule: Cliff can not be bigger than duration"
      );
    });
  });

  describe('createVestingScheduleWithDefaults()', () => {
    it('When using method, creates vesting schedule with default length and cliff', async () => {
      await this.payroll.createPayrollWithDefaults(
        this.mockToken.address,
        beneficiary,
        to18dp('50'),
        '0',
        {from: dao}
      );

      const {
        _token,
        _beneficiary,
        _start,
        _end,
        _cliff,
        _amount,
        _drawDownRate
      } = await this.payroll.vestingSchedule(firstScheduleId);

      const _durationInSecs = new BN('730').mul(PERIOD_ONE_DAY_IN_SECONDS);
      const _cliffDurationInSecs = new BN('365').mul(PERIOD_ONE_DAY_IN_SECONDS);

      expect(_token).to.be.equal(this.mockToken.address);
      expect(_beneficiary).to.be.equal(beneficiary);
      expect(_start).to.be.bignumber.equal('0');
      expect(_end).to.be.bignumber.equal(_durationInSecs);
      expect(_cliff).to.be.bignumber.equal(_cliffDurationInSecs);
      expect(_amount).to.be.bignumber.equal(to18dp('50'));
      expect(_drawDownRate).to.be.bignumber.equal(to18dp('50').div(_durationInSecs));

      await this.payroll.setNow(_cliffDurationInSecs.addn(1));

      const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(_beneficiary);
      expect(activeScheduleIdsForBeneficiary.length).to.be.equal(1);
      expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0');
    });
  });

  describe('drawing down', () => {
    beforeEach(async () => {
      // we need to override the real vesting contract with a mock one that allows time to be moved easily
      this.payroll = await PayrollWithFixedTime.new(
        [this.mockToken.address],
        this.accessControls.address,
        experienceLevels,
        salaries,
        {from: admin}
      );

      // set now
      await this.payroll.setNow('1');

      // send funds to the contract
      await this.mockToken.transfer(this.payroll.address, to18dp('20000'));
    });

    describe('Validation', () => {
      it('Reverts when drawing down a schedule that does not exist', async () => {
        await expectRevert(
          this.payroll.drawDown('99'),
          "invalid opcode"
        );
      });
    });

    describe('When paused', () => {
      beforeEach(async () => {
        this.vestedAmount = to18dp('2');

        // this will create schedule #0
        await this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          this.vestedAmount,
          '0',
          {from: dao}
        );

        await this.payroll.pause({from: admin});
      });

      it('Cannot draw down', async () => {
        await expectRevert(
          this.payroll.drawDown('0'),
          "Vesting: Method cannot be invoked as contract has been paused"
        );
      });

      it.skip('Can draw down once unpaused', async () => {
        await this.payroll.unpause({from: admin});

        await this.payroll.setNow(this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS).addn(1));

        const beneficiaryBalBefore = await this.mockToken.balanceOf(beneficiary);

        // draw down from schedule zero. Anyone can call but only beneficiary gets
        await this.payroll.drawDown('0');

        const beneficiaryBalAfter = await this.mockToken.balanceOf(beneficiary);

        shouldBeNumberInEtherCloseTo(
          beneficiaryBalAfter.sub(beneficiaryBalBefore),
          fromWei(this.vestedAmount.divn('4'))
        );
      });
    });

    describe('When a single vesting schedule is set up (no cliff)', () => {
      beforeEach(async () => {
        this.vestedAmount = to18dp('2');

        // this will create schedule #0
        await this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          this.vestedAmount,
          '0', // start
          {from: dao}
        );
      });

      it('Can draw down after cliff', async () => {

        await this.payroll.setNow(this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS).addn(1));

        const beneficiaryBalBefore = await this.mockToken.balanceOf(beneficiary);

        // draw down from schedule zero. Anyone can call but only beneficiary gets
        await this.payroll.drawDown('0');

        const beneficiaryBalAfter = await this.mockToken.balanceOf(beneficiary);

        // shouldBeNumberInEtherCloseTo(
        //   beneficiaryBalAfter.sub(beneficiaryBalBefore),
        //   fromWei(this.vestedAmount.divn('4'))
        // );

        expect(beneficiaryBalAfter).to.be.bignumber.gt('0');

        // check that you can't withdraw again
        await expectRevert(
          this.payroll.drawDown('0'),
          "Vesting.drawDown: Nothing to withdraw"
        );
      });
    });

    describe.only('When multiple vesting schedules are setup (no cliff)', () => {
      beforeEach(async () => {
        this.vestedAmount = to18dp('5000');

        // this will create schedule #0 and add to the list of active schedules
        await this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          this.vestedAmount,
          '0', // start
          {from: dao}
        );

        // this will create schedule #1 and add to the list of active schedules
        await this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          this.vestedAmount,
          this.durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS), // start
          {from: dao}
        );

        // this will create schedule #2 and add to the list of active schedules
        await this.payroll.createPayrollWithDefaults(
          this.mockToken.address,
          beneficiary,
          this.vestedAmount,
          this.durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS).muln(2), // start
          {from: dao}
        );
      });

      describe('When first schedule only is active', () => {
        beforeEach(async () => {
          // set now to start at the same time as first cliff
          await this.payroll.setNow(this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS).addn(1));
        });

        it('Correctly returns only schedule #0 for list of active schedule IDs', async () => {
          const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary);
          expect(activeScheduleIdsForBeneficiary.length).to.be.equal(1);
          expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0');
        });
      });

      describe('When 1st and 2nd schedule only active', () => {
        beforeEach(async () => {
          // set now to start
          const cliff = this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
          await this.payroll.setNow(
            this.durationInDays
              .mul(PERIOD_ONE_DAY_IN_SECONDS)
              .add(cliff)
              .addn(1));
        });

        it('Correctly returns only schedule #0 and #1 for list of active schedule IDs', async () => {
          const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary);
          expect(activeScheduleIdsForBeneficiary.length).to.be.equal(2);
          expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0');
          expect(activeScheduleIdsForBeneficiary[1]).to.be.bignumber.equal('1');
        });

        it('Returns #1 after #0 is fully drawn down', async () => {
          await this.payroll.drawDown('0');

          const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary);
          expect(activeScheduleIdsForBeneficiary.length).to.be.equal(1);
          expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('1');
        });
      });

      describe('When 1st, 2nd and 3rd schedule only active', () => {
        beforeEach(async () => {
          const duration =  this.durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
          const cliff = this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
          await this.payroll.setNow(duration.add(duration).add(cliff).addn(1));
        });

        it('Correctly returns only schedule #0, #1 and #2 for list of active schedule IDs', async () => {
          const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary);
          expect(activeScheduleIdsForBeneficiary.length).to.be.equal(3);
          expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0');
          expect(activeScheduleIdsForBeneficiary[1]).to.be.bignumber.equal('1');
          expect(activeScheduleIdsForBeneficiary[2]).to.be.bignumber.equal('2');
        });

        it('Returns #2 after #0 and #1 are fully drawn down', async () => {
          await this.payroll.drawDownAll({from: beneficiary});

          // available draw down amount is zero so need to move the time forward or activeScheduleIdsForBeneficiary will return an empty array
          expect(await this.payroll.availableDrawDownAmount('2')).to.be.bignumber.equal('0');

          const duration =  this.durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
          const cliff = this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
          await this.payroll.setNow(duration.add(duration).add(cliff).addn(2));

          const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary);
          expect(activeScheduleIdsForBeneficiary.length).to.be.equal(1);
          expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('2');
        });
      });
    });

  });

  describe('withdraw()', () => {
    beforeEach(async () => {
      await this.mockToken.transfer(this.payroll.address, to18dp('5000'));
    });

    it('can withdraw excess tokens as admin', async () => {
      const adminBalBefore = await this.mockToken.balanceOf(admin);

      const withdrawAmt = to18dp('1000');
      await this.payroll.withdraw(this.mockToken.address, admin, withdrawAmt);

      const adminBalAfter = await this.mockToken.balanceOf(admin);

      expect(
        adminBalAfter.sub(adminBalBefore)
      ).to.be.bignumber.equal(withdrawAmt);
    });

    it('Reverts if not admin', async () => {
      await expectRevert(
        this.payroll.withdraw(this.mockToken.address, admin, '9', {from: random}),
        "Vesting.withdraw: Only admin"
      );
    });
  });

  describe('withdrawEther()', () => {
    beforeEach(async () => {
      await send.ether(admin, this.payroll.address, ether('0.25'));
    });

    it('can withdraw any ether as admin', async () => {
      const balanceTrackerAdmin = await balance.tracker(admin2);

      const withdrawAmt = ether('0.125');
      await this.payroll.withdrawEther(admin2, withdrawAmt, {from: admin});

      expect(await balanceTrackerAdmin.delta()).to.be.bignumber.equal(withdrawAmt);
    });

    it('Reverts if not admin', async () => {
      await expectRevert(
        this.payroll.withdrawEther(admin, '9', {from: random}),
        "Vesting.withdrawEther: Only admin"
      );
    });
  });

  describe('whitelistToken()', () => {
    it('Can whitelist a token', async () => {
      expect(await this.payroll.whitelistedTokens(random)).to.be.false;

      await this.payroll.whitelistToken(random, {from: admin});

      expect(await this.payroll.whitelistedTokens(random)).to.be.true;
    });

    it('Reverts if not admin', async () => {
      await expectRevert(
        this.payroll.whitelistToken(random, {from: random}),
        "Vesting.whitelistToken: Only admin"
      );
    });

    it('Reverts if token address is address zero', async () => {
      await expectRevert(
        this.payroll.whitelistToken(ZERO_ADDRESS, {from: admin}),
        "Vesting.whitelistToken: Cannot be address zero"
      );
    });
  });

  describe('removeTokenFromWhitelist()', () => {
    it('Can remove a token', async () => {
      expect(await this.payroll.whitelistedTokens(this.mockToken.address)).to.be.true;

      await this.payroll.removeTokenFromWhitelist(this.mockToken.address, {from: admin});

      expect(await this.payroll.whitelistedTokens(this.mockToken.address)).to.be.false;
    });

    it('Reverts if not admin', async () => {
      await expectRevert(
        this.payroll.removeTokenFromWhitelist(random, {from: random}),
        "Vesting.removeTokenFromWhitelist: Only admin"
      );
    });
  });

  describe('setDurationAndCliffInDays()', () => {
    it('Can set duration and cliff', async () => {

      await this.payroll.setDurationAndCliffInDays(600, 300, {from: admin});

      expect(await this.payroll.durationInDays()).to.be.bignumber.equal('600');
      expect(await this.payroll.cliffDurationInDays()).to.be.bignumber.equal('300');
    });

    it('Reverts if not admin', async () => {
      await expectRevert(
        this.payroll.setDurationAndCliffInDays(1, 1, {from: random}),
        "Vesting.setDurationAndCliffInDays: Only admin"
      );
    });
  });

  describe('activeScheduleIdsForBeneficiary()', () => {
    it('Returns an empty array when no schedules exist for an account', async () => {
      const ids = await this.payroll.activeScheduleIdsForBeneficiary(random);
      expect(ids.length).to.be.equal(0);
    });
  });

  describe('pause()', () => {
    it('Reverts when trying to pause without the admin role', async () => {
      await expectRevert(
        this.payroll.pause({from: random}),
        "Vesting.pause: Only admin"
      );
    });
  });

  describe('unpause()', () => {
    it('Reverts when trying to pause without the admin role', async () => {
      await expectRevert(
        this.payroll.unpause({from: random}),
        "Vesting.unpause: Only admin"
      );
    });
  });

  it('Can create a worker schedule based on experience level', async () => {

    // this will create schedule #0
    await this.payroll.createPayrollAndDxd(
      this.mockToken.address,
      beneficiary,
      '5',
      '100',
      '0',
      to18dp('1000'),
      {from: dao}
    );

    const {
      _token,
      _beneficiary,
      _start,
      _end,
      _cliff,
      _amount,
      _drawDownRate
    } = await this.payroll.vestingSchedule('0');

    const _durationInSecs = this.durationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);
    const _cliffDurationInSecs = this.cliffDurationInDays.mul(PERIOD_ONE_DAY_IN_SECONDS);

    const yearlySalary = to18dp('8000').muln(12);
    const dailyAmount = yearlySalary.divn(365);
    const fullAmountToVest = this.durationInDays.mul(dailyAmount);

    const amountToVest = fullAmountToVest.divn(100).muln(100);

    expect(_token).to.be.equal(this.mockToken.address);
    expect(_beneficiary).to.be.equal(beneficiary);
    expect(_start).to.be.bignumber.equal('0');
    expect(_end).to.be.bignumber.equal(_durationInSecs);
    expect(_cliff).to.be.bignumber.equal(_cliffDurationInSecs);
    expect(_amount).to.be.bignumber.equal(amountToVest);
    expect(_drawDownRate).to.be.bignumber.equal(amountToVest.div(_durationInSecs));

    await this.payroll.setNow(_cliffDurationInSecs.addn(1));

    const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary);
    expect(activeScheduleIdsForBeneficiary.length).to.be.equal(2);
  });

  it('Can create a worker schedule and DXD schedule based on experience level', async () => {

    // this will create schedule #0 and #1
    await this.payroll.createPayrollAndDxd(
      this.mockToken.address,
      beneficiary,
      '5',
      '100',
      '0',
      to18dp('1000'),
      {from: dao}
    );

    const scheduleErc20 = await this.payroll.vestingSchedule('0');

    const _durationInSecs = new BN('730').mul(PERIOD_ONE_DAY_IN_SECONDS);
    const _cliffDurationInSecs = new BN('365').mul(PERIOD_ONE_DAY_IN_SECONDS);

    const yearlySalary = to18dp('8000').muln(12);
    const dailyAmount = yearlySalary.divn(365);
    const fullAmountToVest = new BN('730').mul(dailyAmount);

    const amountToVest = fullAmountToVest.divn(100).muln(100);

    expect(scheduleErc20._token).to.be.equal(this.mockToken.address);
    expect(scheduleErc20._beneficiary).to.be.equal(beneficiary);
    expect(scheduleErc20._start).to.be.bignumber.equal('0');
    expect(scheduleErc20._end).to.be.bignumber.equal(_durationInSecs);
    expect(scheduleErc20._cliff).to.be.bignumber.equal(_cliffDurationInSecs);
    expect(scheduleErc20._amount).to.be.bignumber.equal(amountToVest);
    expect(scheduleErc20._drawDownRate).to.be.bignumber.equal(amountToVest.div(_durationInSecs));

    await this.payroll.setNow(_cliffDurationInSecs.addn(1));

    const amountToVestDxd = to18dp('1000');

    const scheduleDxd = await this.payroll.vestingSchedule('1');
    expect(scheduleDxd._token).to.be.equal(this.mockDxdToken.address);
    expect(scheduleDxd._beneficiary).to.be.equal(beneficiary);
    expect(scheduleDxd._start).to.be.bignumber.equal('0');
    expect(scheduleDxd._end).to.be.bignumber.equal(_durationInSecs);
    expect(scheduleDxd._cliff).to.be.bignumber.equal(_cliffDurationInSecs);
    expect(scheduleDxd._amount).to.be.bignumber.equal(amountToVestDxd);
    expect(scheduleDxd._drawDownRate).to.be.bignumber.equal(amountToVestDxd.div(_durationInSecs));

    const activeScheduleIdsForBeneficiary = await this.payroll.activeScheduleIdsForBeneficiary(beneficiary);
    expect(activeScheduleIdsForBeneficiary.length).to.be.equal(2);
    expect(activeScheduleIdsForBeneficiary[0]).to.be.bignumber.equal('0');
    expect(activeScheduleIdsForBeneficiary[1]).to.be.bignumber.equal('1');
  });

  it('Reverts when specifying an invalid experience level', async () => {
    await expectRevert(
      this.payroll.createPayrollAndDxd(
        this.mockToken.address,
        beneficiary,
        '7',
        '100',
        '0',
        '3',
        {from: dao}
      ),
      "createPayroll: Invalid experience level"
    );
  });

  it('Reverts when specifying an invalid experience level with DXD', async () => {
    await expectRevert(
      this.payroll.createPayrollAndDxd(
        this.mockToken.address,
        beneficiary,
        '7',
        '100',
        '0',
        to18dp('1000'),
        {from: dao}
      ),
      "createPayroll: Invalid experience level"
    );
  });

  it('Can update the salary of a worker ', async () => {
    const levelBeingUpdated = '5';

    const existingSalary = await this.payroll.workerExperienceLevelToSalary(levelBeingUpdated);
    expect(existingSalary).to.be.bignumber.equal(to18dp(experienceToSalary[levelBeingUpdated]));

    const newSalary = to18dp('500');
    await this.payroll.updateWorkerExperienceLevelSalary(levelBeingUpdated, newSalary);

    const updatedSalary = await this.payroll.workerExperienceLevelToSalary(levelBeingUpdated);
    expect(updatedSalary).to.be.bignumber.equal(newSalary);
  });

  it('Reverts when updating salary as non admin', async () => {
    await expectRevert(
      this.payroll.updateWorkerExperienceLevelSalary('5', '5', {from: beneficiary}),
      "Payroll.updateWorkerExperienceLevelSalary: Only admin"
    );
  });

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
      );
    });

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
      );
    });
  });
});
