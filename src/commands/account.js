import { urlConnect } from './connect.js';
import { wei2Eth } from '../lib/ethunits.js';

const log = console.log;
const out = console.log;

export async function addAccount(program) {
  program
      .command("account <addr>")
      .description("balance, nonce and so on")
      .option("-E, --eth-fiat <fiat>", "cost in fiat currency for 1 ETH")
      .option("-S, --fiat-symbol <symbol>", "currency symbol for fiat", "GBP")
      .option("--units <units>", "wei, gwei or ether, as per eters.parseUnits", "ether")
      .action((addr, options) => account(program, options, addr));
}

async function account(program, options, address) {
  const url = program.opts().url;
  if (!url) throw new Error("The --url option is required")

  let provider = urlConnect(url, {polling:true});
  const balanceWei = await provider.getBalance(address);
  const nonce = await provider.getTransactionCount(address);

  let balance
  let symbol
  if (options.units === "ether") {
    symbol = "ETH"
    balance = wei2Eth(balanceWei);
  } else if (options.units === "gwei" ) {
    symbol = "GWEI"
    balance = wei2Gwei(balanceWei);
  } else {
    symbol = "WEI"
    balance = balanceWei;
  }
  const eth = wei2Eth(balanceWei);

  out(`Address: ${address}`);
  out(`Balance: ${balance} ${symbol}`);
  if (options.ethFiat)
    out(`Fiat: ${eth * options.ethFiat} ${options.fiatSymbol}`);
  out(`Nonce: ${nonce}`);
}
