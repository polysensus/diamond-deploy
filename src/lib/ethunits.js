import { ethers } from "ethers";

export const units = {
  wei: 1,
  gwei: 1000000000,
};

export const unitsBig = {
  wei: ethers.BigNumber.from(1),
  gwei: ethers.BigNumber.from(1000000000),
  eth: ethers.BigNumber.from(1000000000).mul(ethers.BigNumber.from(1000000000)),
};

/**
 * wei2Gwei where wei may be a js Number or an ethers.BigNumber
 * @param {Number|ethers.BigNumber} wei
 * @returns {Number}
 */
export function wei2Gwei(wei) {
  if (wei.constructor.name == "Number") return weiNumber2Gwei(wei);
  return weiBig2Gwei(wei);
}

export function weiNumber2Gwei(wei) {
  return wei / units.gwei;
}

export function weiBig2Gwei(wei) {
  try {
    return wei.toNumber() / units.gwei;
  } catch (err) {
    // This can still throw of course
    return wei.div(unitsBig.gwei).toNumber();
  }
}

/**
 * wei2Eth where wei may be a js Number or an ethers.BigNumber
 * @param {Number|ethers.BigNumber} wei
 * @returns {Number}
 */
export function wei2Eth(wei) {
  if (wei.constructor.name == "Number") return weiNumber2Eth(wei);
  return weiBig2Eth(wei);
}

/** wei2EthNumber
 * convert a wei, which is already a js Number to eth
 * @param {Number} wei
 */
export function weiNumber2Eth(wei) {
  // can't do units.gwei * units.gwei because it over flows
  return wei / units.gwei / units.gwei;
}

/**
 * wei to ether when wei is a bignum
 * @param {ethers.BigNumber} wei
 * @returns {Number}
 */
export function weiBig2Eth(wei) {
  return weiBig2Gwei(wei) / units.gwei;
}
