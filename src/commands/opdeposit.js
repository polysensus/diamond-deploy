/*
Derived from https://github.com/ethereum-optimism/optimism-tutorial/tree/main/cross-dom-bridge-eth
*/
import { ethers } from 'ethers';
import { Option } from "commander";

import { urlConnect } from './connect.js';

import { wei2Eth, wei2Gwei } from '../lib/ethunits.js';
import { GasOracle } from '../lib/optimism/gasoracle.js';

import { MessageStatus, CrossChainMessenger } from  "@eth-optimism/sdk";

const log = console.log;
const out = console.log;

export function addOPDeposit(program) {
  program
    .command("op-deposit <key> <amount>")
    .description("deposit ethereum ETH with the optimism L2 bridge to obtain ETH on optimism L2, defaults to testnet chain ids")
    .addOption(
      new Option(
        "-U, --l1-url <l1url>",
        "url for the L1 from which to bridge the ETH"
      ).env("OPTIMISM_L1_URL")
    )
    .option("--chainid-l1 <chainidl1>", "l1 chain id", 5)
    .option("--chainid-l2 <chainidl2>", "l1 chain id", 420)
    .option("--l2gaslimit <l2gaslimit>")
    .addOption(
      new Option(
        "--gasprice <gasprice>", "gas price in gwei")
        .env("OPTIMISM_GASPRICE"))
    .option(
      "-m, --margin-percent <percent>",
      "when sending max, the percentage to increase the total cost estimate by",
      5)
    .option("--eth-fiat <fiat>", "cost in fiat currency for 1 ETH")
    .option("--fiat-symbol <symbol>", "currency symbol for fiat", "GBP")
    .option("-c, --commit", "default is dry-run, set -c to issue the transfer")
    .option("-A, --adjust-for-costs", "reduce the amount sent based on the estimated costs (set this for max sends)", false)
    .option("--units <units>", "wei, gwei or ether, as per eters.parseUnits", "gwei")
    .action((key, amount, options) => opdeposit(program, options, key, amount));
}

export async function opdeposit(program, options, key, amountRequest) {

  const {units: amountUnits, marginPercent} = options;
  let {l2gaslimit, gasprice, adjustForCosts} = options;

  if (l2gaslimit) {
    l2gaslimit = ethers.BigNumber.from(l2gaslimit);
    log(`setting l2gaslimit ${l2gaslimit}`)
  }
  const gasPrice = gasprice ? ethers.utils.parseUnits(gasprice, "gwei") : undefined;

  const fmtWei = (wei) => {
    const gwei = wei2Gwei(wei);
    if (!options.ethFiat) {
      return `${gwei} GWEI`;
    }
    return `${gwei} GWEI (${wei2Eth(wei) * options.ethFiat} ${options.fiatSymbol})`;
  }

  // The optimism examples use MNEMONIC keys, for dev wallets we just use explicit private keys.
  if (!key) {
    out(`A key must be provided as a positional parameter (it can be a file name)`);
    process.exit(1);
  }

  const messenger = connectCrossChainMessenger(program, options, key);
  const oracle = await GasOracle.create(messenger.l2Signer.provider);
  // const limiter = new GasLimiter(messenger.l2Signer.provider, oracle);

  const forAddress = await messenger.l1Signer.getAddress();

  const l1BalanceBefore = await messenger.l1Signer.getBalance();
  if (l1BalanceBefore.isZero()) {
    out(`Senders balance is zero @${signer.address}`);
    process.exit(1);
  }
  const l2BalanceBefore = await messenger.l2Signer.getBalance();

  let wei;
  if (amountRequest === "max") {
    adjustForCosts = true;
    wei = amountRequest = l1BalanceBefore;
    out(`Deposit MAX: ${fmtWei(wei)} for @${forAddress}, L1 ${options.chainidL1} -> L2 ${options.chainidL2}`)
  } else {
    wei = amountRequest = ethers.utils.parseUnits(amountRequest, amountUnits);
    if (l1BalanceBefore.lt(wei)) {
      out(`Sender balance ${fmtWei(l1BalanceBefore)} to low to send ${wei2Gwei(wei)} @${signer.address}`);
      process.exit(1);
    }
    out(`Deposit: ${fmtWei(wei)} for @${forAddress}, L1 ${options.chainidL1} -> L2 ${options.chainidL2}`)
  }

  const start = new Date()

  // TODO: let the response hash be provided as an option so interrupted transfers can be resumed
  let opts = {overrides: {}}
  if (gasPrice) {
    opts.gasPrice = gasPrice;
  }

  let margin = ethers.BigNumber.from(0);
  if (adjustForCosts) {
    const tx = await messenger.populateTransaction.depositETH(wei, opts);
    const data = ethers.utils.serializeTransaction(tx);
    const estL1Gas = await oracle.getL1GasUsed(data);
    // const estL1Gas = await oracle.getL1GasUsed(tx);
    const estL2Gas = await oracle.provider.estimateGas(tx);
    const estL1Cost = estL1Gas.mul(oracle.current.l1BaseFee);
    const estL2Cost = await oracle.provider.estimateL2GasCost(tx);
    const totalCost = estL1Cost.add(estL2Cost);
    margin = wei.div(ethers.BigNumber.from(100)).mul(ethers.BigNumber.from(marginPercent));
    // opts.overrides.gasLimit = estL1Gas;
    // opts.gasLimit = estL2Gas + estL1Gas;
    // opts.overrides.gasLimit = estL2Gas;

    out(`Estimates: L1Gas ${estL1Gas}, L2Gas ${estL2Gas}, L1Cost ${fmtWei(estL1Cost)}, L2Cost ${fmtWei(estL2Cost)}`);
    out(`Estimates: Total ${fmtWei(totalCost)}`);
    out(`Margin: ${fmtWei(margin)}`);
    wei = wei.sub(margin);
    if (wei.isNegative()) {
      out(`Insufficient balance to complete transfer, fee adjustment is greater than transfer amount`);
      out(`Balance: ${fmtWei(l1BalanceBefore)}, Requested: ${fmtWei(amountRequest)}`);
      process.exit(1);
    }
    out(`Deposit Adjusted: ${fmtWei(wei)}`);
  }

  out(`Before      : On L1: ${fmtWei(l1BalanceBefore)}    On L2: ${fmtWei(l2BalanceBefore)}`);
  out(`Expect      : On L1: ${fmtWei(l1BalanceBefore.sub(amountRequest).add(margin))}    On L2: ${fmtWei(l2BalanceBefore.add(wei))}`);

  if (!options.commit) {
    console.log(`dry run, exiting`);
    process.exit(0);
  }
  console.log("Actual ===================================")


  let response;
  try {
    response = await messenger.depositETH(wei, opts)
  } catch (err) {
    out(`${err}`);
    console.log(`failed to initiate transfer`);
    process.exit(1);
  }

  out(`Transaction hash (on L1): ${response.hash}`)
  await response.wait()
  out("Waiting for status to change to RELAYED")
  out(`Time so far ${(new Date()-start)/1000} seconds`)
  try {
    await messenger.waitForMessageStatus(
      response.hash, MessageStatus.RELAYED);
  } catch (err) {
    out(`${err}`);
    console.log(`transfer failed`);
    process.exit(1);
  }

  const l1BalanceAfter = await messenger.l1Signer.getBalance();
  const l2BalanceAfter = await messenger.l2Signer.getBalance();
  out(`depositETH took ${(new Date()-start)/1000} seconds\n\n`)
  out(`New Balances: On L1: ${fmtWei(l1BalanceAfter)}    On L2: ${fmtWei(l2BalanceAfter)}`);
}

export function connectCrossChainMessenger(program, options, key, opts={}) {

  const l1Url = options.l1Url;
  if (!l1Url) {
    out(`The --l1-url option must be provided`);
    process.exit(1);
  }
  const l2Url = program.opts().url;
  if (!l2Url) {
    out(`The --url option must be provided`);
    process.exit(1);
  }

  return new CrossChainMessenger({
      l1ChainId: options.chainidL1,
      l2ChainId: options.chainidL2,
      l1SignerOrProvider: urlConnect(l1Url, {key, optimism: true, polling:true}),
      l2SignerOrProvider: urlConnect(l2Url, {key, optimism: true, polling:true}),
      bedrock: true
  });
}