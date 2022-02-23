const Web3 = require('web3')
const fetch = require('node-fetch')

const {signEIP1559Tx, fundFromFaucet, generateRelaySignature} = require('./helpers')

const FAUCET_PK = '133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791'
const FAUCET_ADDRESS = '0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8'
const DUMMY_RECEIVER = '0x1111111111111111111111111111111111111111'
const RECEIVER_VALUE = 0.00321 * 10 ** 18
const TEST_WALLET_RECEIVE_VALUE = 100*RECEIVER_VALUE

function delay(ms) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

const awaitBlock = async(client, blockNumber) => {
    while (await client.eth.getBlockNumber() < blockNumber) {
        await delay(1000)
    }
}

const sendPrivateRawTransaction = async(rpc_address, client, from, pk, to, value) => {
    const tx = await signEIP1559Tx({
        to: to,
        value: value,
        fromAddress: from,
        data: "0x",
        gasLimit: 21000,
        priorityFee: 150 * 10 ** 9,
        privateKey: pk,
        nonce: null
    }, client)

    const body = {
      params: [tx],
        method: 'eth_sendPrivateRawTransaction',
        id: '124'
    }
    const respRaw = await fetch(rpc_address, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json'
        }
    })
    return await respRaw.json()
}

const main = async() => {
    const minerRPC = "http://localhost:8545/"
    const otherRPC = "http://localhost:8546/"
    const client = new Web3(new Web3.providers.HttpProvider(minerRPC))
    const nonMiningClient = new Web3(new Web3.providers.HttpProvider(minerRPC))

    const testWallet = client.eth.accounts.create();

    /* Check that private transactions are mined */
    const testWalletBalanceBefore = Number(await client.eth.getBalance(testWallet.address))

    const resp1 = await sendPrivateRawTransaction(minerRPC, client, FAUCET_ADDRESS, FAUCET_PK, testWallet.address, TEST_WALLET_RECEIVE_VALUE)
    if (resp1.error) {
        console.log("Incorrect response", resp1)
        process.exit(1)
    }

    let blockNumber = await client.eth.getBlockNumber()

    /* Wait until in sync */
    await awaitBlock(nonMiningClient, blockNumber+2)
    const testWalletBalanceAfter = Number(await client.eth.getBalance(testWallet.address))

    if (testWalletBalanceAfter !== testWalletBalanceBefore + TEST_WALLET_RECEIVE_VALUE) {
        console.log("incorrect balance, private tx was not mined")
        console.log("before", testWalletBalanceBefore, "after", testWalletBalanceAfter, "expected", testWalletBalanceBefore + TEST_WALLET_RECEIVE_VALUE, "diff", testWalletBalanceAfter - testWalletBalanceBefore + TEST_WALLET_RECEIVE_VALUE)
        process.exit(1)
    }

    const balanceBefore = Number(await client.eth.getBalance(DUMMY_RECEIVER))

    const resp2 = await sendPrivateRawTransaction(otherRPC, nonMiningClient, testWallet.address, testWallet.privateKey.substring(2), DUMMY_RECEIVER, RECEIVER_VALUE)
    if (resp2.error) {
        console.log("Incorrect response", resp2)
        process.exit(1)
    }

    await delay(10 * 1000)

    const balanceAfterSubmission = Number(await client.eth.getBalance(DUMMY_RECEIVER))
    if (balanceAfterSubmission !== balanceBefore) {
        console.log("incorrect balance, private tx was mined")
        process.exit(1)
    }

    await delay(60 * 1000)

    /* Wait two more blocks */
    blockNumber = await client.eth.getBlockNumber()
    await awaitBlock(nonMiningClient, blockNumber+2)

    const balanceAfterMinute = Number(await client.eth.getBalance(DUMMY_RECEIVER))

    if (balanceAfterMinute !== balanceBefore) {
        console.log("incorrect balance, private tx was mined")
        process.exit(1)
    }

    /* After one minute the tx should be dropped */
}

main()
