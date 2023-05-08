import { ethers } from "ethers";
import { Option } from "commander";
import { urlConnect } from "./connect.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { readJson } from "./fsutil.js";

import { DiamondDeployer } from "../lib/deployment/diamond/deploy.js";

import { FileReader } from "../lib/deployment/filefinder/reader.js";
import { Reporter } from "../lib/reporter.js";
import { FacetCutOpts } from "../lib/deployment/diamond/facet.js";

import { wei2Eth, wei2Gwei } from "../lib/ethunits.js";

const readers = {
  FileReader: new FileReader(),
};

export function addOPCost(program) {
  program
    .command("op-cost")
    .option("--chainid-l1 <chainidl1>", "l1 chain id", 5)
    .option("--chainid-l2 <chainidl2>", "l1 chain id", 420)
    .addOption(
      new Option(
        "-U, --l1-url <l1url>",
        "url for optimism L1 (goerli or mainnet)"
      ).env("OPTIMISM_L1_URL")
    )
    .option("--legacy", "pre eip 1559 gas estimation")
    .option("--gasprice <number>", "gas price in gwei for deployment.")
    .option("--eth-fiat <ethfiat>", "gas price in gwei for deployment.")
    .option("--fiat-symbol <symbol>", "currency symbol for fiat", "GBP")
    .option("--ignore-names <names...>")
    .option(
      "-f, --facets <facets>",
      "a file describing the named facets to add. must include at least Diamond, DiamondLoupeFacet and OwnershipFacet"
    )
    .action((options) => opcost(program, options));
}

async function opcost(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  const ethFiat = options.ethFiat ? Number(options.ethFiat) : undefined;

  const opts = program.opts();

  const deploykey = resolveHardhatKey(opts.deploykey);

  if (!deploykey && !program.opts().url) {
    r.out(`a deployment key and url is required to estimate costs`);
    process.exit(1);
  }

  const signer = urlConnect(program.opts().url, {
    key: deploykey,
    polling: true,
    optimism: true,
  });

  // opts.commit = true; // forces deploy

  const cuts = readJson(options.facets ?? "facets.json").map(
    (o) => new FacetCutOpts(o)
  );

  const deployer = new DiamondDeployer(r, signer, readers, options);
  await deployer.processERC2535Cuts(cuts);
  await deployer.processCuts(cuts);

  const displayWei = (wei) => {
    let display = `${wei2Gwei(wei).toFixed(2)} GWEI`;
    if (ethFiat)
      display = `${display}, ${(wei2Eth(wei) * ethFiat).toFixed(4)} ${
        options.fiatSymbol
      }`;
    return display;
  };
  const displayGas = (x) => x.toString().padStart(10, " ");

  // deployer.report();
  const provider = signer.provider;
  let diamondCost = ethers.BigNumber.from(0);
  for (const { tx, co } of deployer.results) {
    const totalCost = await provider.estimateTotalGasCost(tx);
    const l1Cost = await provider.estimateL1GasCost(tx);
    const l2Cost = await provider.estimateL2GasCost(tx);
    const l1Gas = await provider.estimateL1Gas(tx);
    r.out(`Estimates: ${co.name}`);
    r.out(`   Total gas cost: ${displayWei(totalCost)}`);
    r.out(`      L1 gas cost: ${displayWei(l1Cost)}`);
    r.out(`      L2 gas cost: ${displayWei(l2Cost)}`);
    r.out(`   L1 Gas        : ${displayGas(l1Gas)}`);
    diamondCost = diamondCost.add(totalCost);
  }
  r.out(`    Diamond Cost : ${displayWei(diamondCost)}`);
  process.exit(deployer.reporterrs());
}
