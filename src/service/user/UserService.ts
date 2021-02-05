import { NotFound, BadRequest, InternalServerError } from "@tsed/exceptions";
import { UserAccount, SettBalance } from "../../interface/UserAccount";
import { getUsdValue, getUserData, getPrices } from "../../util/util";
import { Service } from "@tsed/common";
import { setts } from "../setts";

@Service()
export class UserService {

  /**
   * Retrieve a user's account details. This includes all positions in setts,
   * the individual earnings from each sett, and claimed amounts of Badger /
   * Digg per sett. 
   * 
   * @param userId User ethereum account address
   */
  async getUserDetails(userId: string): Promise<UserAccount> {
    if (!userId) {
      throw(new BadRequest('userId is required'));
    }

    // TheGraph address are all lower case, this is required
    const userData = await getUserData(userId.toLowerCase());

    if (!userData.data || !userData.data.user) {
      throw(new NotFound(`${userId} is not a protocol participant`));
    }

    const prices = await getPrices();
    const userBalances = userData.data.user.settBalances;
    const settBalances = userBalances.map(settBalance => {
      const sett = settBalance.sett;
      const settInfo = setts.find(s => s.settToken === settBalance.sett.id);

      // SettInfo should not be undefined - if so there is a config issue
      if (!settInfo) {
        throw(new InternalServerError('Unable to fetch user account'));
      }

      let ratio = 1;
      let settPricePerFullShare = parseInt(sett.pricePerFullShare) / 1e18;
      if (settInfo.symbol.toLowerCase() === 'digg') {
        ratio = sett.balance / sett.totalSupply / settPricePerFullShare;
        settPricePerFullShare = sett.balance / sett.totalSupply;
      }
      const netShareDeposit = parseInt(settBalance.netShareDeposit);
      const grossDeposit = parseInt(settBalance.grossDeposit) * ratio;
      const grossWithdraw = parseInt(settBalance.grossWithdraw) * ratio;
      const settTokens = settPricePerFullShare * netShareDeposit;
      const earned = (settTokens - grossDeposit + grossWithdraw) / Math.pow(10, sett.token.decimals);
      const balance = settTokens / Math.pow(10, sett.token.decimals);
      const earnedUsd = getUsdValue(sett.token.id, earned, prices);
      const balanceUsd = getUsdValue(sett.token.id, balance, prices);
      
      return {
        id: settInfo.settToken,
        name: settInfo.name,
        asset: settInfo.symbol,
        value: balanceUsd,
        earnedValue: earnedUsd,
      } as SettBalance;
    });

    const accountValue = settBalances.map(b => b.value).reduce((total, value) => total += value);
    const accountEarnedValue = settBalances.map(b => b.earnedValue).reduce((total, value) => total += value);
    return {
      id: userId,
      value: accountValue,
      earnedValue: accountEarnedValue,
      settAccounts: settBalances,
    } as UserAccount;
  }
}
