// This command implements upgrade only deployment, where the proxy contract is
// already deployed.
import { ethers } from "ethers";
import { programConnect, resolveSigner } from "./connect.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { readJson } from "./fsutil.js";
import { deriveContractAddress } from "../lib/deployment/deriveaddress.js";

import { DiamondDeployer } from "../lib/deployment/diamond/deploy.js";

import { FileReader } from "../lib/deployment/filefinder/reader.js";
import { Reporter } from "../lib/reporter.js";
import { FacetCutOpts } from "../lib/deployment/diamond/facet.js";

const readers = {
  FileReader: new FileReader(),
};

export function addDeployDiamondUpgrade(program) {
  program
    .command("diamond-up")
    .description(
      "upgrade an existing diamond proxy with new or updated facets. WARNING: this command REMOVES any selectors not present in the --facet file"
    )
    .enablePositionalOptions()
    .combineFlagAndOptionalValue(false)
    .option("-n, --dry-run")
    .option("-v, --verbose [count]", "more verbose reporting")
    .option("-c, --commit")
    .option("--ignore-names <names...>")
    .option("-g, --gaslimit <number>", "gaslimit to use for deployment")
    // The diamond contract reverts if the facets have not been deployed, and this causes
    // "UNPREDICTABLE_GAS_LIMIT" due to the revert
    .option(
      "--diamond-gas-limit <number>",
      "set this when running without --commit, the diamond will revert unless the facets are actually deployed",
      3500000
    )
    .option("--legacy", "pre eip 1559 gas estimation")
    .option("--gasprice <number>", "gas price in gwei for deployment.")
    .option(
      "--replace",
      "check pending and current nonce and replace current if they are different (work around stuck transactions due to price)"
    )
    .option(
      "--diamond-address <address>",
      "the address of the diamond to upgrade. derived from deployer key if not provided"
    )
    .option(
      "--diamond-nonce <nonce>",
      "check addresses derived from nonces on or before this (by default all are checked if --diamond-address is not set"
    )
    .option("--diamond-owner-key <name>", "the owner account key")
    .option("--diamond-name <name>", "name of diamond contract", "Diamond")
    .option(
      "--diamond-loupe-name <name>",
      "name of diamond loupe facet contract",
      "DiamondLoupeFacet"
    )
    .option(
      "--diamond-init-name <name>",
      "name of diamond init contract",
      "DiamondNew"
    )
    .option(
      "--diamond-init-args <args>",
      "json formatted args for the init contract name",
      // TODO: this default is chaintrap specific, will be just undefined and
      // default to no init args
      '[{"typeURIs":[]}]'
    )
    .option(
      "--diamond-cut-name <name>",
      "name of diamond contract",
      "DiamondCutFacet"
    )
    .option(
      "-f, --facets <facets>",
      "a file describing the named facets to add. must include at least Diamond, DiamondLoupeFacet and OwnershipFacet"
    )
    .option(
      "--facets-deployed <filename>",
      `a json file containing a map of facet name to deployed addresses {facet: {address: 0x00...}}.`
    )
    .action((options) => deployDiamondUpgrade(program, options));
}

export async function deployDiamondUpgrade(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  const opts = program.opts();
  const deploykey = resolveHardhatKey(opts.deploykey);

  if (!deploykey && !program.opts().url) {
    r.out(`a deployment key and url is required`);
    process.exit(1);
  }
  const signer = programConnect(program, false, deploykey);

  let diamond;
  if (options.diamondAddress)
    diamond = ethers.utils.getAddress(options.diamondAddress);
  else
    diamond = await deriveContractAddress(signer, signer.address, {
      log: r,
      nonce: options.diamondNonce,
    });

  if (!diamond) {
    r.out(`diamond address not provided and not infered from deploy key`);
    process.exit(1);
  }

  options.diamondAddress = diamond;

  if (options.diamondOwnerKey) {
    options.diamondOwner = await resolveSigner(
      options.diamondOwnerKey,
      signer.provider,
      signer
    );
  }

  const cuts = readJson(options.facets ?? "facets.json").map(
    (o) => new FacetCutOpts(o)
  );
  if (options.facetsDeployed)
    options.facetsDeployed = readJson(options.facetsDeployed);
  else options.facetsDeployed = {};

  const deployer = new DiamondDeployer(r, signer, readers, options);

  const isOffline = () => !deploykey || !opts.commit;

  const exit = (msg, code = undefined) => {
    // if there are errors co-erce any code not > 0 (including undefined) to 1.
    // If there are no errors co-erce an undefined code to 0
    code =
      deployer.errors.length === 0
        ? typeof code === "undefined"
          ? 0
          : code
        : code > 0
        ? code
        : 1;

    deployer.reporterrs();
    if (msg) r.out(msg);
    process.exit(code);
  };
  // exitok will exit with non zero status if there are recorded errors
  const exitok = (msg) => exit(msg, undefined);

  // Handle the diamond, diamondCut and diamondLouper up front. This will throw
  // if we cant load the abi for each. If the diamondAddress is provided (or
  // derived) contract instances are bound for each.
  await deployer.processERC2535Cuts(cuts, options.diamondAddress);
  await deployer.processCuts(cuts);
  var result = { msg: "not deployed" };
  if (deployer.canDeploy()) {
    result = await deployer.deploy();
    if (result.isErr()) exit(result.errmsg(), 1);
  }

  if (isOffline()) {
    deployer.report();
  }
  exitok(result.msg);
}
