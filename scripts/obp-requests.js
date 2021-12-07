const fs = require('fs');
const airnodeProtocol = require('@api3/airnode-protocol');
const airnodeAbi = require('@api3/airnode-abi');
const airnodeAdmin = require('@api3/airnode-admin');
const CardinalArtifact = require('../artifacts/contracts/Cardinal.sol/Cardinal.json');

//
const apiProviderId = '0xc6323485739cdf4f1073c1b21bb21a8a5c0a619ffb84dd56c4f4454af2802a40';
const endpointId = '0xfaddd73f4f1146eac64d68006f7245da2bfa33c3d1be30e8ee757834a546a905';
const requestParams = [
  { name: '_path', type: 'bytes32', value: 'banks.0.id' },
  { name: '_type', type: 'bytes32', value: 'bytes32' },
];

const loadContract = async function (card) {
  // Get the config object created by setup.js
  const config = JSON.parse(fs.readFileSync(`.${card}.airnode-cardinal.config.json`));
  console.log('Using config: ' + JSON.stringify(config, null, 2));

  // Get the preconnected wallet from Hardhat
  const url = 'https://testnet.sovryn.app/rpc';
  const provider = new ethers.providers.JsonRpcProvider(url);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log(`Using wallet ${wallet.address} and Airnode ${config.airnodeContractAddress}`);

  // Get an instance of the Cardinal we deployed in setup.js
  config.cardinal = new ethers.Contract(cardinalAddress, CardinalArtifact.abi, wallet);
  config.wallet = wallet;

  return config;
};

const prepareContract = async function (card) {
  const config = await loadContract(card);

  // Get an instance if the Airnode RRP contract
  const airnode = new ethers.Contract(
    config.airnodeContractAddress,
    airnodeProtocol.AirnodeArtifact.abi,
    config.wallet
  );

  // Derive the designated wallet address
  const designatedWalletAddress = await airnodeAdmin.deriveDesignatedWallet(
    airnode,
    apiProviderId,
    config.requesterIndex
  );
  console.log(
    `Derived the designated wallet ${designatedWalletAddress} for requester index ${config.requesterIndex} by provider ${apiProviderId}`
  );

  // Check the designated wallet and make sure it's funded
  const designatedWalletBalance = await ethers.provider.getBalance(designatedWalletAddress);
  if (designatedWalletBalance >= 1e14) {
    // >= 0.0001 RBTC
    console.log(`Designated wallet ${designatedWalletAddress} has ${weiToEth(designatedWalletBalance)} RBTC`);
  } else {
    console.log(
      `Designated wallet ${designatedWalletAddress} has ${weiToEth(designatedWalletBalance)} RBTC, funding...`
    );
    const sendTxn = await config.wallet.sendTransaction({
      to: designatedWalletAddress,
      value: ethers.utils.parseEther('0.001'),
    });
    await sendTxn.wait();
  }

  return config;
};

const requestFunds = async function (cardId, amount, currency, referenceCode) {
  const config = await loadContract();
  const cardinal = config.cardinal;
  cardinal.requestFunds(
    ethers.utils.toUtf8Bytes(cardId),
    amount * 100,
    amount,
    ethers.utils.formatBytes32String(currency),
    ethers.utils.formatBytes32String(referenceCode)
  );
};

async function main() {
  // Make the request
  async function makeRequest() {
    const receipt = await cardinal.makeRequest(
      apiProviderId,
      endpointId,
      config.requesterIndex,
      designatedWalletAddress,
      airnodeAbi.encode(requestParams)
    );
    console.log(`Sent the request with transaction ${receipt.hash}`);

    return new Promise((resolve) =>
      wallet.provider.once(receipt.hash, (tx) => {
        const parsedLog = airnode.interface.parseLog(tx.logs[0]);
        resolve(parsedLog.args.requestId);
      })
    );
  }

  console.log(`Making the request to API provider ${apiProviderId} endpoint ${endpointId}...`);
  console.log('Request params: ' + JSON.stringify(requestParams, null, 2));

  const requestId = await makeRequest();
  console.log(`Completed the request with ID ${requestId}, waiting for fulfillment...`);

  // Listen for the event announcing that the request was fulfilled
  function fulfilled(requestId) {
    return new Promise((resolve) =>
      wallet.provider.once(airnode.filters.ClientRequestFulfilled(null, requestId), resolve)
    );
  }
  await fulfilled(requestId);
  console.log('Request fulfilled, getting response...');

  // Read the fulfilled result from the blockchain
  const result = showResult(await cardinal.fulfilledData(requestId));
  console.log(`Got response: ${result}`);
}

function weiToEth(wei, precision = 6) {
  return Number(ethers.utils.formatEther(wei)).toFixed(precision);
}

if (require.main === module) {
  const bank = process.env.BANK_ADDRESS;
  const cardholder = process.env.CARDHOLDER_ADDRESS;
  const cardId = process.env.CARD_ID;
  const txLimit = process.env.TX_LIMIT;
  const monthLimit = process.env.MONTH_LIMIT;

  main(bank, cardholder, cardId, txLimit, monthLimit)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = {
    crateContract: main,
  };
}
