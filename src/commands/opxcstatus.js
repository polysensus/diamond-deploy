/*
Derived from https://github.com/ethereum-optimism/optimism-tutorial/tree/main/cross-dom-bridge-eth
*/
import { ethers } from "ethers";
import { Option } from "commander";

import { urlConnect } from "./connect.js";

import { wei2Eth, wei2Gwei } from "../lib/ethunits.js";

import { MessageStatus, CrossChainMessenger } from "@eth-optimism/sdk";

const log = console.log;
const out = console.log;

export function addOPXCStatus(program) {
  program
    .command("op-xcstatus <txhash>")
    .description("check on the status of a cross chain bridging transaction")
    .addOption(
      new Option(
        "-U, --l1-url <l1url>",
        "url for the L1 from which to bridge the ETH"
      ).env("OPTIMISM_L1_URL")
    )
    .option("--chainid-l1 <chainidl1>", "l1 chain id", 5)
    .option("--chainid-l2 <chainidl2>", "l1 chain id", 420)
    .option("--eth-fiat <fiat>", "cost in fiat currency for 1 ETH")
    .option("--fiat-symbol <symbol>", "currency symbol for fiat", "GBP")
    .option("--account <address>", "account to check the balance of after")
    .option(
      "--units <units>",
      "wei, gwei or ether, as per eters.parseUnits",
      "gwei"
    )
    .action((txhash, options) => opxcstatus(program, options, txhash));
}

export async function opxcstatus(program, options, txhash) {
  const fmtWei = (wei) => {
    const gwei = wei2Gwei(wei);
    if (!options.ethFiat) {
      return `${gwei} GWEI`;
    }
    return `${gwei} GWEI (${wei2Eth(wei) * options.ethFiat} ${
      options.fiatSymbol
    })`;
  };

  const messenger = connectCrossChainMessenger(program, options);

  const start = new Date();

  out("Waiting for status to change to RELAYED");
  txhash = ethers.utils.hexlify(txhash);
  try {
    // XXX: this doesn't work, not sure why
    await messenger.waitForMessageStatus(txhash, MessageStatus.RELAYED);
  } catch (err) {
    out(`${err}`);
    console.log(`transfer failed`);
    process.exit(1);
  }

  out(`depositETH took ${(new Date() - start) / 1000} seconds\n\n`);
  if (options.account) {
    const l1BalanceAfter = await messenger.l1Provider.getBalance(
      options.accounts
    );
    const l2BalanceAfter = await messenger.l2Provider.getBalance(
      options.accounts
    );
    out(
      `New Balances: On L1: ${fmtWei(l1BalanceAfter)}    On L2: ${fmtWei(
        l2BalanceAfter
      )}`
    );
  }
}

export function connectCrossChainMessenger(program, options) {
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
    l1SignerOrProvider: urlConnect(l1Url, { optimism: true, polling: true }),
    l2SignerOrProvider: urlConnect(l2Url, { optimism: true, polling: true }),
    bedrock: true,
  });
}
