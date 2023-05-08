import { ethers } from "ethers";
import { allNonZeroGas } from "./gas.js";

/**
 * GasLimiter provides a reliable estimation mechanism for L2 GasLimit
 *
 */
export class GasLimiter {
  /** defaultGasLimit
   * To obtain a reliable estimate for gasLimit we need to put an actual gas
   * limit in the serialised transaction for estimateGas. It needs to be enough
   * to permit the transaction to be estimated by the local node. The literal
   * value impacts the cost because the serialised transaction data gas is
   * priced as a function of zero and non zero bytes. The later being the more
   * expensive.
   *
   * This default is 21000. Which is typical of transactions which transfer
   * value but have no calldata
   *
   *  + a bit to make all the bytes in the resulting value
   * non zero. . This ensures that the returned estimate is big enough to cover
   * the cost of the gasLimit we obtain regardless of how many non zero bytes
   * its value has.
   *
   * To adjust gasLimits for calldata, consider *adding* the result of
   * allNonZeroGas(calldata)
   */
  static defaultGasLimit = ethers.BigNumber.from("0x5218");

  constructor(provider, oracle) {
    this.provider = provider;
    this.oracle = oracle;
  }

  /**
   * Full Optimism fee discovery
   * (the other methods on this class are not optimism specific)
   * @param {ethers.TransactionRequest} tx - typically obtained from serialize or populateAndEstimate
   */
  async estimateOpFees(tx) {
    return {
      estTotalCost: await this.provider.estimateTotalGasCost(tx),
      estL1Cost: await this.provider.estimateL1GasCost(tx),
      estL2Cost: await this.provider.estimateL2GasCost(tx),
      estL1Gas: await this.provider.estimateL1Gas(tx),
      // If tx came from populateAndEstimate this is genuinely the correct value
      // to use, otherwise, it is whatever the caller sais it is
      estL2Gas: tx.gasLimit,
    };
  }

  /**
   * Convert the results of estimateOpFees to javascript Number's
   * @param {*} fees
   * @returns
   */
  feesAsNumbers(fees) {
    return {
      estTotalCost: fees.estTotalCost.toNumber(),
      estL1Cost: fees.estL1Cost.toNumber(),
      estL2Cost: fees.estL2Cost.toNumber(),
      estL1Gas: fees.estL1Gas.toNumber(),
      estL2Gas: fees.estL2Gas?.toNumber(),
    };
  }

  /**
   * Note: see serialize for most of the details
   * @param {ethers.AddressLike} from
   * @param {ethers.AddressLike} to
   * @param {ethers.BigNumber} value
   * @param {ethers.DataHexStringOrArrayish} data
   * @param {object} opts
   * @returns
   */
  async estimateGas(from, to, value, data, opts = {}) {
    return (await this.populateAndEstimate(from, to, value, data, opts))
      .gasLimit;
  }

  /**
   *
   * Note: see serialize for most of the details
   * @param {ethers.AddressLike} from
   * @param {ethers.AddressLike} to
   * @param {ethers.BigNumber} value
   * @param {ethers.DataHexStringOrArrayish} data
   * @param {object} opts
   * @returns
   */
  async populateAndEstimate(from, to, value, data, opts = {}) {
    let tx;
    let estGasLimit;

    opts = { ...opts };

    // just keep repeating until the result stops improving on the previous.
    do {
      tx = await this.populate(from, to, value, data, opts);

      try {
        estGasLimit = await this.provider.estimateGas(tx);
      } catch (err) {
        console.log(err.code);
        console.log(err.message);
        throw err;
      }

      opts.gasLimit = estGasLimit;

      // here, result.tx.gasLimit is the base from the previous call and
      // estL2GasLimit is the most recent result. So we are iterating until the
      // most recent result stops being smaller than the previous.
    } while (estGasLimit.lt(tx.gasLimit));

    // using the tx object after this call is the common case. it would be
    // surprising if it was left as the second from last call
    tx.gasLimit = estGasLimit;
    return { tx, gasLimit: estGasLimit };
  }

  /**
   * populate a transaction for the given values. Returns tx object where
   * tx is the pre-serialized but fully populated transaction request object
   *
   * To update a previously obtained result, pass your tx as the opts. Delete
   * any items from the new opts that you want refreshed.
   *
   * By default, if data is provided, the gasLimit for the initial estimate is
   * increased by allNonZeroGas(data). To circumvent this, provide an explicit
   * gasLimit in the opts .*/
  async populate(from, to, value, data, opts = {}) {
    const { refresh, chainId, nonce, gasPrice } = opts;
    let { gasLimit } = opts;

    if (gasLimit?.constructor?.name == "Number")
      gasLimit = ethers.BigNumber.from(gasLimit);

    if (!this.oracle.initialised || refresh) await this.oracle.refresh();

    if (!gasLimit) {
      gasLimit = GasLimiter.defaultGasLimit;
      if (data)
        gasLimit = gasLimit.add(ethers.BigNumber.from(allNonZeroGas(data)));
    }

    const tx = {
      chainId: chainId ?? (await this.provider.getNetwork())?.chainId,
      nonce: nonce ?? (await this.provider.getTransactionCount(from)),
      gasPrice: gasPrice ?? this.oracle.current.gasPrice,
      gasLimit,
      to,
    };

    if (typeof value !== "undefined") tx.value = value;
    if (typeof data !== "undefined") tx.data = data;
    return tx;
  }

  /**
   * Serialize a transaction for the given values. Returns {tx, encoded} where
   * tx is the result of calling populate(), and encoded is the rlp,
   * sendTransaction ready, encoding of tx.
   * (see populate for details of how tx is prepared)
   * @param {ethers.AddressLike} from
   * @param {ethers.AddressLike} to
   * @param {ethers.BigNumber} value
   * @param {ethers.DataHexStringOrArrayish} data
   * @param {object} opts
   */
  async serialize(from, to, value, data, opts = {}) {
    const tx = await this.populate(from, to, value, data, opts);

    const encoded = ethers.utils.serializeTransaction(tx);
    return { tx, encoded };
  }
}
