import { ethers } from "ethers";
import { Reporter } from "../../reporter.js";
import { FacetCutOpts } from "./facet.js";
import { FacetCutAction } from "./selectors.js";

const isError = (v) => v?.constructor?.name === "Error";

export class DeployResult {
  static fromErr(err, msg = undefined) {
    return new DeployResult({ status: 1, msg, err });
  }

  static fromSuccess(address, tx, receipt, msg) {
    return new DeployResult({ address: address, status: 0, tx, receipt, msg });
  }

  static fromStatus(status, msg) {
    return new DeployResult({ status, msg });
  }
  static fromFailed(msg) {
    return DeployResult.fromStatus(1, msg);
  }
  static fromFaiedReceipt(receipt, tx, msg) {
    return new DeployResult({ status: 1, receipt, tx, msg, err });
  }

  constructor({ address, status, tx, receipt, msg, err }) {
    this.address = address;
    this.status = status;
    this.tx = tx;
    this.receipt = receipt;
    this._err = err;
    this.msg = msg;
  }

  isErr() {
    return this.status || this.err?.constructor?.name === "Error";
  }
  errmsg() {
    return this.msg || `${this.err} ${this.status}`;
  }
}

export class DiamondDeployer {
  constructor(reporter, signer, readers, options) {
    this.reset(reporter, signer, readers, options);
  }

  reset(reporter, signer, readers, options) {
    this.r = reporter ?? new Reporter(console.log, console.log);
    this.signer = signer ?? null;
    this.readers = readers;
    this.facetCuts = [];
    this.results = [];
    this.errors = [];

    this.options = options ?? {};

    this.options.diamondName = options.diamondName ?? "Diamond";
    this.options.diamondCutName = options.diamondCutName ?? "DiamondCutFacet";
    this.options.diamondLoupeName = options.diamondLoupeName ?? "DiamondLoupeFacet";
    this.options.diamondInitName = options.diamondInitName ?? "DiamondNew";

    this.ignoreNames = {};
    for (const name of options?.ignoreNames ?? []) {
      if (name == this.options.diamondName) {
        this.r.out(
          `can't ignore the diamond contract, we deal with it explicitly`
        );
        continue;
      }
      if (name == this.options.diamondCutName) {
        this.r.out(
          `can't ignore the diamond cut contract, we deal with it explicitly`
        );
        continue;
      }

      this.ignoreNames[name] = true;
    }

    this.diamond = options.diamond ?? null;
    this.diamondCut = null;
    this.diamondInit = null;

    // co.fileName -> co for loadCutOptions
    this._cutOptions = {};
  }

  loadCutOptions(reader, co) {

    if (this._cutOptions[co.fileName]) return this._cutOptions[co.fileName];
    co = loadCutOptions(reader, co);
    this._cutOptions[co.fileName] = co;
    return co;
  }

  async processERC2535Cuts(cuts, diamondAddress) {
    const ownerSigner = this.options.diamondOwner ?? this.signer;

    // first  pass, find the Diamond and DiamondCut interfaces
    for (let co of cuts) {
      // If we have all from previous iteration, then we are done.
      if (this.diamond && this.diamondCut && this.diamondLoupe) break;

      const reader = this.readers[co.readerName];
      if (!reader) {
        this.r.out(
          `reader ${co.readerName} not supported, skipping ${co.fileName}`
        );
        continue;
      }

      // Additionally, if we are provided with an address for a deployed
      // diamond, then bind contract instances for both the diamond and its
      // current cutter. Otherwise, just hang on to the interfaces and bytecode
      // for later deployment.
      if (co.name === this.options.diamondName) {
        co = this.loadCutOptions(reader, co);
        this.diamond = co;
        if (diamondAddress)
          this.diamond.c = new ethers.Contract(
            diamondAddress,
            co.iface,
            ownerSigner
          );
      } else if (co.name === this.options.diamondCutName) {
        co = this.loadCutOptions(reader, co);
        this.diamondCut = co;
        if (diamondAddress)
          this.diamondCut.c = new ethers.Contract(
            diamondAddress,
            co.iface,
            ownerSigner
          );
      } else if (co.name === this.options.diamondLoupeName) {
        co = this.loadCutOptions(reader, co);
        this.diamondLoupe = co;
        if (diamondAddress)
          this.diamondLoupe.c = new ethers.Contract(
            diamondAddress,
            co.iface,
            ownerSigner
          );
      } else {
        continue; // neither Diamond nor DiamondCut so skip
      }
      if (!(co.iface && co.bytecode && co.deployedBytecode && co.runtimeHash))
        throw Error(`missing interface of bytecode from ${co.fileName}`);
      // never delegated
      co.removeSignatures("init(bytes)");
    }

    if (!this.diamond)
      throw Error(
        `diamond options (and diamond abi) are required, even when upgrading`
      );
    if (!this.diamondCut)
      throw Error(
        `diamond cut interface options (and DiamondCut abi) are required`
      );
    if (!this.diamondLoupe)
      throw Error(
        `diamond loupe interface options (and DiamondLoupe abi) are required`
      );
  }

  /**
   * read the cut options for each entry in cuts 
   * @param {*} cuts 
   * @param {*} deployedCode optional, any cut option with a runtime hash found in this object is skipped.
   */
  *readCutOptions(cuts, deployedCode = undefined) {

    deployedCode = deployedCode ?? {}

    for (let co of cuts) {
      if (this.ignoreNames[co.name]) {
        this.r.out(`* ignoring ${co.name} as directed`);
        continue;
      }
      const reader = this.readers[co.readerName];
      if (!reader) {
        this.r.out(
          `reader ${co.readerName} not supported, skipping ${co.fileName}`
        );
        continue;
      }

      co = this.loadCutOptions(reader, co);

      // capture the Diamond, the facet options must be supplied even if we are
      // upgrading. We never deploy the diamond here. Use deploy-new if the
      // diamond code has actually changed.
      if (co.name === this.options.diamondName) {
        continue;
      }

      if (deployedCode[co.runtimeHash]) {
        this.r.out(
          `skipping ${co.name} matching code already deployed at @${
            deployedCode[co.runtimeHash]
          }`
        );
        continue;
      }
      yield co;
    }
  }

  /**
   * deploy each item in cuts that isn't a contract with specific deployment behavior in EIP 2535
   * specifically handled are named by the options see {@link reset}
   * - diamond - the sources are read but the contract is not deployed
   * - diamondCut - the sources are read and the contract is deployed
   * - diamondInit - the sources are read and the contract is deployed
   * Each of these is remembered on an instance attribute of the same name
   * @param {*} cuts
   */
  async processCuts(cuts) {
    const dryRunModeMsg = this.options.dryRun ? "[dry-run] " : "";

    const isNew = !(
      !!this.diamond.c &&
      !!this.diamondCut.c &&
      !!this.diamondLoupe.c
    );
    // now throw if we are in a wierd state where we have one or more but not all
    if (
      isNew &&
      (!!this.diamond.c || !!this.diamondCut.c || !!this.diamondLoupe.c)
    ) {
      throw new Error(
        `Can't upgrade safely, some, but not all, of the erc 2535 contracts are already bound`
      );
    }

    const selectorActions = {};
    const deployedCode = {}; // keccak(deployedCode) -> address

    // For each facet we successfully deploy determine if each selector it
    // implements is being *added* or *replaced". We can't use the discovered
    // list of facets on the currently deployed diamond as a baseline for
    // determining selectors to remove. Firstly because its awkward to require
    // the user to completely specify all abis for the currently deployed
    // diamond. And secondly, because even if they did, if the deployment fails
    // that would cause the 'not replaced' selector to get deleted.

    if (this.diamondLoupe.c) {
      const facets = await this.diamondLoupe.c.facets();
      for (const f of facets) {
        const code = await this.signer.provider.getCode(f.facetAddress);
        if (code != "0x") {
          deployedCode[ethers.utils.keccak256(ethers.utils.arrayify(code))] =
            f.facetAddress;
        }

        for (const s of f.functionSelectors) {
          // Note that the Add/Replace/Remove semantics of ERC 2535 guarantee
          // the same selector can not be set  (or set and orphaned) for
          // multiple facets.
          selectorActions[s] = { address: f.facetAddress };
        }
      }
    }

    // To detect deletions we need to start with all the discovered selectors
    // and then remove those that are found in the new facets. Those that remain
    // are the selectors we need to delete. The DiamondCut rules, and the
    // diamond proxy design, ensure that a selector can only be present on a
    // single facet at a time.
    // Note: For a new deploy selectorActions will be empty
    const selectorDeletes = {...selectorActions}
    for (const co of this.readCutOptions(cuts, deployedCode)) {
      for (const s of co.selectors) {
        delete selectorDeletes[s];
      }
    }

    // Now, ensure there is a single delete for each facet that implements any deleted selectors
    const facetDeletes = {}
    for (const s in selectorDeletes) {
      const selectors = facetDeletes[selectorDeletes[s].address] ?? [];
      selectors.push(s);
      facetDeletes[selectorDeletes[s].address] = selectors;
      this.r.out(
        `deleting selector ${s} included from @${selectorDeletes[s].address}`);
    }
    for (const address in facetDeletes) {
        this.facetCuts.push({
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.Remove,
          functionSelectors: facetDeletes[address],
        });
    }

    for (const co of this.readCutOptions(cuts, deployedCode)) {

      // note: we allow the DiamondCut implementation to be upgraded

      // never delegated
      co.removeSignatures("init(bytes)");

      // cut contracts are always deployed by the deployer key
      if (!this.options.dryRun) {
        const address = await this.tryDeploy(
          this.signer,
          co.iface,
          co.bytecode,
          co
        );
        if (isError(address)) continue;
        co.address = address;
      } else {
        this.r.out(`${dryRunModeMsg}skip deploy ${co.name}`);
      }

      if (co.name == this.options.diamondInitName) {
        if (!this.diamondInit) this.diamondInit = co;
        // this isn't a facet
        continue;
      }

      if (co.name == this.options.diamondCutName) {
        if (this.diamond.c && this.diamondCut.c) {
          // We can upgrade the cutter, but when we do we use the *old* cutter
          // on the *existing* diamond. Note we don't need to do any special
          // book keeping, if we have the old cutter then co.c.address !=
          // co.address
          this.r.debug(
            `${dryRunModeMsg}upgrading the cutter facet to ${co.address}`
          );
        } else {
          this.diamondCut = co;
          // the diamondCut is added in the diamond constructor
          continue;
        }
      }

      // Any selector that was deleted from one address may need to be added for another. This 

      const add = [];
      const replace = [];

      for (const s of co.selectors) {
        const a = selectorActions[s];

        // if it wasn't found on the deployed contract stick with 'Add'
        if (!a) {
          this.r.debug(`add ${s} ${co.name}`);
          add.push(s)
          continue;
        }

        // Otherwise we are replacing
        replace.push(s);

        this.r.debug(`replace ${s} ${co.name}`);
      }

      // note for dry-run mode co.address is undefined
      if (!isError(co.address)) {
        if (add.length > 0) {
          this.facetCuts.push({
            facetAddress: co.address,
            action: FacetCutAction.Add,
            functionSelectors: add,
          });
        }
        if (replace.length > 0) {
          this.facetCuts.push({
            facetAddress: co.address,
            action: FacetCutAction.Replace,
            functionSelectors: replace,
          });
        }
      }
    }
  }

  /**
   * returns true if we have captured everything needed to deploy or upgrade the diamond contract
   * @returns {boolean}
   */
  canDeploy() {
    return (
      this.diamond &&
      this.diamondCut &&
      this.diamondCut.iface &&
      ((this.diamondCut.c?.address ?? this.diamondCut.address) ||
        (this.diamond.c?.address ?? this.diamond.address)) &&
      this.signer &&
      this.errors.length === 0
    );
  }

  async deploy() {
    if (!this.canDeploy())
      throw new Error(
        `unable to deploy, errors or missing a signer or missing contracts for essential EIP 2535 behaviour`
      );

    var co = this.diamond;

    const ownerSigner = this.options.diamondOwner ?? this.signer;
    const ownerAddress = await ownerSigner.getAddress();

    if (!this.diamond.c) {
      this.diamond.address = await this.tryDeploy(
        // We always *deploy* the diamond with the deployment key
        this.signer,
        co.iface,
        co.bytecode,
        co,
        // If the owner key is provided, it becomes the owner account, diamondCut must be executed with this account.
        ownerAddress,
        this.diamondCut.address
      );

      this.diamondCut.c = new ethers.Contract(
        this.diamond.address,
        this.diamondCut.iface,
        ownerSigner
      );
    }
    if (!this.diamondCut.c) {
      this.diamondCut.c = new ethers.Contract(
        this.diamond.c.address,
        this.diamondCut.iface,
        ownerSigner
      );
    }

    let diamondInitAddr, initCalldata;
    if (!this.diamondInit?.address) {
      diamondInitAddr = ethers.constants.AddressZero;
    } else {
      diamondInitAddr = this.diamondInit.address;
      if (this.options.diamondInitArgs) {
        const args = JSON.parse(this.options.diamondInitArgs);
        initCalldata = this.diamondInit.iface.encodeFunctionData("init", args);
      }
    }
    if (this.facetCuts.length === 0)
      return new DeployResult({
        status: 0,
        msg: `diamond @${this.diamond.c.address} nothing to do or all up to date`,
      });

    const tx = await this.diamondCut.c.diamondCut(
      this.facetCuts,
      diamondInitAddr,
      initCalldata ?? "0x"
    );
    const receipt = await tx.wait();
    if (!receipt.status)
      return DeployResult.fromFaiedReceipt(
        receipt,
        tx,
        `Diamond upgrade failed: ${tx.hash}`
      );

    return DeployResult.fromSuccess(
      this.diamond.c?.address ?? this.diamond.address,
      tx,
      receipt,
      `Diamond@${
        this.diamond.c?.address ?? this.diamond.address
      }, upgrade ok: tx=${tx.hash}`
    );
  }

  /**
   * Attempt a deploy and return the result if successful. if an exception
   * occurs *catch* it and return it. errors are also accumulated internaly.
   *
   * If operating in offline mode (no signer provided) the returned result is an
   * unsigned transaction, otherwise it is the deployed address of the contract.
   *
   * @param {ethers.Interface} iface  {@link https://docs.ethers.org/v5/api/utils/abi/interface/#Interface}
   * @param {string} bytecode
   * @param {FacetCutOpts} co
   * @param  {...any} args
   * @returns {string|import('ethers').UnsignedTransaction|erorr} address, unsigned transaction or an error
   */
  async tryDeploy(signer, iface, bytecode, co, ...args) {
    try {
      const overrides = {};
      if (
        this.options?.gaslimit ||
        this.options?.gasprice ||
        this.options?.legacy
      ) {
        if (this.options?.gaslimit)
          overrides.gasLimit = Number.parseInt(this.options?.gaslimit);
        if (this.options?.gasprice)
          overrides.gasPrice = ethers.utils.parseUnits(
            this.options?.gasprice,
            "gwei"
          );
        if (this.options?.legacy) overrides.type = 0;
      }

      if (this.options?.replace) {
        const pendingNonce = await signer.getTransactionCount("pending");
        const current = await signer.getTransactionCount();
        if (pendingNonce != current) {
          this.r.out(
            `${
              pendingNonce - current
            } pending transaction, replacing ${current}`
          );
          overrides.nonce = current;
        }
      }
      if (Object.keys(overrides).length > 0) args.push(overrides);

      // facets are not allowed constructor arguments
      const [address, tx, msg] = await deployContract(
        this.r,
        iface,
        bytecode,
        signer,
        co,
        ...args
      );
      this.r.out(msg);
      this.results.push(tx ?? msg);
      return tx ?? address;
    } catch (err) {
      console.log(`${err}`);
      this.errors.push([co, err]);
      return err;
    }
  }

  reporterrs() {
    if (!this.errors?.length) return;

    for (const [co, err] of this.errors)
      this.r.out(
        `error creating deploy transaction for ${co.commonName} ${err}`
      );
  }
  report() {
    this.r.out(
      JSON.stringify(
        this.results.map((r) => r.data),
        null,
        2
      )
    );
  }
}

/**
 * use the reader instance to read the compiler output from the cut options co
 * @param {BaseReader} reader
 * @param {FacetCutOpts} co
 * @returns {[import('ethers').Interface, string, object]} - [abi contract interface, the bytecode and the compiler output]
 */
export function loadCutOptions(reader, co) {
  const solOutput = reader.readJson(co.fileName);
  const iface = new ethers.utils.Interface(solOutput.abi);
  co.iface = iface;
  co.bytecode = solOutput.bytecode;
  co.deployedBytecode = solOutput.deployedBytecode;
  co.runtimeHash = ethers.utils.keccak256(
    ethers.utils.arrayify(co.deployedBytecode.object)
  );
  co.sol = solOutput;
  return co;
}

export async function deployContract(r, iface, bytecode, signer, co, ...args) {
  const factory = new ethers.ContractFactory(iface, bytecode, signer);

  if (signer) {
    const facet = await factory.deploy(...args);
    r.info(
      `from: ${facet.deployTransaction.from} contract@${facet.address} deploy tx: ${facet.deployTransaction.hash}`
    );
    await facet.deployed();
    const msg = `deployed facet ${co.name}@${facet.address}`;
    return [facet.address, null, msg];
  } else {
    const tx = factory.getDeployTransaction();
    return [
      ethers.constants.AddressZero,
      tx,
      `deploy calldata for facet ${co.name}`,
    ];
  }
}
