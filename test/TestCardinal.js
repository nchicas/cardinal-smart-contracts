let Cardinal = artifacts.require("Cardinal");

contract('Testing Cardinal', async (accounts) => {

    let instance;
    let bank = accounts[0];
    let cardholder = accounts[1];
    let cardId = web3.utils.fromUtf8('visa1024');
    let txLimit = 100;
    let monthLimit = 1000;

    it('Balance should starts with 0 ETH', async () => {
        instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);
        let balance = await web3.eth.getBalance(instance.address);

        assert.equal(balance, 0);
    });

    it('Should receive funds by address', async () => {
        instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);
        let one_eth = web3.utils.toWei('1', 'ether');
        await web3.eth.sendTransaction({from: cardholder, to: instance.address, value: one_eth});
        let balance_wei = await web3.eth.getBalance(instance.address);
        let balance_ether = web3.utils.fromWei(balance_wei, 'ether');

        assert.equal(balance_ether, 1);
    });

    it('Should receive funds by addFunds', async () => {
        instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);
        let one_eth = web3.utils.toWei('1', 'ether');
        await instance.addFunds.sendTransaction({from: cardholder, value: one_eth});
        let balance_wei = await web3.eth.getBalance(instance.address);
        let balance_ether = web3.utils.fromWei(balance_wei, 'ether');

        assert.equal(balance_ether, 1);
    });

    it('Should complete a transaction flow', async () => {
      instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);
      let one_eth = web3.utils.toWei('1', 'ether');
      await web3.eth.sendTransaction({from: cardholder, to: instance.address, value: one_eth});

      let amount = 100;

      await instance.requestFunds(
        web3.utils.fromUtf8("visa1024"),
        amount,
        web3.utils.fromUtf8("USD"),
        web3.utils.fromUtf8("a1b2c3d4"),
        {from: bank});

      await instance.completeTransaction(
        web3.utils.fromUtf8("visa1024"),
        web3.utils.fromUtf8("a1b2c3d4"),
        {from: bank});

      let balance_wei = await web3.eth.getBalance(instance.address);
      let price = amount * 1000;
      let balance_required = web3.utils.toWei('1', 'ether') - price;

      assert.equal(balance_wei, balance_required);
    });

    it('Should fail requesting funds if not bank', async () => {
      instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);
      try {
        await instance.requestFunds(
          web3.utils.fromUtf8("visa1024"),
          100,
          web3.utils.fromUtf8("USD"),
          web3.utils.fromUtf8("a1b2c3d4"),
          {from: cardholder});
      }
      catch(ex) {
        error = ex;
      }

      assert.notEqual(error, undefined);
    });

    it('Should fail requesting funds if locked', async () => {
      try {
        instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);

        await instance.requestFunds(
          web3.utils.fromUtf8("visa1024"),
          100,
          web3.utils.fromUtf8("USD"),
          web3.utils.fromUtf8("a1b2c3d4"),
          {from: bank});

        await instance.requestFunds(
          web3.utils.fromUtf8("visa1024"),
          100,
          web3.utils.fromUtf8("USD"),
          web3.utils.fromUtf8("a1b2c3d4"),
          {from: bank});
      }
      catch(ex) {
        error = ex;
      }

      assert.notEqual(error, undefined);
    });

    it('Should fail over tx limit', async () => {
      try {
        instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);

        await instance.requestFunds(
          web3.utils.fromUtf8("visa1024"),
          txLimit * 10,
          web3.utils.fromUtf8("USD"),
          web3.utils.fromUtf8("a1b2c3d4"),
          {from: bank});
      }
      catch(ex) {
        error = ex;
      }

      assert.notEqual(error, undefined);
    });

    it('Should fail over month limit', async () => {
      try {
        instance = await Cardinal.new(bank, cardholder, cardId, txLimit, monthLimit);

        for(let i=5; i<15; i++) {
          let referenceCode = 'c' + i;

          await instance.requestFunds(
            web3.utils.fromUtf8("visa1024"),
            txLimit,
            web3.utils.fromUtf8("USD"),
            web3.utils.fromUtf8(referenceCode),
            {from: bank});

          await instance.completeTransaction(
            web3.utils.fromUtf8("visa1024"),
            web3.utils.fromUtf8(referenceCode),
            {from: bank});
        }
      }
      catch(ex) {
        error = ex;
      }

      assert.notEqual(error, undefined);
    });

})