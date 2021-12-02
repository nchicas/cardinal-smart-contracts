/*
 * Cardinal: Smart virtual debit card funded by Bitcoins
 * 
 * Cardinal connects with banks using OBP standard to provide a virtual debit card to its clients,
 * the transactions with the card are funded with a Bitcoin wallet from the client and transferred
 * to the bank, so the bank can act as a liquidity pool for the card networks.
 *
 * Version: 0.1.0
 *
 */

//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

//import "@api3/airnode-protocol/contracts/AirnodeClient.sol";

contract Cardinal /*is AirnodeClient*/ {

    enum State { None, Initiated, Completed, Reverted }

    struct Transaction {
        bytes32 currency;
        uint256 amountFIAT;
        uint256 amountBTC;
        State state;
        uint256 timestamp;
    }

    event FundsAdded(uint256 amount);
    event PaymentCompleted(uint256 amount);
    event PaymentDeclined();

    address payable public bank;
    address public cardholder;
    bytes32 internal cardId;
    uint256 internal maxAmountPerTx;
    uint256 internal maxAmountPerMonth;

    uint256 internal transactionCount;
    mapping (bytes32 => Transaction) internal transactions;
    mapping (uint256 => bytes32) internal references;
    uint256 internal lastLocked;

    // To subscribe to this contract is required
    // Bank: Address of the bank to transfer the funds  
    // Cardholder: Address of the cardholder to get the funds 
    // Card ID: Smart virtual debit card associated with the contract
    // Maximum amount per transaction: The maximum amount allowed to be processed per transaction
    // Maximum amount per month: The maximum cumulative amount allowed to be processed in the last 30 days
    constructor(
        address payable _bank, 
        address _cardholder, 
        bytes32 _cardId,
        uint256 _maxAmountPerTx,
        uint256 _maxAmountPerMonth)
            public 
    {
        cardholder = _cardholder;
        bank = _bank;
        cardId = _cardId;
        maxAmountPerTx = _maxAmountPerTx;
        maxAmountPerMonth = _maxAmountPerMonth;

        transactionCount = 0;
        lastLocked = 0;
    }

    // Add funds to the card
    function addFunds() 
        external 
        payable 
        onlyCardholder 
        returns (uint256) 
    {
        emit FundsAdded(msg.value);
        return address(this).balance;
    }

    // Add funds to the card by address
    receive() 
        external 
        payable 
        onlyCardholder
    {
        emit FundsAdded(msg.value);
    }

    // If a payment flow is started with the associated card, we hold the BTC equivalent amount
    // of the transaction for secure funding the payment, waiting for the response of the card network
    function requestFunds(
        bytes32 requesterCard, 
        uint256 amount,
        bytes32 currency, 
        bytes32 referenceCode) 
            external 
            payable 
            onlyBank  
            checkLocking
            validateAML(amount) 
    {
        uint256 amountBTC = convertToBTC(amount, currency);
        require(requesterCard == cardId, "Not valid card");
        require(address(this).balance >= amountBTC, "Insufficient funds");

        Transaction memory transaction = Transaction({
            currency: currency,
            amountFIAT: amount,
            amountBTC: amountBTC,
            state: State.Initiated,
            timestamp: now
        });

        bytes32 transactionId = sha256(abi.encodePacked(cardId, referenceCode));
        transactions[transactionId] = transaction;
        references[transactionCount++] = transactionId;

        confirmTransaction(referenceCode);
    }

    // Getting BTC price for the transaction currency
    function convertToBTC(uint256 amount, bytes32 currency) 
        internal 
        pure
        returns (uint256) 
    {
        // Simulation
        sha256(abi.encodePacked(currency)); //
        return amount * 1000;
    }

    // If the funds are secured, with notify the bank to procede with the transactions
    function confirmTransaction(bytes32 referenceCode) 
        internal 
    {
        sha256(abi.encodePacked(referenceCode)); //
        lastLocked = now;
    }

    // If the payment processor succesfully charges the smart card, the transaction funds
    // will be transfered to the bank 
    function completeTransaction(bytes32 requesterCard, bytes32 referenceCode) 
        public 
        payable 
        onlyBank 
        validTransaction(requesterCard, referenceCode) 
    {
        bytes32 transactionId = sha256(abi.encodePacked(requesterCard, referenceCode));
        Transaction storage transaction = transactions[transactionId];
        transaction.state = State.Completed;
        transaction.timestamp = now;

        //Transfer funds to the bank and realease lock
        (bool success, ) = bank.call{value:transaction.amountBTC}('');
        assert(success);
        lastLocked = 0;

        emit PaymentCompleted(transaction.amountBTC);
    }

    // If the payment processor fails to process the payments, the transactions funds
    // will be reverted to the smart contract 
    function revertTransaction(bytes32 requesterCard, bytes32 referenceCode) 
        public 
        payable 
        onlyBank 
        validTransaction(requesterCard, referenceCode) 
    {
        bytes32 transactionId = sha256(abi.encodePacked(requesterCard, referenceCode));
        Transaction storage transaction = transactions[transactionId];
        transaction.state = State.Reverted;
        transaction.timestamp = now;

        //Release lock
        lastLocked = 0;

        emit PaymentDeclined();
    }

    /***** Getters *****/

    function getBalance() 
        public 
        view 
        returns (uint256) 
    {
        return address(this).balance;
    }

    /*function getTransactions() 
        public 
        view 
        returns (mapping(bytes32 => Transaction) memory) 
    {
        return transactions;
    }*/

    /***** Modifiers *****/

    // Only cardholder can call the function
    modifier onlyCardholder() 
    {
        require(msg.sender == cardholder, "Only for cardholder");
        _;
    }

    // Only bank can call the function
    modifier onlyBank() 
    {
        require(msg.sender == bank, "Only for bank");
        _;
    }

    // Validate AML rules
    modifier validateAML(uint256 amount) 
    {
        uint256 cumulativeAmount = 0;
        if(transactionCount > 0) {
            for(uint256 i = transactionCount - 1; i >= 0; i++) 
            {
                bytes32 transactionId = references[i];
                Transaction memory transaction = transactions[transactionId];
                uint256 secondsPerMonth = 60 * 60 * 24 * 30;
                if(transaction.state == State.Completed && 
                   transaction.timestamp >= now - secondsPerMonth) 
                {
                    cumulativeAmount += transaction.amountFIAT;
                }
            }
        }

        require(amount <= maxAmountPerTx, "Tx limit exceeded");
        require(cumulativeAmount <= maxAmountPerMonth, "Monthly limit exceeded");
        _;
    }

    // Check if a transaction is already processing to prevent reentrancy attacks
    modifier checkLocking() 
    {
        //uint256 txTimeLimit = 60 * 30;
        require(lastLocked == 0 /*|| lastLocked < now - txTimeLimit*/, "A transaction is in progress");
        _;
    }

    // A valid and existing transaction should be sent
    modifier validTransaction(bytes32 requesterCard, bytes32 referenceCode) 
    {
        bytes32 transactionId = sha256(abi.encodePacked(requesterCard, referenceCode));
        Transaction memory transaction = transactions[transactionId];
        assert(transaction.timestamp != 0);
        _;
    }
}
