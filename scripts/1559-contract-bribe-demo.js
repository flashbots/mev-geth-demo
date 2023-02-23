const Web3 = require('web3')
const fetch = require('node-fetch')
const {signEIP1559Tx, generateRelaySignature} = require('./helpers')
const ethers =require("ethers")
const ethUtil = require('ethereumjs-util')
const ContractFactory = require("ethers").ContractFactory
const _ = require("lodash")
const solc = require('solc')

const localRPC = "http://localhost:8545/"
const client = new Web3(new Web3.providers.HttpProvider(localRPC))
var BN = client.utils.BN
const FAUCET_ADDRESS = '0xd912AeCb07E9F4e1eA8E6b4779e7Fb6Aa1c3e4D8'
const testWallet = client.eth.accounts.create();
const TRUSTED_RELAY_PK = '0ceb0619ccbb1092e3d0e3874e4582abe5f9518262e465575ca837a7dad0703d' // 0xfb11e78C4DaFec86237c2862441817701fdf197F, see run.sh

const CONTRACT = `
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;

contract Bribe {
    function bribe() payable public {
        block.coinbase.transfer(msg.value);
    }
}
`
const INPUT = {
  language: 'Solidity',
  sources: {
    'Bribe.sol': {
      content: CONTRACT
    }
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['*']
      }
    }
  }
}
const OUTPUT = JSON.parse(solc.compile(JSON.stringify(INPUT)))
const COMPILED = OUTPUT.contracts['Bribe.sol']
const ABI = COMPILED.Bribe.abi
const BIN = '0x' + COMPILED.Bribe.evm.bytecode.object
// miner pk on the private network
const FAUCET_PK = "0x133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791"
// const DUMMY_RECEIVER = "0x1111111111111111111111111111111111111111" // address we'll send funds via bundles
const simpleProvider = new ethers.providers.JsonRpcProvider("http://localhost:8545")
const faucet = new ethers.Wallet(FAUCET_PK, simpleProvider)
// we create a random user who will submit bundles
const user = ethers.Wallet.createRandom().connect(simpleProvider)
const MINER_BRIBE = 0.123 * 10 ** 18
const BLOCK_REWARD = 2 * 10 ** 18

// we use the miner as a faucet for testing


const checkBundleStatus = async (hash, contractAddress) => {
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
                
      } else{
        console.log("Bundle tx has not been mined yet")
      }
    }, 5000);
}

const main = async () => {
    const authSigner = ethers.Wallet.createRandom()
    console.log("Funding test account!")
    const fundAccountInput = {
        to: testWallet.address,
        value: 1 * 10 ** 18, // 1 ETH
        fromAddress: FAUCET_ADDRESS,
        data: "0x", // direct send
        gasLimit: 21000,
        priorityFee: 0,
        privateKey: FAUCET_PK.substring(2),
        nonce: await client.eth.getTransactionCount(FAUCET_ADDRESS)
    }
    const signedFundTx = await signEIP1559Tx(fundAccountInput, client)
    const fundTxReceipt = (await client.eth.sendSignedTransaction(signedFundTx))
    console.log("Funding tx mined at block #", fundTxReceipt.blockNumber)
    const testWalletBalance = await client.eth.getBalance(testWallet.address)
    console.log('Balance: ', testWalletBalance)

    // deploy the bribe contract
    console.log('Deploying bribe contract...')
    const factory = new ContractFactory(ABI, BIN, user)
    const bytecode = factory.bytecode
    const deployInput = {
        to: '',
        value: 0,
        fromAddress: testWallet.address,
        data: bytecode, // contract creation
        gasLimit: 200000,
        priorityFee: 0,
        privateKey: testWallet.privateKey.substring(2),
        nonce: await client.eth.getTransactionCount(testWallet.address)
    }
    const signedDeployTx = await signEIP1559Tx(deployInput, client)
    const deployTxReceipt = (await client.eth.sendSignedTransaction(signedDeployTx))
    const contractAddress = deployTxReceipt.contractAddress
    // sign the bribe tx
    const bribeTxInput = {
        to: contractAddress,
        value: MINER_BRIBE,
        fromAddress: testWallet.address,
        data: "0x37d0208c", // bribe()
        gasLimit: 200000,
        priorityFee: 0,
        privateKey: testWallet.privateKey.substring(2),
        nonce: await client.eth.getTransactionCount(testWallet.address)
    }
    const txs = [await signEIP1559Tx(bribeTxInput, client)]    
    const blockNumber = await client.eth.getBlockNumber()
    console.log("Bundle target block no: ", blockNumber + 10)
    // generate bundle data
    const params = [
        {
            txs,
            blockNumber: `0x${(blockNumber + 10).toString(16)}`
        }
      ]
    const body = {
        params,
        method: 'eth_sendBundle',
        id: '123',
        jsonrpc: '2.0'
    }
    const respRaw = await fetch('http://localhost:8545', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json'
        }
    })
    console.log("txHash of bundle tx #1 ", client.utils.keccak256(txs[0]))
    await checkBundleStatus(client.utils.keccak256(txs[0]), contractAddress) // to get hash
}

main()
