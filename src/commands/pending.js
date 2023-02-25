import { programConnect, resolveSigner } from "./connect.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { Reporter } from "../lib/reporter.js";

export async function pendingTransactions(program, options) {
  const r = Reporter.fromVerbosity(options.verbose);

  const opts = program.opts();
  const key = resolveHardhatKey(opts.deploykey);

  if ((!opts.deploykey && !options.address) || !program.opts().url ) {
    r.out(
      `a deploy key or address and also a url are required`
    );
    process.exit(1);
  }

  let address = options.address;
  let provider = programConnect(program, false, key);
  if (key) {
    address = provider.address;
  }
  const pending = await provider.getTransactionCount('pending');
  r.out(`${address} ${pending}`);
  const current = await provider.getTransactionCount();
  r.out(`${address} ${current}`);
}