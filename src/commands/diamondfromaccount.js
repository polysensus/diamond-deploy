// attempt to find the most recently deployed diamond for an account.
// Works by nonce and deployer address account scanning and ERC 165 checking.

import { programConnect } from "./connect.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { deriveContractAddress } from "../lib/deployment/deriveaddress.js";

import { Reporter } from "../lib/reporter.js";

export async function diamondFromAccountNonce(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  const opts = program.opts();
  const deploykey = resolveHardhatKey(opts.deploykey);

  if (!deploykey && !program.opts().url) {
    r.out(`a deployment key and url are required`);
    process.exit(1);
  }

  const signer = programConnect(program, false, deploykey);

  const diamond = await deriveContractAddress(
    r,
    signer,
    signer.address,
    options.diamondNonce
  );

  if (!diamond) {
    r.out(`diamond address not found`);
    process.exit(1);
  }
  r.out(`${diamond}`);
  process.exit(0);
}
