import { ethers } from "ethers";

import gasOracleABI from "./gasoracleabi.json" assert { type: "json" };

import { dataGas } from "./gas.js";

export const gasOracleInterface = new ethers.utils.Interface(gasOracleABI);

// The gasprice oracle is a genesis contract on all optimism networks, it is
// always deployed at this address.
export const gasOracleAddress = "0x420000000000000000000000000000000000000F";

/**
 * create an ethers contract instance for the gas price oracle at the well known
 * contract address (on any optimism chain)
 * @param {*} provider  ethers provider or compatible
 * @returns {ethers.Contract}
 */
export function createContract(provider) {
  return new ethers.Contract(gasOracleAddress, gasOracleABI, provider);
}

/**
 * Conveniences for interacting with the Optimism Gas Price Oracle
 * https://optimistic.etherscan.io/address/0x420000000000000000000000000000000000000F#code
 * Note that it is a genesis deploy and is deployed at the same address on all
 * optimism networks
 *
 * l1BaseFee - also referred to as just "L1 gasPrice". This is gas price from l1
 * most recently recorded in the oracle.
 */
export class GasOracle {
  static async create(provider) {
    const o = new GasOracle(provider);
    await o.refresh();
    return o;
  }

  constructor(provider) {
    this._initialised = false;
    this.c = createContract(provider);

    // note there are events for all of these things changing. for command line
    // tools reading once at startup is usually fine. for long running contexts
    // it might be worth listening for them, certainly the gasPrice event is
    // worth considering.
    this.current = {
      gasPrice: undefined, // aka L2 GasPrice, changeable
      // optimism/sdk getL1GasPrice returns l1BaseFee from the oracle
      l1BaseFee: undefined, // aka L1 GasPrice, very volatile
      // amortized cost of rollup batch submission, per transaction
      overhead: undefined, // stable, unlikely to change (or at least not very often)
      // currently just 1, it exists to allow optimism to scale the fee
      scalar: undefined, // stable, unlikely to change (or at least not very often)
      // number of decimals for the scalar, and the l1BaseFee.
      decimals: undefined, // stable, unlikely to change
    };
  }

  get provider() {
    return this.c.provider;
  }

  get initialised() {
    return this._initialised;
  }

  async refresh() {
    this.current.gasPrice = await this.c.provider.getGasPrice();
    this.current.l1BaseFee = await this.c.l1BaseFee();
    this.current.overhead = await this.c.overhead();
    this.current.scalar = await this.c.scalar();
    this.current.decimals = await this.c.decimals();
    this._initialised = true;
  }

  /**
   * getL1GasUsed calculates the transaction data gas according to the tx_data_gas eq here
   * https://community.optimism.io/docs/developers/build/transaction-fees/#the-l2-execution-fee
   * And in line with the OVM gas oracle here
   * https://optimistic.etherscan.io/address/0x420000000000000000000000000000000000000F#code (see getL1GasUsed)
   * Note that its a proxy contract at that address on goerli-optimistic
   * @param {ethers.DataHexStringOrArrayish} data ethers arrayish or data hex string
   * @returns {Number}
   */
  getL1GasUsed(data) {
    data = ethers.utils.arrayify(data);

    let total = 0;
    for (const b of data) {
      if (b === 0) total += 4;
      else total += 16;
    }
    const unsigned = ethers.BigNumber.from(total).add(this.current.overhead);

    // 68 bytes worth of non-zero padding added to account for absence of
    // signature in data See the oracle contract for detailed break down. Note
    // that * 16 makes the (perfectly fine) assumption that all or most bytes in
    // a signature will be non zero.
    return unsigned.add(68 * 16);
  }

  /**
   * Return the L1 Fee as a Number. Which is:
   *  l1GasUsed(data) * l1BaseFee * scalar) / 10^decimals
   *
   * This function computes locally using the values most recently fetched from
   * the oracle. It does not interact with the chain.
   *
   * The L1 Fee is also known as the L1 security fee, and also as the L1 data fee
   * See https://help.optimism.io/hc/en-us/articles/4411895794715
   *
   * This function is javascript port of getL1Fee from
   * https://optimistic.etherscan.io/address/0x420000000000000000000000000000000000000F#code
   * @param {ethers.DataHexStringOrArrayish} data
   */
  getL1Fee(data) {
    const l1GasUsed = this.getL1GasUsed(data);
    const l1Fee = l1GasUsed.mul(this.current.l1BaseFee);
    // It would be very surprising if the decimals were not safe for javascript
    // number precision.
    const divisor = 10 ** this.current.decimals.toNumber();
    const unscaled = l1Fee.mul(this.current.scalar);
    return unscaled.div(ethers.BigNumber.from(divisor));
  }

  /**
   * Returns the scalar as a Number, taking into account decimals
   */
  get scalar() {
    return this.current.scalar.toNumber() / 10 ** this.decimals.toNumber();
  }
}
