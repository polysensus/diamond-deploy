import { ethers } from "ethers";

const ERC165ABI = [
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const erc165Interface = new ethers.utils.Interface([
  "function supportsInterface(bytes4 interfaceId) external view returns (bool)",
]);
// const erc165Interface = new ethers.utils.Interface(ERC165ABI);
const erc165InterfaceId = "0x01ffc9a7"; // The ERC165 interface ID
const diamondCutFacetId = "0x1f931c1c";

/**
 * Derive the address the externaly owned account last deployed a contract to.
 * Assuming that the last transaction for that address _was_ a contract
 * deployment.
 * @param {object} provider to access the chain
 * @param {string} from account that deployed the contract
 * @param {object} options. the log property is used for reporting. the nonce
 * sets the account nonce from which to start (we search down to zero)
 */
export async function deriveContractAddress(
  provider,
  from,
  { nonce, log } = { nonce: undefined, log: undefined }
) {
  // Note: if the provider is a signer then getTransactionCount is specifically
  // bound to the signer's wallet and passing an additional address just breaks.

  if (!log) log = console;

  nonce = nonce ? Number.parseInt(nonce) : undefined;

  provider = provider.provider ?? provider;
  if (!nonce) {
    try {
      // nonce - 1 is the nonce of the *last* transaction on the account. We
      // scan back from here to find the most recently deployed contract
      // supporting the IDiamond interface.

      nonce = (await provider.getTransactionCount(from)) - 1;
      if (nonce < 0) {
        log.info(`contract not deployed, nonce is zero for ${from}`);
        return;
      }
    } catch (e) {
      log.info(`error getting nonce for ${from}: ${JSON.stringify(e)}`);
      return;
    }
  }

  for (; nonce > 0; nonce--) {
    const addr = ethers.utils.getContractAddress({ from, nonce });
    try {
      const code = await provider.getCode(addr);
      if (code.object === "0x") continue;
      const c = new ethers.Contract(addr, erc165Interface, provider);
      // Does it support ERC165, if not it is not the diamond
      if (!(await c.supportsInterface(erc165InterfaceId))) continue;
      if (!(await c.supportsInterface(diamondCutFacetId))) continue;
      return addr;
    } catch (err) {
      log.info(`error checking code from @${from} nonce ${nonce}`);
    }
  }
  return undefined;
}
