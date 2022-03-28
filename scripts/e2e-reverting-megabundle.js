const Web3 = require('web3')
const fetch = require('node-fetch')
const process = require('process')
const {signEIP1559Tx, generateRelaySignature, awaitBlock} = require('./helpers')

const localRPC = "http://localhost:8545/"
const client = new Web3(new Web3.providers.HttpProvider(localRPC))

const TRUSTED_RELAY_PK = '0ceb0619ccbb1092e3d0e3874e4582abe5f9518262e465575ca837a7dad0703d' // 0xfb11e78C4DaFec86237c2862441817701fdf197F, see run.sh
const FAUCET_PK = '133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791'
const FAUCET_ADDRESS = '0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8'
const DUMMY_RECEIVER = '0x1111111111111111111111111111111111111111'
const MINER_BRIBE = 0.123 * 10 ** 18
const RECEIVER_VALUE = 0.321 * 10 ** 18
const testWallet = client.eth.accounts.create();

const checkRevertingMebagundle = async () => {
  const updatedNonce = await client.eth.getTransactionCount(testWallet.address)
  const txs = [
    await signEIP1559Tx({
        to: DUMMY_RECEIVER,
        value: RECEIVER_VALUE, // ETH
        fromAddress: testWallet.address,
        data: "0x", // direct send
        gasLimit: 21000,
        priorityFee: 0,
        privateKey: testWallet.privateKey.substring(2), // remove 0x in pk
        nonce: updatedNonce
    }, client),
    // random tx at bundle index 0
    await signEIP1559Tx({
        to: DUMMY_RECEIVER,
        value: RECEIVER_VALUE, // ETH
        fromAddress: testWallet.address,
        data: "0x", // direct send
        gasLimit: 21000 * 10**10,
        priorityFee: 0,
        privateKey: testWallet.privateKey.substring(2), // remove 0x in pk
        nonce: updatedNonce + 1
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
        nonce: updatedNonce + 2
    }, client)
  ]
  const blockNumber = await client.eth.getBlockNumber()
  console.log("Megabundle target block no: ", blockNumber + 10)
  const unsignedMegaBundle = {
    txs: txs,
    blockNumber: blockNumber + 10,
    minTimestamp: 0,
    maxTimestamp: 0,
    revertingTxHashes: []
  }
  const signedMegaBundle = await generateRelaySignature(unsignedMegaBundle, TRUSTED_RELAY_PK)
  const params = [
    {
      txs,
      blockNumber: blockNumber + 10,
      minTimestamp: 0,
      maxTimestamp: 0,
      revertingTxHashes: [],
      relaySignature: signedMegaBundle
    }
  ]
  const body = {
      params,
      method: 'eth_sendMegabundle',
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

  for (let i = 0; i < 3; ++i) {
    const receipt = await client.eth.getTransactionReceipt(client.utils.keccak256(txs[i]))
    if (receipt) {
      console.log("transaction from a reverting megabundle was inserted")
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

    await checkRevertingMebagundle()
}

main()

