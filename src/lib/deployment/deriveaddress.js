import { ethers } from "ethers";
/**
 * Derive the address the externaly owned account last deployed a contract to.
 * Assuming that the last transaction for that address _was_ a contract
 * deployment.
 * @param {string} from account that deployed the contract
 * @param {number} nonce used for the deploy tx (which was the transaction count at the time of deploy)
 */
export async function deriveContractAddress(log, provider, from, nonce = undefined) {
  // Note: if the provider is a signer then getTransactionCount is specifically
  // bound to the signer's wallet and passing an additional address just breaks.
  provider = provider.provider ?? provider;
  if (!nonce) {
    try {

      // nonce - 1 is the nonce of the *last* transaction on the account. Note: we
      // make the assumption in this method that the EOA for contract deployment
      // is _only_ used for deployment.

      nonce = (await provider.getTransactionCount(from)) - 1;
      if (nonce < 0) {
        log(`contract not deployed, nonce is zero for ${from}`);
        return;
      }
    } catch (e) {
      log.info(`error getting nonce for ${from}: ${JSON.stringify(e)}`);
      return;
    }
  }

  for (let i = nonce; nonce > 0; nonce --) {
    const addr = ethers.utils.getContractAddress({ from, nonce: i });
    const code = await provider.getCode(addr);
    if (code != '0x') return addr;
  }
  return undefined;
}
