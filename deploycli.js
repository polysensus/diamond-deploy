#! /usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config();

// import {ethers} from 'ethers';
// ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR);
// // ethers.utils.Logger.setLogLevel("off");

import { program, Option } from "commander";

import { optimismDeployCosts } from "./src/commands/opcost.js";
import { deployNewDiamond } from "./src/commands/deploy.js";
import { deployDiamondUpgrade } from "./src/commands/upgrade.js";
import { diamondFromAccountNonce } from "./src/commands/diamondfromaccount.js";
import { listSelectors } from "./src/commands/list.js";
import { pendingTransactions } from "./src/commands/pending.js";

program.addOption(
  new Option(
    "-d, --deploykey <key>",
    "derive the areana address from private key that deployed the arena contract"
  ).env("DEPLOYKEY")
);

program.addOption(
  new Option("-u, --url <url>", "provider url", "http://localhost:8545").env(
    "PROVIDER_URL"
  )
);

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

program
  .command("op-cost <ethprice>")
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
  .option("--ignore-names <names...>")
  .option(
    "-f, --facets <facets>",
    "a file describing the named facets to add. must include at least Diamond, DiamondLoupeFacet and OwnershipFacet"
  )
  .action((ethprice, options) => optimismDeployCosts(program, options, ethprice));

program
  .command("diamond-up")
  .description(
    "upgrade an existing diamond proxy with new or updated facets. WARNING: this command REMOVES any selectors not present in the --facet file"
  )
  .enablePositionalOptions()
  .combineFlagAndOptionalValue(false)
  .option("-n, --dry-run")
  .option("-v, --verbose [count]", "more verbose reporting")
  .option("--ignore-names <names...>")
  .option("--offline", "prepare unsigned transaction payloads")
  .option("-g, --gaslimit <number>", "gaslimit to use for deployment")
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
  .action((options) => deployDiamondUpgrade(program, options));

program
  .command("diamond-new")
  .description(
    `deploy a new diamond, this deploys a new proxy contract with empty state and cuts in the facets`
  )
  .enablePositionalOptions()
  .combineFlagAndOptionalValue(false)
  .option("-v, --verbose [count]", "more verbose reporting")
  .option("-n, --dry-run")
  .option("--ignore-names <names...>")
  .option("--offline", "prepare unsigned transaction payloads")
  .option("-g, --gaslimit <number>", "gaslimit to use for deployment")
  .option("--legacy", "pre eip 1559 gas estimation")
  .option("--gasprice <number>", "gas price in gwei for deployment.")
  .option(
    "--replace",
    "check pending and current nonce and replace current if they are different (work around stuck transactions due to price)"
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
    "name of diamond contract",
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
  .action((options) => deployNewDiamond(program, options));

program
  .command("pending")
  .option("-a --account <address>", "the owner account address")
  .option("-k --key <key>", "the owner account key (prioritised over address)")
  .action((options) => {
    pendingTransactions(program, options);
  });

program
  .command("list")
  .summary("list the selectors for each discovered abi file")
  .description(
    `list the contract and libary selectors. Use --format json to
produce output that can be consumed by deploy-new and deploy`
  )
  .option("-v, --verbose [count]", "more verbose reporting")
  .option("-i, --directories <includedirs...>")
  .option(
    "-I, --includeclasses <classes...>",
    "facet is the only supported class for now"
  )
  .option("-n, --names <names...>")
  .option(
    "-F, --format <format>",
    "'json' | 'info' | 'table'. defaults to 'table'"
  )
  .option("-a, --absoloute", "output absoloute filenames")
  .option("-c, --collisions-only", "only output collisions (if there are any)")
  .option(
    "-x, --exclude <exclude>",
    "a file listing excluded selector implementations. use to reconcile or remove collisions. The format is the same as produced whenwhen -F json and --collisions-only are set"
  )
  .action((options) => listSelectors(program, options));

program.parse();
