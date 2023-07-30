// attempt to find the most recently deployed diamond for an account.
// Works by nonce and deployer address account scanning and ERC 165 checking.

import { programConnect } from "./connect.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { deriveContractAddress } from "../lib/deployment/deriveaddress.js";

import { Reporter } from "../lib/reporter.js";

export function addDiamondFromAccountNonce(program) {
  program
    .command("find")
    .description(
      `attempt to find a diamond implementing contract for an EOA. Search from the last nonce back by default or the specified one otherwise.`
    )
    .enablePositionalOptions()
    .combineFlagAndOptionalValue(false)
    .option("-v, --verbose [count]", "more verbose reporting")
    .option(
      "-n, --diamond-nonce <nonce>",
      "check addresses derived from nonces on or before this (by default all are checked if --diamond-address is not set"
    )
    .action((options) => diamondFromAccountNonce(program, options));
}

export async function diamondFromAccountNonce(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  const opts = program.opts();
  const deploykey = resolveHardhatKey(opts.deploykey);

  if (!deploykey && !program.opts().url) {
    r.out(`a deployment key and url are required`);
    process.exit(1);
  }

  const signer = programConnect(program, false, deploykey);

  const diamond = await deriveContractAddress(signer, signer.address, {
    log: r,
    nonce: options.diamondNonce,
  });

  if (!diamond) {
    r.info(`diamond address not found`);
    process.exit(1);
  }
  r.out(`${diamond}`);
  process.exit(0);
}
