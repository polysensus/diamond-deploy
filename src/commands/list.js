import { Selectors } from "../lib/deployment/diamond/selectors.js";

import { FoundryFileLoader } from "../lib/deployment/loadersfs/foundry/loader.js";
import { Reporter } from "../lib/reporter.js";
import {
  FacetSelectorSet,
  FacetCutOpts,
} from "../lib/deployment/diamond/facet.js";

export function listSelectors(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  const loader = new FoundryFileLoader(options, r);
  loader.addDirectoryFinders(...options.directories);

  loader.load();

  const found = new FacetSelectorSet();

  for (const [name, iface, fileName, finder] of loader.list()) {
    const co = new FacetCutOpts({
      name,
      fileName,
      commonName: finder.commonName(fileName),
      finderName: finder.constructor.name,
      readerName: finder.reader.constructor.name,
      selectors: [],
      signatures: [],
    });

    for (const sel of new Selectors(iface).all()) {
      const f = iface.getFunction(sel);
      co.selectors.push(sel);
      co.signatures.push(f.format());
    }
    found.addFacet(co);
  }

  const collisions = [...found.resolve()]

  var rowOut = function (rows) {
    r.out(
      rows
        .map((row) =>
          [
            ...row.slice(0, row.length - 2),
            row[options.absoloute ? row.length - 1 : row.length - 2],
          ].join(" ")
        )
        .join("\n")
    );
  }

  if (options.format == "json") {
    r.out(found.toJson());
    return;
  }

  if (options.format == "info") {
    for (const co of found.toStructuredLines(options.absoloute)) {
      r.out(co.join("\n"));
    }

    return;
  }

  if (options.format !== "json" && options.format !== "info") {
    for (const rows of found.toLines(options.absoloute)) {
      if (!rows.length) continue
      rowOut(rows)
    }
  }

  if (collisions.length != 0) {
    r.out("*** collisions ***");
    for (const rows of collisions) {
      rowOut(rows)
    }
    process.exit(1)
  }
  process.exit(0)
}
