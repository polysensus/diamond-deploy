import { ethers } from "ethers";
import { isFile, readHexKey } from "./fsutil.js";
import { resolveHardhatKey } from "./hhkeys.js";

export function programConnect(program, polling = false, key = null) {
  const url = program.opts().url;

  let provider;
  if (!polling) {
    provider = new ethers.providers.StaticJsonRpcProvider(url);
  } else {
    provider = new ethers.providers.JsonRpcProvider(url);
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
