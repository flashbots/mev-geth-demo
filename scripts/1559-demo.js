const Web3 = require('web3')
const fetch = require('node-fetch')
const {signEIP1559Tx} = require('./1559-helpers')

const localRPC = "http://localhost:8545/"
const client = new Web3(new Web3.providers.HttpProvider(localRPC))
var BN = client.utils.BN;

const FAUCET_PK = '133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791'
const FAUCET_ADDRESS = '0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8'
const DUMMY_RECEIVER = '0x1111111111111111111111111111111111111111'
const MINER_BRIBE = 0.123 * 10 ** 18
const RECEIVER_VALUE = 0.321 * 10 ** 18
const BLOCK_REWARD = 2 * 10 ** 18
const testWallet = client.eth.accounts.create();

// only for reference, not used elsewhere
const sample1559TxInput = {
    to: '0x0000000000000000000000000000000000000000',
    value: 1 * 10 ** 18, // 1 ETH,
    fromAddress: "0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8",
    data: "0x",
    gasLimit: 21000,
    priorityFee: 0,
    privateKey: "133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791"
}

const checkBundleStatus = async (hash) => {
    var timer = setInterval(async function() {
      const receipt = await client.eth.getTransactionReceipt(hash)
      if(receipt){ // If the tx has been mined, it returns null if pending
        clearInterval(timer) // stop the setInterval once we get a valid receipt
        const block = receipt.blockNumber
        // Given the base fee is burnt and priority fee is set to 0, miner balance shouldn't change

        const MinerBalanceBefore = await client.eth.getBalance(FAUCET_ADDRESS, block - 1)
        const MinerBalanceAfter = await client.eth.getBalance(FAUCET_ADDRESS, block)
        console.log("Miner before", MinerBalanceBefore.toString())
        console.log("Miner after", MinerBalanceAfter.toString())

        // balance before/after the block is mined, remove the block reward
        const minerProfit = new BN(MinerBalanceAfter).sub(new BN(MinerBalanceBefore))
        const finalProfit = minerProfit.sub(new BN(BLOCK_REWARD.toString())).toString();

        console.log("Profit (ETH)", finalProfit.toString())
        console.log("Profit equals bribe?", parseInt(finalProfit)==MINER_BRIBE)
        
        // 1st tx of our bundle should also be processed and the balance of receiver should increase
        const balanceBefore = await client.eth.getBalance(DUMMY_RECEIVER, block - 1)
        const balanceAfter = await client.eth.getBalance(DUMMY_RECEIVER, block)
        const receiverProfit = new BN(balanceAfter).sub(new BN(balanceBefore)).toString();

        console.log("Receiver before", balanceBefore.toString())
        console.log("Receiver after", balanceAfter.toString())
        console.log("Received value?", parseInt(receiverProfit)==RECEIVER_VALUE)
      } else{
        console.log("Bundle tx has not been mined yet")
      }
    }, 5000);
  }

const main = async() => {
    // First we fund the random test wallet from the miner faucet
    console.log("Funding test account!")
    const fundAccountInput = {
        to: testWallet.address,
        value: 1 * 10 ** 18, // 1 ETH
        fromAddress: FAUCET_ADDRESS,
        data: "0x", // direct send
        gasLimit: 21000,
        priorityFee: 0,
        privateKey: FAUCET_PK,
        nonce: await client.eth.getTransactionCount(FAUCET_ADDRESS)
    }
    const signedFundTx = await signEIP1559Tx(fundAccountInput, client)
    const fundTxReceipt = (await client.eth.sendSignedTransaction(signedFundTx))
    console.log("Funding tx mined at block #", fundTxReceipt.blockNumber)
    const testWalletBalance = await client.eth.getBalance(testWallet.address)
    console.log('Balance: ', testWalletBalance)

    // Now we create a bundle
    const blockNumber = await client.eth.getBlockNumber()
    console.log("Bundle target block no: ", blockNumber + 10)
    const nonce = await client.eth.getTransactionCount(testWallet.address);
    const txs = [
        // random tx at bundle index 0
        await signEIP1559Tx({
            to: DUMMY_RECEIVER,
            value: RECEIVER_VALUE, // ETH
            fromAddress: testWallet.address,
            data: "0x", // direct send
            gasLimit: 21000,
            priorityFee: 0,
            privateKey: testWallet.privateKey.substring(2), // remove 0x in pk
            nonce: nonce
        }, client),
        // miner bribe
        await signEIP1559Tx({
            to: FAUCET_ADDRESS,
            value: MINER_BRIBE, // ETH
            fromAddress: testWallet.address,
            data: "0x", // direct send
            gasLimit: 21000,
            priorityFee: 0,
            privateKey: testWallet.privateKey.substring(2), // remove 0x in pk
            nonce: nonce + 1
        }, client)
    ]
    const params = [
      {
        txs,
        blockNumber: `0x${(blockNumber + 10).toString(16)}`
      }
    ]
    const body = {
        params,
        method: 'eth_sendBundle',
        id: '123'
    }
    const respRaw = await fetch('http://localhost:8545', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json'
        }
    })
    console.log("txHash of bundle tx #1 ", client.utils.keccak256(txs[0]))
    console.log("txHash of bundle tx #2 ", client.utils.keccak256(txs[1]))
    await checkBundleStatus(client.utils.keccak256(txs[1]))
}

main()
