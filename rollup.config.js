// derived from: https://github.com/rollup/rollup-starter-lib/blob/master/rollup.config.js
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import pkg from "./package.json" assert { type: "json" };

export default [
  {
    input: "deploycli.js",
    output: {
      inlineDynamicImports: true,
      name: pkg.name,
      file: pkg.deploycli,
      format: "es",
    },
    plugins: [json(), resolve(), commonjs()],
  },

  {
    input: "src/lib/main.js",
    output: {
      inlineDynamicImports: true,
      name: pkg.name,
      file: pkg.browser,
      format: "umd",
    },
    plugins: [json(), resolve(), commonjs()],
  },
  {
    // Note: it is faster to generate multiple builds from the same config
    // where possible
    input: "src/lib/main.js",
    external: ["ethers", "commander"],
    output: [
      {
        inlineDynamicImports: true,
        file: pkg.main,
        format: "cjs",
        sourcemap: true,
      },
      {
        inlineDynamicImports: true,
        file: pkg.module,
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: [json(), resolve(), commonjs()],
  },
];
