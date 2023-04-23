import { urlConnect } from "./connect.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { readJson } from "./fsutil.js";

import { DiamondDeployer } from "../lib/deployment/diamond/deploy.js";

import { FileReader } from "../lib/deployment/filefinder/reader.js";
import { Reporter } from "../lib/reporter.js";
import { FacetCutOpts } from "../lib/deployment/diamond/facet.js";

const readers = {
  FileReader: new FileReader(),
};

export async function optimismDeployCosts(program, options, ethprice) {
  const r = Reporter.fromVerbosity(options.verbose);

  ethprice = Number(ethprice);

  const opts = program.opts();
  const deploykey = resolveHardhatKey(opts.deploykey);

  if (!deploykey && !program.opts().url) {
    r.out(
      `a deployment key and url is required to estimate costs`
    );
    process.exit(1);
  }

  const signer = urlConnect(
    program.opts().url, {key:opts.deploykey, polling: true, optimism: true});

  opts.dryRun = true; // forces deploy

  const cuts = readJson(options.facets ?? "facets.json").map(
    (o) => new FacetCutOpts(o)
  );

  const deployer = new DiamondDeployer(r, signer, readers, options);
  await deployer.processERC2535Cuts(cuts);
  await deployer.processCuts(cuts);

  // const wieFiat = 1.50764e-15;
  const weiFiat = ethprice / 1e18;
  const toGwei = 1.0/1e9;

  const displayWei = (wei) => {
    return `${wei} WEI, ${(wei * toGwei).toFixed(2)} GWEI, ${(wei * weiFiat).toFixed(2)} GBP`
  }
  const displayGas = x => x.toString().padStart(10, " ")

  // deployer.report();
  const provider = signer.provider;
  for (const {tx, co} of deployer.results) {
    const totalCost = await provider.estimateTotalGasCost(tx)
    const l1Cost = await provider.estimateL1GasCost(tx)
    const l2Cost = await provider.estimateL2GasCost(tx)
    const l1Gas = await provider.estimateL1Gas(tx)
    r.out(`Estimates: ${co.name}`)
    r.out(`   Total gas cost: ${displayWei(totalCost)}`)
    r.out(`      L1 gas cost: ${displayWei(l1Cost)}`)
    r.out(`      L2 gas cost: ${displayWei(l2Cost)}`)
    r.out(`L1 Gas:`)
    r.out(`      Estimate: ${displayGas(l1Gas)}`)
  }
  process.exit(deployer.reporterrs());
}