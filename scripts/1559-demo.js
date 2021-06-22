const Web3 = require('web3')
const fetch = require('node-fetch')
const {signEIP1559Tx} = require('./1559-helpers')

const localRPC = "http://localhost:8545/"
const client = new Web3(new Web3.providers.HttpProvider(localRPC))

const FAUCET_PK = '133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791'
const FAUCET_ADDRESS = '0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8'
const DUMMY_RECEIVER = '0x1111111111111111111111111111111111111111'

const testWallet = client.eth.accounts.create();

// only for reference
const sample1559TxInput = {
    to: '0x0000000000000000000000000000000000000000',
    value: 1 * 10 ** 18, // 1 ETH,
    fromAddress: "0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8",
    data: "0x",
    gasLimit: 21000,
    priorityFee: 0,
    privateKey: "133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791"
}

const getTxStatus = async (hash) => {
    const txReceipt = await client.eth.getTransactionReceipt(hash)
    const txInfo = await client.eth.getTransaction(hash).then(console.log);
    return {
        txReceipt, 
        txInfo
    }
}

const checkBundleStatus = async (hash) => {
    var timer = setInterval(async function() {
      const receipt = await client.eth.getTransactionReceipt(hash)
      if(receipt){ // If the tx has been mined, it returns null if pending
        clearInterval(timer) // stop the setInterval once we get a valid receipt
        const block = receipt.blockNumber
        // Given the base fee is burnt and priority fee is set to 0, miner balance shouldn't change

        // const balanceBefore = await client.eth.getBalance(faucet.address, block - 1)
        // const balanceAfter = await client.eth.getBalance(faucet.address, block)
        // console.log("Miner before", balanceBefore.toString())
        // console.log("Miner after", balanceAfter.toString())
        // const profit = balanceAfter - (balanceBefore).sub(client.utils.parseEther('2'))
        // console.log("Profit (ETH)", ethers.utils.formatEther(profit))
        // console.log("Profit equals bribe?", profit.eq(bribe))
        
        // 1st tx of our bundle should be processed and the balance of receiver should increase
        const balanceBefore = await client.eth.getBalance(DUMMY_RECEIVER, block - 1)
        const balanceAfter = await client.eth.getBalance(DUMMY_RECEIVER, block)
        console.log("Receiver before", balanceBefore.toString())
        console.log("Receiver after", balanceAfter.toString())
      } else{
        console.log("Bundle tx has not been mined yet")
      }
    }, 1000);
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
        privateKey: FAUCET_PK
    }
    const signedFundTx = await signEIP1559Tx(fundAccountInput, client)
    const fundTxReceipt = (await client.eth.sendSignedTransaction(signedFundTx))
    console.log("Funding tx mined at block #", fundTxReceipt.blockNumber)
    const testWalletBalance = await client.eth.getBalance(testWallet.address)
    console.log('Balance: ', testWalletBalance)

    // Now we create a bundle
    const blockNumber = await client.eth.getBlockNumber()
    console.log(blockNumber)

    const txs = [
        // random tx at bundle index 0
        await signEIP1559Tx({
            to: DUMMY_RECEIVER,
            value: 0.1 * 10 ** 18, // 1 ETH
            fromAddress: testWallet.address,
            data: "0x", // direct send
            gasLimit: 21000,
            priorityFee: 0,
            privateKey: testWallet.privateKey.substring(2) // remove 0x in pk
        }, client),
        // miner bribe
        await signEIP1559Tx({
            to: FAUCET_ADDRESS,
            value: 0.05 * 10 ** 18, // 1 ETH
            fromAddress: testWallet.address,
            data: "0x", // direct send
            gasLimit: 21000,
            priorityFee: 0,
            privateKey: testWallet.privateKey.substring(2) // remove 0x in pk
        }, client)
    ]
    const params = [
      {
        txs,
        blockNumber: `0x${(blockNumber + 5).toString(16)}`
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
