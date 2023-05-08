/*
Derived from https://github.com/ethereum-optimism/optimism-tutorial/tree/main/cross-dom-bridge-eth
*/
import { ethers } from "ethers";
import { Option } from "commander";
import { asL2Provider } from "@eth-optimism/sdk";

import { urlConnect } from "./connect.js";
import { readKey } from "./readkey.js";
import { weiNumber2Eth, wei2Eth, wei2Gwei } from "../lib/ethunits.js";
import { GasOracle } from "../lib/optimism/gasoracle.js";
import { GasLimiter } from "../lib/optimism/gaslimit.js";
// import { opTxDataGas } from '../lib/opgas.js';

const log = console.log;
const out = console.log;

export function addOPSend(program) {
  program
    .command("op-send <key> <addr> <amount>")
    .description("send eth from key to addr")
    .option("--chainid-l2 <chainidl2>", "l1 chain id", 420)
    .option("--l2gaslimit <l2gaslimit>")
    .addOption(
      new Option("--gasprice <gasprice>", "gas price in gwei").env(
        "ARENASTATE_OPTIMISM_GASPRICE"
      )
    )
    .option(
      "-m, --margin-percent <percent>",
      "when sending max, the percentage to increase the total cost estimate by",
      5
    )
    .option("--eth-fiat <fiat>", "cost in fiat currency for 1 ETH")
    .option("--fiat-symbol <symbol>", "currency symbol for fiat", "GBP")
    .option("-c, --commit", "default is dry-run, set -c to issue the transfer")
    .option(
      "-A, --adjust-for-costs",
      "reduce the amount sent based on the estimated costs (set this for max sends)",
      false
    )
    .option(
      "--units <units>",
      "wei, gwei or ether, as per eters.parseUnits",
      "ether"
    )
    .action((key, addr, amount, options) =>
      opsend(program, options, key, addr, amount)
    );
}

async function opsend(program, options, key, address, amount) {
  if (!program.opts().url) {
    out(`The --url option must be provided`);
    process.exit(1);
  }

  // The optimism examples use MNEMONIC keys, for dev wallets we just use explicit private keys.
  if (!key) {
    out(
      `A key must be provided as a positional parameter (it can be a file name)`
    );
    process.exit(1);
  }

  const { units: amountUnits, marginPercent } = options;
  let { l2gaslimit, gasprice, adjustForCosts } = options;

  const gasPrice = gasprice
    ? ethers.utils.parseUnits(gasprice, "gwei")
    : undefined;

  const signer = connectSigner(program, options, key);
  const fromAddress = await signer.getAddress();

  const oracle = new GasOracle(signer.provider);
  const limiter = new GasLimiter(signer.provider, oracle);

  // The populated transaction gets initialised in different ways depending on
  // whether we are adjusting for <max> and how much information is present on
  // the command line
  let populated;

  if (l2gaslimit) {
    l2gaslimit = ethers.BigNumber.from(l2gaslimit);
  }

  let wei, requestedWei;
  const balanceBefore = await signer.getBalance();
  if (balanceBefore.isZero()) {
    out(`Senders balance is zero @${signer.address}`);
    process.exit(1);
  }
  if (amount === "max") {
    adjustForCosts = true;
    requestedWei = wei = balanceBefore;
    out(`Sending MAX: ${wei2Eth(wei)}`);
  } else {
    requestedWei = wei = ethers.utils.parseUnits(amount, amountUnits);
    if (balanceBefore.lt(wei)) {
      out(
        `Sender balance ${wei2Gwei(
          balanceBefore
        )} GWEI to low to send ${wei2Gwei(wei)} @${signer.address}`
      );
    }
    out(`Sending: ${wei2Gwei(wei)}`);
  }

  if (!l2gaslimit) {
    populated = await limiter.populateAndEstimate(
      fromAddress,
      address,
      wei,
      undefined,
      { gasPrice }
    );
    l2gaslimit = populated.gasLimit;
  }

  if (adjustForCosts) {
    // Fill in any missing things, if we haven't populated (above) this will do so.
    populated =
      populated ??
      (await limiter.populateAndEstimate(fromAddress, address, wei, undefined, {
        gasPrice,
        ...populated?.tx,
      }));

    const l1DataFee = oracle.getL1Fee(
      ethers.utils.serializeTransaction(populated.tx)
    );
    const l2GasCost = populated.tx.gasLimit.mul(populated.tx.gasPrice);
    const totalFee = l1DataFee.add(l2GasCost);

    if (totalFee.gte(wei)) {
      console.log(
        `Fee ${wei2Gwei(totalFee)} exceeds transfer amount ${wei2Gwei(
          wei
        )} GWEI`
      );
      process.exit(1);
    }

    const fees = await limiter.estimateOpFees(populated.tx);

    reportEstimatedFees(fees);

    const margin = wei
      .div(ethers.BigNumber.from(100))
      .mul(ethers.BigNumber.from(marginPercent));

    wei = wei.sub(totalFee);
    wei = wei.sub(margin);

    out(`Adjusted for fees with ${marginPercent}% margin`);
    out(
      `Fees Gwei   : ${wei2Gwei(fees.estTotalCost)} GWEI to transfer ${wei2Gwei(
        requestedWei
      )} GWEI`
    );
    if (options.ethFiat) {
      out(
        `Fees Fiat   : ${
          weiNumber2Eth(fees.estTotalCost) * Number(options.ethFiat)
        } ${options.fiatSymbol} to transfer ${
          wei2Eth(requestedWei) * Number(options.ethFiat)
        } GBP worth of ETH`
      );
    }

    console.log("Actual ===================================");
  }

  const toBalanceBefore = wei2Gwei(await signer.provider.getBalance(address));
  out(`Sender @${signer.address}, Beneficiary @${address}`);
  out(`Balances ${wei2Gwei(balanceBefore)}, ${toBalanceBefore} GWEI`);
  if (!options.commit) {
    console.log(`dry run, exiting`);
    process.exit(0);
  }

  let tx = populated?.tx;
  if (!tx)
    tx = await limiter.populate(fromAddress, address, wei, undefined, {
      gasPrice,
      ...tx,
    });

  let response;
  try {
    response = await signer.sendTransaction(tx);
  } catch (err) {
    out(`${err}`);
    console.log(`failed to transfer funds`);
    const l1DataFee = oracle.getL1Fee(ethers.utils.serializeTransaction(tx));
    const l2GasCost = populated.tx.gasLimit.mul(tx.gasPrice);
    const totalFee = l1DataFee.add(l2GasCost);
    const requiredBalance = totalFee.add(wei);
    const fees = await limiter.estimateOpFees(populated.tx);
    if (requiredBalance.gt(balanceBefore)) {
      console.log("arse");
    }

    process.exit(1);
  }
  const result = await response.wait();
  const actualFee =
    wei2Gwei(result.gasUsed) * wei2Gwei(result.effectiveGasPrice);

  const fromBalanceAfter = wei2Gwei(await signer.getBalance());
  const toBalanceAfter = wei2Gwei(await signer.provider.getBalance(address));
  out(`After @${signer.address}, Beneficiary @${address}`);
  out(`Balances ${fromBalanceAfter}, ${toBalanceAfter} GWEI`);
  out(`Fee   : ${actualFee} GWEI`);
}

export function connectSigner(program, options, key, opts = {}) {
  const l2Url = program.opts().url;
  if (!l2Url) throw new Error("The --url option is required");

  let provider = urlConnect(l2Url, { polling: true });
  provider = asL2Provider(provider);

  return new ethers.Wallet(readKey(key), provider);
}

export function reportEstimatedFees(fees) {
  console.log("Estimates ===================================");
  console.log(`Total: ${wei2Gwei(fees.estTotalCost)} GWEI`);
  console.log(`L1: ${wei2Gwei(fees.estL1Cost)} GWEI`);
  console.log(`L2: ${wei2Gwei(fees.estL2Cost)} GWEI`);
  console.log(`L1Gas: ${fees.estL1Gas}`);
  console.log(`L2Gas: ${fees.estL2Gas}`);
}
