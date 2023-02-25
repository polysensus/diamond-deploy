#! /usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config();

import { program, Option } from "commander";

import { deployNewDiamond, deployDiamondUpgrade } from "./src/commands/deploy.js";
import { listSelectors } from "./src/commands/list.js";
import { pendingTransactions } from "./src/commands/pending.js";

program.addOption(
  new Option(
    "-d, --deploykey <key>",
    "derive the areana address from private key that deployed the arena contract"
  ).env("DEPLOYKEY")
);

program.addOption(
  new Option("-u, --url <url>", "provider url", "http://localhost:8300").env(
    "PROVIDER_URL"
  )
);

program
  .command("diamond-up")
  .description(
    `update an existing deploy a new diamond, this deploys a new proxy contract with empty state and cuts in the facets`
  )
  .enablePositionalOptions()
  .combineFlagAndOptionalValue(false)
  .option('-N, --dry-run')
  .option("-v, --verbose [count]", "more verbose reporting")
  .option("--replace", "check pending and current nonce and replace current if they are different (work around stuck transactions due to price)")
  .option("--offline", "prepare unsigned transaction payloads")
  .option("-g, --gaslimit <number>", "gaslimit to use for deployment")
  .option("--legacy", "pre eip 1559 gas estimation")
  .option("--gasprice <number>", "gas price in gwei for deployment.")
  .option("--diamond-address <address>", "the address of the diamond to upgrade. derived from deployer key if not provided")
  .option("--diamond-prune", "if set, remove any selectors that are not present in --facets")
  .option("--diamond-owner-key <name>", "the owner account key")
  .option("--diamond-name <name>", "name of diamond contract", "Diamond")
  .option("--diamond-loupe-name <name>", "name of diamond loupe facet contract", "DiamondLoupeFacet")
  .option("--diamond-init-name <name>", "name of diamond init contract", "DiamondNew")
  .option("-N, --ignore-names <names...>")
  .option(
    "--diamond-init-args <args>",
    "json formatted args for the init contract name",
    // TODO: this default is chaintrap specific, will be just undefined and
    // default to no init args
    '[{"typeURIs":[]}]'
  )
  .option("--diamond-cut-name <name>", "name of diamond contract", "DiamondCutFacet")
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
  .option("--replace", "check pending and current nonce and replace current if they are different (work around stuck transactions due to price)")
  .option("--offline", "prepare unsigned transaction payloads")
  .option("-g, --gaslimit <number>", "gaslimit to use for deployment")
  .option("--legacy", "pre eip 1559 gas estimation")
  .option("--gasprice <number>", "gas price in gwei for deployment.")
  .option("--diamond-owner-key <name>", "the owner account key")
  .option("--diamond-name <name>", "name of diamond contract", "Diamond")
  .option("--diamond-init-name <name>", "name of diamond contract", "DiamondNew")
  .option(
    "--diamond-init-args <args>",
    "json formatted args for the init contract name",
    // TODO: this default is chaintrap specific, will be just undefined and
    // default to no init args
    '[{"typeURIs":[]}]'
  )
  .option("--diamond-cut-name <name>", "name of diamond contract", "DiamondCutFacet")
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
    pendingTransactions(program, options)
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
