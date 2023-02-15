import fs from "fs";

import { BaseReader } from "../finder.js";

export class FileReader extends BaseReader {
  contructor(reporter) {
    this.r = reporter;
  }
  readJson(foundname) {
    // allow basic io errors to buble up
    const content = fs.readFileSync(foundname, "utf-8");
    try {
      return JSON.parse(content);
    } catch (err) {
      if (this.r) this.r.info(`failed to parse ${foundname}: ${err}`);
      return null;
    }
  }
  readAbi(foundname) {
    return this.readJson(foundname);
  }
}
