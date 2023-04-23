import { ethers } from "ethers";
import { isFile, readHexKey } from "./fsutil.js";
import { readKey } from "./readkey.js";
import { resolveHardhatKey } from "./hhkeys.js";
import { asL2Provider } from  "@eth-optimism/sdk";

export function programConnect(program, polling = false, key = null) {
  const url = program.opts().url;
  const optimism = program.opts().optimism;

  let provider;
  if (!polling) {
    provider = new ethers.providers.StaticJsonRpcProvider(url);
  } else {
    provider = new ethers.providers.JsonRpcProvider(url);
  }

  // optimism does not require a special provider, however if it is enabled it
  // has extra features (which are completely compatible with regular providers)
  if (optimism) {
    provider = asL2Provider(provider);
  }

  let signer = key ?? program.opts().key;
  if (signer) {
    if (isFile(signer)) {
      signer = readHexKey(signer);
    }
    signer = resolveHardhatKey(signer);
    signer = new ethers.Wallet(signer, provider);
  }
  return signer ? signer : provider;
}

export function urlConnect(url, opts) {
  let { key, polling, optimism } = opts;

  let provider;
  if (!polling) {
    provider = new ethers.providers.StaticJsonRpcProvider(url);
  } else {
    provider = new ethers.providers.JsonRpcProvider(url);
  }
  // optimism does not require a special provider, however if it is enabled it
  // has extra features (which are completely compatible with regular providers)
  if (optimism) {
    provider = asL2Provider(provider);
  }

  let signer = readKey(key);
  if (signer) {
    signer = new ethers.Wallet(signer, provider);
  }
  return signer ? signer : provider;
}

export function resolveSigner(candidateKey, provider, defaultSigner) {
  if (!candidateKey) {
    return defaultSigner;
  }

  let signer = candidateKey;
  if (isFile(candidateKey)) {
    signer = readHexKey(signer);
  }
  signer = resolveHardhatKey(signer);
  if (!signer) return defaultSigner;

  return new ethers.Wallet(signer, provider);
}
