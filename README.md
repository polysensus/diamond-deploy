# diamond-deploy

ERC 2535 deployment package. cli tool and package

The tool provides commands for discovering and deploying smart contract facets
written to the ERC 2535 standard.

The `list` command finds deployable contract artifacts in foundry build outputs
and can produce an 'exclusions' file to reconcile function selector collisions
across diamond facet implementations.

The `diamond-new` command uses the outputs of list to deploy a new diamond instance.

Example workflow follows

## Run a list to find the artifacts

This example lists the contracts whose names end with `Facet` and additionally
find the `Diamond` and `DiamondNew` artifacts. By default the output is human
readable and relatively concise

    >> node deploycli.js list -i ./contracts/build/forge/out -I facet -n Diamond DiamondNew

    0x1f931c1c diamondCut((address,uint8,bytes4[])[],address,bytes) DiamondCutFacet DiamondCutFacet.sol/DiamondCutFacet.json
    0xcdffacc6 facetAddress(bytes4) DiamondLoupeFacet DiamondLoupeFacet.sol/DiamondLoupeFacet.json
    0x52ef6b2c facetAddresses() DiamondLoupeFacet DiamondLoupeFacet.sol/DiamondLoupeFacet.json
    0xadfca15e facetFunctionSelectors(address) DiamondLoupeFacet DiamondLoupeFacet.sol/DiamondLoupeFacet.json
    0x7a0ed627 facets() DiamondLoupeFacet DiamondLoupeFacet.sol/DiamondLoupeFacet.json
    0x01ffc9a7 supportsInterface(bytes4) DiamondLoupeFacet DiamondLoupeFacet.sol/DiamondLoupeFacet.json
    0x4e41cf1e init((string[])) DiamondNew DiamondNew.sol/DiamondNew.json
    0x6dcfd841 accountsByToken(uint256) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x00fdd58e balanceOf(address,uint256) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x4e1273f4 balanceOfBatch(address[],uint256[]) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0xa52169a4 createGame(uint256,string) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0xe985e9c5 isApprovedForAll(address,address) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x731133e9 mint(address,uint256,uint256,bytes) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x1f7fdffa mintBatch(address,uint256[],uint256[],bytes) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x2eb2c2d6 safeBatchTransferFrom(address,address,uint256[],uint256[],bytes) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0xf242432a safeTransferFrom(address,address,uint256,uint256,bytes) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0xa22cb465 setApprovalForAll(address,bool) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x02fe5305 setURI(string) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x01ffc9a7 supportsInterface(bytes4) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x85bff2e7 tokensByAccount(address) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x13ba55df totalHolders(uint256) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0xbd85b039 totalSupply(uint256) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x0e89341c uri(uint256) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json
    0x8da5cb5b owner() OwnershipFacet OwnershipFacet.sol/OwnershipFacet.json
    0xf2fde38b transferOwnership(address) OwnershipFacet OwnershipFacet.sol/OwnershipFacet.json
    *** collisions ***
    0x01ffc9a7 supportsInterface(bytes4) DiamondLoupeFacet DiamondLoupeFacet.sol/DiamondLoupeFacet.json
    0x01ffc9a7 supportsInterface(bytes4) ERC1155ArenaFacet ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json

## Run a list to find the the colliding selectors and make an exclusion file

To get a list of just the exclusions and to format the output in json do

    >> node deploycli.js list -i ./contracts/build/forge/out -I facet -n Diamond DiamondNew --collisions-only --format json

    [
      {
        "selector": "0x01ffc9a7",
        "signature": "supportsInterface(bytes4)",
        "name": "DiamondLoupeFacet",
        "commonName": "DiamondLoupeFacet.sol/DiamondLoupeFacet.json",
        "fileName": "/home/robin/polysensus/chaintrap-contracts/build/forge/out/DiamondLoupeFacet.sol/DiamondLoupeFacet.json"
      },
      {
        "selector": "0x01ffc9a7",
        "signature": "supportsInterface(bytes4)",
        "name": "ERC1155ArenaFacet",
        "commonName": "ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json",
        "fileName": "/home/robin/polysensus/chaintrap-contracts/build/forge/out/ERC1155ArenaFacet.sol/ERC1155ArenaFacet.json"
      }
    ]

Store the out put from the previous command in a .json file and delete the entry you want to keep. The resulting file is a list of the selectors to *exclude* which can be passed to the deployment commands. And also the the list commands so that they can reconcile colisions.

## Run list with the exclusions reconciling the selectors to discard

Assuming you called the file `exclude.json` do

    >> node deploycli.js list -i ./contracts/build/forge/out -I facet -n Diamond DiamondNew --exclusions exclude.json

No collisions will be reported.

## Deploy the reconciled contract artifacts

Now do (assuming hard hat server running on http://localhost:8545)

    >> node deploycli.js list -i ./contracts/build/forge/out -I facet -n Diamond DiamondNew --exclusions exclude.json --format json | tee facets.json
    ... json formatted list of things to deploy
    >> node deploycli.js diamond-new -u http://localhost:8545 --deploykey hardhat --facets facets.json

    deployed facet ArenaCallsFacet@0xeF31027350Be2c7439C1b0BE022d49421488b72C
    deployed facet ArenaFacet@0x12Bcb546bC60fF39F1Adfc7cE4605d5Bd6a6A876
    deployed facet ArenaTranscriptsFacet@0xaC47e91215fb80462139756f43438402998E4A3a
    deployed facet DiamondCutFacet@0x9BcC604D4381C5b0Ad12Ff3Bf32bEdE063416BC7
    deployed facet DiamondLoupeFacet@0x63fea6E447F120B8Faf85B53cdaD8348e645D80E
    deployed facet DiamondNew@0xdFdE6B33f13de2CA1A75A6F7169f50541B14f75b
    deployed facet ERC1155ArenaFacet@0xaC9fCBA56E42d5960f813B9D0387F3D3bC003338
    deployed facet OwnershipFacet@0x38A70c040CA5F5439ad52d0e821063b0EC0B52b6
    deployed facet Diamond@0x54B8d8E2455946f2A5B8982283f2359812e815ce
    Diamond upgrade success: 0x6a9c48d24b831e8b1e694c8143e0d6a827bbd57d4c38420d91622b8b0a96fd85


For deployment the init parameters for the nominated DiamondInit contract can be
supplied on the command line. See `--diamond-init-args` and related options.

The tool has a copy of the well known hard hat keys for convenience. You can
also provide your own via ENV or option.

# things under consideration

- write a lot of tests
- diamond-upgrade command
- diamond deploy multi-init lib support
- list support for hardhat and other tooling
- list support for npm based online packages
- conditional upgrade support based on runtime code hash
- create2 based deployment

The list command can be used to detect function selector collisions across
diamond facet implementations. And solidity compiler outputs from foundry and
reconcile function selectors where two diamond facet implementations
