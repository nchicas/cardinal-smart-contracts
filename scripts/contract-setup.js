const fs = require('fs');
const ethers = require('ethers');
const airnodeProtocol = require('@api3/airnode-protocol');
const airnodeAdmin = require('@api3/airnode-admin');
const CardinalArtifact = require('../artifacts/contracts/Cardinal.sol/Cardinal.json');
require('dotenv').config();

const createContract = async function (cardholder, cardId, txLimit, monthLimit) {
  try {
    // Get the config object with Airnode and API info
    const config = {
      airnodeContractAddress: '0x1190a5e1f2afe4c8128fd820a7ac85a95a9e6e3e',
    };

    // Get the preconnected
    const url = 'https://testnet.sovryn.app/rpc';
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log(`Using wallet ${wallet.address} and Airnode contract ${config.airnodeContractAddress}`);

    // Create a requester record
    const airnode = new ethers.Contract(config.airnodeContractAddress, airnodeProtocol.AirnodeArtifact.abi, wallet);

    config.requesterIndex = await airnodeAdmin.createRequester(airnode, wallet.address);
    console.log(`Created requester at index ${config.requesterIndex}`);

    // Deploy Cardinal contract
    const CardinalFactory = new ethers.ContractFactory(CardinalArtifact.abi, CardinalArtifact.bytecode, wallet);
    const cardinal = await CardinalFactory.deploy(
      airnode.address,
      wallet.address,
      cardholder,
      ethers.utils.toUtf8Bytes(cardId),
      txLimit * 100,
      monthLimit * 100
    );
    await cardinal.deployed();
    config.cardinalAddress = cardinal.address;
    console.log(`Cardinal contract deployed at address ${config.cardinalAddress}`);

    // Endorse Cardinal contract with the requester
    await airnodeAdmin.endorseClient(airnode, config.requesterIndex, cardinal.address);
    console.log(`Endorsed ${cardinal.address} by requester with index ${config.requesterIndex}`);

    // Store the config with the newly generated included info to use in make-request.js
    const configFileName = `.${cardId}.airnode-cardinal.config.json`;
    const configData = JSON.stringify(config, null, 2);
    fs.writeFileSync(configFileName, configData);
    console.log(`Generated ${configFileName}: ${configData}`);

    return cardinal.address;
  } catch (ex) {
    console.error(ex);
    return null;
  }
};

if (require.main === module) {
  const cardholder = process.env.CARDHOLDER_ADDRESS;
  const cardId = process.env.CARD_ID;
  const txLimit = process.env.TX_LIMIT;
  const monthLimit = process.env.MONTH_LIMIT;

  createContract(cardholder, cardId, txLimit, monthLimit)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = {
    createContract,
  };
}
