import chai, { expect } from 'chai'
import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { id, parseEther } from 'ethers/lib/utils'
import { ZERO_ADDRESS } from 'prepo-constants'
import { utils } from 'prepo-hardhat'
import { Contract } from 'ethers'
import { FakeContract, MockContract, smock } from '@defi-wonderland/smock'
import { withdrawHookFixture } from './fixtures/HookFixture'
import { smockDepositRecordFixture } from './fixtures/DepositRecordFixture'
import { getSignerForContract, grantAndAcceptRole, batchGrantAndAcceptRoles } from './utils'
import { smockTestERC20Fixture } from './fixtures/TestERC20Fixture'
import { fakeCollateralFixture } from './fixtures/CollateralFixture'
import { smockTokenSenderFixture } from './fixtures/TokenSenderFixture'
import { WithdrawHook } from '../typechain'

chai.use(smock.matchers)

const { getLastTimestamp, setNextTimestamp } = utils

describe('=> WithdrawHook', () => {
  let withdrawHook: WithdrawHook
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let collateral: FakeContract<Contract>
  let collateralSigner: SignerWithAddress
  let depositRecord: MockContract<Contract>
  let treasury: SignerWithAddress
  let testToken: MockContract<Contract>
  let tokenSender: FakeContract<Contract>
  const TEST_GLOBAL_DEPOSIT_CAP = parseEther('50000')
  const TEST_ACCOUNT_DEPOSIT_CAP = parseEther('50')
  const TEST_AMOUNT_BEFORE_FEE = parseEther('1.01')
  const TEST_AMOUNT_AFTER_FEE = parseEther('1')
  const TEST_GLOBAL_PERIOD_LENGTH = 20
  const TEST_USER_PERIOD_LENGTH = 10
  const TEST_GLOBAL_WITHDRAW_LIMIT = TEST_AMOUNT_BEFORE_FEE.mul(3)
  const TEST_USER_WITHDRAW_LIMIT = TEST_AMOUNT_BEFORE_FEE.mul(2)

  beforeEach(async () => {
    ;[deployer, user, treasury] = await ethers.getSigners()
    depositRecord = await smockDepositRecordFixture(
      TEST_GLOBAL_DEPOSIT_CAP,
      TEST_ACCOUNT_DEPOSIT_CAP
    )
    withdrawHook = await withdrawHookFixture()
    testToken = await smockTestERC20Fixture('Test Token', 'TEST', 18)
    collateral = await fakeCollateralFixture()
    collateral.getBaseToken.returns(testToken.address)
    collateralSigner = await getSignerForContract(collateral)
    tokenSender = await smockTokenSenderFixture(testToken.address)
    await batchGrantAndAcceptRoles(withdrawHook, deployer, deployer, [
      withdrawHook.SET_COLLATERAL_ROLE(),
      withdrawHook.SET_DEPOSIT_RECORD_ROLE(),
      withdrawHook.SET_WITHDRAWALS_ALLOWED_ROLE(),
      withdrawHook.SET_GLOBAL_PERIOD_LENGTH_ROLE(),
      withdrawHook.SET_USER_PERIOD_LENGTH_ROLE(),
      withdrawHook.SET_GLOBAL_WITHDRAW_LIMIT_PER_PERIOD_ROLE(),
      withdrawHook.SET_USER_WITHDRAW_LIMIT_PER_PERIOD_ROLE(),
      withdrawHook.SET_TREASURY_ROLE(),
      withdrawHook.SET_TOKEN_SENDER_ROLE(),
    ])
    await grantAndAcceptRole(
      depositRecord,
      deployer,
      deployer,
      await depositRecord.SET_ALLOWED_HOOK_ROLE()
    )
    await depositRecord.connect(deployer).setAllowedHook(user.address, true)
    await depositRecord.connect(deployer).setAllowedHook(withdrawHook.address, true)
  })
  describe('# hook', () => {
    /**
     * Tests below use different values for TEST_AMOUNT_BEFORE_FEE and
     * TEST_AMOUNT_AFTER_FEE to ensure TEST_AMOUNT_AFTER_FEE is ignored.
     */
    beforeEach(async () => {
      await withdrawHook.setCollateral(collateral.address)
      await withdrawHook.connect(deployer).setWithdrawalsAllowed(true)
      await withdrawHook.connect(deployer).setGlobalPeriodLength(TEST_GLOBAL_PERIOD_LENGTH)
      await withdrawHook.connect(deployer).setUserPeriodLength(TEST_USER_PERIOD_LENGTH)
      await withdrawHook
        .connect(deployer)
        .setGlobalWithdrawLimitPerPeriod(TEST_GLOBAL_WITHDRAW_LIMIT)
      await withdrawHook.connect(deployer).setUserWithdrawLimitPerPeriod(TEST_USER_WITHDRAW_LIMIT)
      await withdrawHook.connect(deployer).setDepositRecord(depositRecord.address)
      await withdrawHook.connect(deployer).setTreasury(treasury.address)
      await withdrawHook.connect(deployer).setTokenSender(tokenSender.address)
      await testToken.connect(deployer).mint(collateral.address, TEST_GLOBAL_DEPOSIT_CAP)
      await testToken.connect(deployer).mint(user.address, TEST_GLOBAL_DEPOSIT_CAP)
      await testToken
        .connect(collateralSigner)
        .approve(withdrawHook.address, ethers.constants.MaxUint256)
      tokenSender.send.returns()
    })
  describe('Testing Hypotese', ()=>{
    it('user can withdraw all money he has if he withdraw after reset time.',async()=>{
      // Global limit 3 and user limit 2
      const EXCEEDED_BEFORE_AMOUNT=parseEther('5')
      const EXCEEDED_AFTER_AMOUNT=parseEther('4')
      // first trnasaction for withdraw beforeFee 1.01 ether and afterFee 1 ether as like done test before for withdrawhook
      await withdrawHook.connect(collateralSigner).hook(user.address,TEST_AMOUNT_BEFORE_FEE,TEST_AMOUNT_AFTER_FEE)
      // this is for test work properly right or not with check adding second withdraw transaction which exceed limit will be reverted or not.
      await expect(withdrawHook.connect(collateralSigner).hook(user.address,EXCEEDED_BEFORE_AMOUNT,EXCEEDED_BEFORE_AMOUNT)).to.be.revertedWith('global withdraw limit exceeded')
      //this is the process of global and user time limit exceed.
      const previousGlobalAmountWithdrawn =
      await withdrawHook.getGlobalAmountWithdrawnThisPeriod()
      const previousResetTimestamp = await getLastTimestamp(ethers.provider)
      await setNextTimestamp(ethers.provider, previousResetTimestamp + TEST_GLOBAL_PERIOD_LENGTH+1)
      //after time period it can be seen that global limit and user limit is not working and u can withdraw exceeded amount and block others right to withdraw in this time period.
      await withdrawHook.connect(collateralSigner).hook(user.address,EXCEEDED_BEFORE_AMOUNT,EXCEEDED_BEFORE_AMOUNT)
      // due to there is only one account that withdraw money it show obviously that with this vulnarability anyboody who first withdraw in new time period can exceed user or global limit.
     expect(parseInt((await withdrawHook.getGlobalWithdrawLimitPerPeriod())._hex)).lessThan(parseInt((await withdrawHook.getGlobalAmountWithdrawnThisPeriod())._hex))
     
    })
  })})})
