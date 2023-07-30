import { readJson } from "./fsutil.js";

import { FoundryFileLoader } from "../lib/deployment/loadersfs/foundry/loader.js";
import { Reporter } from "../lib/reporter.js";
import {
  facetRowObject,
  stringifyRows,
} from "../lib/deployment/diamond/facet.js";
import { listSelectors } from "./list.js";

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

export function addSelector(program) {
  program
    .command("select")
    .summary(
      "uniquiely resolve (select) the selectors for each discovered abi file"
    )
    .description(
      `uniquely resolve (select) the contract and libary selectors. Use --format json to
produce output that can be consumed by deploy-new and deploy`
    )
    .option("-v, --verbose [count]", "more verbose reporting")
    .option(
      "-C, --show-collisions",
      "show collisions without attempting to resolve them"
    )
    .option(
      "-E, --select-excluded",
      `the output should be the selections to
*exclude*. Use this to generate the input file for any command that supports --exclude`
    )
    .option("-i, --directories <includedirs...>")
    .option(
      "-I, --includeclasses <classes...>",
      "facet is the only supported class for now"
    )
    .option(
      "-n, --names <names...>",
      "The interface names to include selectors from. When there is a colision, the selector from the earliest listed name is prefered"
    )
    .option("-a, --absoloute", "output absoloute filenames")
    .option(
      "-x, --exclude <exclude>",
      "a file listing excluded selector implementations. use to reconcile or remove collisions. The format is the same as produced whenwhen -F json is set"
    )
    .option(
      "-s, --select <selections...>",
      `To avoid having to list all the facet names in --names to resolve a
conflict, list only those names that have a conflict in this option`
    )
    .action((options) => select(program, options));
}

export function select(program, options) {
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

  const [found] = loader.selectCuts(readExclusions(options.exclude));

  const collisions = [...found.resolve()];
  if (options.showCollisions) {
    const rows = [];
    for (const col of collisions)
      for (const row of col) rows.push(facetRowObject(row));
    r.out(JSON.stringify(rows, null, "  "));
    process.exit(0);
  }
  const select =
    options.select && options.select.length !== 0
      ? options.select
      : options.names || [];

  const rows = [];
  for (const conflictedRows of collisions) {
    if (conflictedRows.lenght === 0) continue;
    // If first found (according to the finders and the loader) is not what the
    // caller wants --name or --select can be used to control the priority. It
    // is common for the structure of 3rdparty contracts to cause the same code
    // to be present in multiple facets. As the storage is shared between the
    // facets, it doesn't actually matter what copy is selected. Explicit
    // resolution is only necessary when the same method signature has two
    // different implementations. So picking 'first found' is actually a useful
    // and sensible default strategy.
    const iSelected = 0;
    const selected = facetRowObject(conflictedRows[iSelected]);
    const bestSelect = select.length - 1;

    for (let i = 0; select.length > 0 && i < conflictedRows.length; i++) {
      const row = facetRowObject(conflictedRows[i]);
      // Notice that if a row does not match *any* select name, we fall back to
      // the default 'first found'. This is to avoid forcing the caller to
      // tediously list all the collisions - if they have to do that they may as
      // well just write a custom deployer. Note also, this assumes we don't get
      // a selector clash in the same contract.
      for (let j = 0; j < select.length && j < bestSelect; j++) {
        if (!select[j] || row.name === select[j]) continue;
        bestSelect = j;
        selected = row;
      }
    }
    if (!options.selectExcluded) {
      rows.push(selected);
      continue;
    }
    if (conflictedRows.length <= 1) continue;

    // when generating exclusions which resolve the conflicts, add the rows that are *not* selected.
    for (let i = 0; i < conflictedRows.length; i++) {
      if (i === iSelected) continue;
      rows.push(facetRowObject(conflictedRows[i]));
    }
  }

  r.out(JSON.stringify(rows, null, "  "));
  process.exit(0);
}
