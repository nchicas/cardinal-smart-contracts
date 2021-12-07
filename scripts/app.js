require('dotenv').config();
const localtunnel = require('localtunnel');
const express = require('express');
const app = express();
const port = 3000;
const cardinal = require('./contract-setup.js');
const obp = require('./obp-requests.js');

app.use(express.json());

app.get('/hello', (req, res) => {
  res.send('Cardinal is running!');
});

app.post('/create-contract', async (req, res) => {
  const contract_address = await cardinal.createContract(
    req.body.cardholder_address,
    req.body.card_id,
    req.body.transaction_limit,
    req.body.month_limit
  );

  if (contract_address !== null) {
    res.json({ contract_address: contract_address }, 201);
  } else {
    res.json({ error: 'Contract not deployed, please check the data sent' }, 500);
  }
});

app.post('/request-funds', async (req, res) => {
  const transactionId = await obp.requestFunds(req.body.card, req.body.amount);
});

app.post('/confirm-transaction', async (req, res) => {
  res.send('Cardinal is running!');
});

localtunnel(port, { subdomain: 'cardinal' }, (err, tunnel) => {
  const server = app.listen(port, () => {
    console.log('Listening at: ' + tunnel.url);
  });
  server.setTimeout(500000);
});
