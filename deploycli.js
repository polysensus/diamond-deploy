#! /usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_FILE ?? ".env" });

// import {ethers} from 'ethers';
// ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR);
// // ethers.utils.Logger.setLogLevel("off");

import { program, Option } from "commander";

import { addDeployNewDiamond } from "./src/commands/deploy.js";
import { addDeployDiamondUpgrade } from "./src/commands/upgrade.js";
import { addDiamondFromAccountNonce } from "./src/commands/diamondfromaccount.js";
import { addListSelectors } from "./src/commands/list.js";
import { addSelector } from "./src/commands/select.js";
import { addPendingTransactions } from "./src/commands/pending.js";

import { addOPCost } from "./src/commands/opcost.js";
import { addOPDeposit } from "./src/commands/opdeposit.js";
import { addOPXCStatus } from "./src/commands/opxcstatus.js";
import { addOPSend } from "./src/commands/opsend.js";
import { addAccount } from "./src/commands/account.js";

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

//---

//---
addOPCost(program);
addOPDeposit(program);
addOPXCStatus(program);
addOPSend(program);
addAccount(program);

//---
addDiamondFromAccountNonce(program);
addDeployNewDiamond(program);
addDeployDiamondUpgrade(program);
addPendingTransactions(program);
addListSelectors(program);
addSelector(program);

program.parse();
