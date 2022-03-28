const Web3 = require('web3')
const fetch = require('node-fetch')
const process = require('process')
const {signEIP1559Tx, awaitBlock} = require('./helpers')

const localRPC = "http://localhost:8545/"
const client = new Web3(new Web3.providers.HttpProvider(localRPC))

const FAUCET_PK = '133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791'
const FAUCET_ADDRESS = '0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8'
const DUMMY_RECEIVER = '0x1111111111111111111111111111111111111111'
const MINER_BRIBE = 0.123 * 10 ** 18
const RECEIVER_VALUE = 0.321 * 10 ** 18
const testWallet = client.eth.accounts.create();

const checkRevertingBundles = async () => {
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
          gasLimit: 21000 * 10**10,
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
  await fetch('http://localhost:8545', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
          'Content-Type': 'application/json'
      }
  })

  await awaitBlock(client, blockNumber + 15)

  for (let i = 0; i < 2; ++i) {
    const receipt = await client.eth.getTransactionReceipt(client.utils.keccak256(txs[i]))
    if (receipt) {
      console.log("transaction from a reverting bundle was inserted")
      process.exit(1)
    }
  }
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

    await checkRevertingBundles()
}

main()

