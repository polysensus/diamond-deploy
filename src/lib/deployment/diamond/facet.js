import { signatureSelector } from "../abiutil.js";

/**
 * Accumulate a set of {@link FacetCutOpts} on an 'as is' basis.
 */
export class FacetSelectorSet {
  constructor() {
    this.reset();
  }
  reset() {
    this.cutterOpts = [];
    this.table = [];
  }

  *resolve() {
    for (const [start, end] of this.conflictedRowSlices()) {
      yield this.table.slice(start, end);
    }
  }

  *conflictedRowSlices() {
    this.table.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    // detect sequential runs of matching selectors
    var istart = 0;
    for (var i = 1; i < this.table.length; i++) {
      if (this.table[istart][0] === this.table[i][0]) continue;

      // different, we either have two consencutive items which are different
      // OR we have a run of collisions in [istart - i)
      if (i - istart > 1) {
        yield [istart, i];
      }
      istart = i;
    }
  }

  /** Add a list of facets. Each entry may optionaly be an object representation
   * of or an instance of {@link FacetCutOpts}
   * @param {Object | FacetCutOpts } facets
   */
  addFacetList(facets) {
    for (var co of facets) {
      if (co.constructor?.name == "Object") {
        co = FacetCutOpts(co);
      }
      this.addFacet(co);
    }
  }

  /**
   * Add a single facet to the set.
   * (This is most typically overriden by derived classes)
   * @param {FacetCutOpts} co
   */
  addFacet(co) {
    this.cutterOpts.push(co);
    this.table.push(...co.toRows());
  }

  /**
   * yield the cut option instances as sets of lines appropriate for printing to a terminal or log file.
   * Note that *each* item is a set of lines describing a single {@link FacetCutOpts}
   * @returns {[FacetCutOpts.toLines]}
   */
  *toLines() {
    for (const co of this.cutterOpts) {
      yield co.toLines();
    }
  }
  *toStructuredLines(fullNames = false) {
    for (const co of this.cutterOpts) {
      yield co.toStructuredLines(fullNames);
    }
  }

  *toObjects() {
    for (const co of this.cutterOpts) {
      yield co.toObject();
    }
  }

  toJson() {
    return JSON.stringify([...this.toObjects()], null, 2);
  }
}

export class FacetCutOpts {
  constructor({
    name,
    fileName,
    commonName,
    finderName,
    readerName,
    selectors,
    signatures,
  } = {}) {
    this.name = name;
    this.fileName = fileName;
    this.commonName = commonName;
    this.finderName = finderName;
    this.readerName = readerName;
    this.selectors = [...selectors];
    this.signatures = [...signatures];
  }

  /** removeSignature removes a signature and its associated selector
   * @param {*} signature
   */
  removeSignatures(...signatures) {
    for (const sig of signatures) {
      const selector = signatureSelector(sig);
      this.signatures = [...this.signatures.filter((s) => s != sig)];
      this.selectors = [
        ...this.selectors.filter((s) => s != signatureSelector(sig)),
      ];
    }
  }

  toJson() {
    return JSON.stringify(this.toObject());
  }

  /**
   *
   * @returns {["name, commonName | fileName"], [..."  selector signature"]}
   */
  toStructuredLines(fullNames = false) {
    const parts = [
      `${this.name} ${fullNames ? this.fileName : this.commonName}`,
    ];
    for (var i = 0; i < this.selectors.length; i++) {
      parts.push(`  ${this.selectors[i]} ${this.signatures[i]}`);
    }
    return parts;
  }

  /** Return the cut information as rows for table like accumulation.
   *
   * Note that if you join each row into a single line and sort along with the
   * rows from other cuts you will see the clashes due to lexical ordering
   * @returns {["selector", "signature", "name", "commonName" | "fileName"]}
   */
  *toRows() {
    for (var i = 0; i < this.selectors.length; i++) {
      yield [
        this.selectors[i],
        this.signatures[i],
        this.name,
        this.commonName,
        this.fileName,
      ];
    }
  }
  toLines() {
    return [...this.toRows()];
  }
  toObject() {
    return {
      name: this.name,
      fileName: this.fileName,
      commonName: this.commonName,
      finderName: this.finderName,
      readerName: this.readerName,
      selectors: this.selectors,
      signatures: this.signatures,
    };
  }
}
