import {ethers} from 'ethers';

/**
 * dataGas calculates the transaction data gas according to the tx_data_gas eq here
 * https://community.optimism.io/docs/developers/build/transaction-fees/#the-l2-execution-fee
 * but without accounting for overhead or signature padding
 * @param {ethers.DataHexStringOrArrayish} data ethers arrayish or data hex string
 * @returns {Number}
 */
export function dataGas(data) {
  data = ethers.utils.arrayify(data)

  let total = 0
  for (const b of data) {
    if (b !== 0)
      total += 4;
    else
      total += 16;
  }

  return total;
}

/**
 * Return the gas cost for the data assuming that all bytes are non zero. this
 * is a fair upper bound when estimating the impact of the data on gasLimit. It
 * can be as much as 4x what you need, however for blob like data which is often
 * encrypted, the number of zero bytes should be low. So in practice this is
 * quite a fair estimate.
 * @param {ethers.DataHexStringOrArrayish } data 
 * @returns {Number}
 */
export function allNonZeroGas(data) {
  if (data.constructor.name === 'String') {
    let len = data.length;
    if (data.startsWith('0x'))
      len -= 2;
    return (len / 2) * 16;
  }
  return data.length * 16;
}