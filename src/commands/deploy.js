import { programConnect, resolveSigner } from "./connect.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { readJson } from "./fsutil.js";

import { DiamondDeployer } from "../lib/deployment/diamond/deploy.js";

import { FileReader } from "../lib/deployment/filefinder/reader.js";
import { Reporter } from "../lib/reporter.js";
import { FacetCutOpts } from "../lib/deployment/diamond/facet.js";

const readers = {
  FileReader: new FileReader(),
};

export async function deployNewDiamond(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  const opts = program.opts();
  const deploykey = resolveHardhatKey(opts.deploykey);

  if (!opts.offline) {
    if (!deploykey && !program.opts().url) {
      r.out(
        `unless operating in offline mode a deployment key and url is required`
      );
      process.exit(1);
    }
  }
  const signer = programConnect(program, false, deploykey);

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

  const deployer = new DiamondDeployer(r, signer, readers, options);

  const isOffline = () => !deploykey || !!opts.offline;

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

  // To force a new deploy, we just don't look for the old one.
  await deployer.processERC2535Cuts(cuts);
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
