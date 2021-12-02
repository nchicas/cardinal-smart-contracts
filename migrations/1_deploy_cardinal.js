const Cardinal = artifacts.require('Cardinal');

module.exports = function (deployer, network, accounts) {
  const bank = accounts[0];
  const cardholder = accounts[1];
  const cardId = web3.utils.fromUtf8("visa1024");
  const txLimit = 100;
  const monthLimit = 1000;

  deployer.deploy(Cardinal, bank, cardholder, cardId, txLimit, monthLimit);
};
