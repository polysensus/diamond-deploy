import { readJson } from "./fsutil.js";

import { FoundryFileLoader } from "../lib/deployment/loadersfs/foundry/loader.js";
import { Reporter } from "../lib/reporter.js";
import {
  facetRowObject,
  stringifyRows,
} from "../lib/deployment/diamond/facet.js";

function readExclusions(filename, r) {
  if (!filename) return {};
  const exclusions = {};
  for (const exc of readJson(filename)) {
    const key = `${exc.selector}:${exc.name}`;
    if (key in exclusions) {
      if (r) r.out(`ambiguous entries in exclusions file: ${key}`);
      continue;
    }
    exclusions[key] = exc;
  }
  return exclusions;
}

export function addListSelectors(program) {
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
    .option(
      "-x, --exclude <exclude>",
      "a file listing excluded selector implementations. use to reconcile or remove collisions. The format is the same as produced whenwhen -F json and --collisions-only are set"
    )
    .action((options) => listSelectors(program, options));
}

export function listSelectors(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  options.directories = options.directories ?? ["."];

  const loader = new FoundryFileLoader(options, r);
  loader.addDirectoryFinders(...options.directories);

  loader.load();
  if (!loader.foundInterfaces()) {
    r.out(
      `no interfaces found in directorys: ${options.directories.join(", ")}`
    );
    process.exit(1);
  }

  const [found, excluded] = loader.selectCuts(readExclusions(options.exclude));

  const collisions = [...found.resolve()];

  var rowOut = function (rows) {
    r.out(
      stringifyRows(rows, {
        format: options.format,
        absoloute: options.absoloute,
        replacer: null,
        space: 2,
      })
    );
  };

  if (options.format == "json") {
    r.out(found.toJson());
  }

  if (options.format == "info") {
    for (const co of found.toStructuredLines(options.absoloute)) {
      r.out(co.join("\n"));
    }

    return;
  }

  if (options.format !== "json" && options.format !== "info") {
    for (const rows of found.toLines(options.absoloute)) {
      if (!rows.length) continue;
      rowOut(rows);
    }
  }
  for (const [co, sel, sig] of excluded) {
    r.debug(`excluded: ${sel} ${sig} ${co.name} ${co.commonName}`);
  }

  if (collisions.length != 0) {
    r.out("*** collisions ***");
    for (const rows of collisions) {
      rowOut(rows);
    }
    process.exit(1);
  }
  process.exit(0);
}
