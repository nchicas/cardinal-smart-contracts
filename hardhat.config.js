require('@nomiclabs/hardhat-waffle');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: '0.6.12',
  networks: {
    testnet: {
      url: 'https://testnet.sovryn.app/rpc',
      accounts: ['b8e1112b588014bbda10799a15659d2507cff99a0e806a735364869a4b517d91'],
    },
  },
};
