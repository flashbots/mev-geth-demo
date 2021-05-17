import { ethers, ContractFactory } from 'ethers'
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle'
// @ts-ignore
import solc from 'solc'

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

const FAUCET = '0x133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791'
// connect to the simple provider
let provider = new ethers.providers.JsonRpcProvider('http://localhost:8545')

// we use the miner as a faucet for testing
const faucet = new ethers.Wallet(FAUCET, provider)
// we create a random user who will submit bundles
const user = ethers.Wallet.createRandom().connect(provider)

;(async () => {
  // wrap it with the mev-geth provider
  const authSigner = ethers.Wallet.createRandom()
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, 'http://localhost:8545', 5465)

  // fund the user with some Ether from the coinbase address
  console.log('Funding account...this may take a while due to DAG generation in the PoW testnet')
  let tx = await faucet.sendTransaction({
    to: user.address,
    value: ethers.utils.parseEther('1')
  })
  await tx.wait()

  // deploy the bribe contract
  console.log('Deploying bribe contract...')
  const factory = new ContractFactory(ABI, BIN, user)
  const contract = await factory.deploy()
  await contract.deployTransaction.wait()
  console.log('Deployed at:', contract.address)

  const bribeTx = await contract.populateTransaction.bribe({
    value: ethers.utils.parseEther('0.216321768999')
  })
  const txs = [
    {
      signer: user,
      transaction: bribeTx
    }
  ]

  console.log('Submitting bundle')
  const blk = await provider.getBlockNumber()
  const result = await flashbotsProvider.sendBundle(txs, blk + 5)
  if ('error' in result) {
    throw new Error(result.error.message)
  }
  await result.wait()
  const receipts = await result.receipts()
  const block = receipts[0].blockNumber

  const balanceBefore = await provider.getBalance(faucet.address, block - 1)
  const balanceAfter = await provider.getBalance(faucet.address, block)
  console.log('Miner before', balanceBefore.toString())
  console.log('Miner after', balanceAfter.toString())
  // subtract 2 for block reward
  const profit = balanceAfter.sub(balanceBefore).sub(ethers.utils.parseEther('2'))
  console.log('Profit (ETH)', ethers.utils.formatEther(profit))
  console.log('Profit equals bribe?', profit.eq(bribeTx.value!))
})().catch((err) => {
  console.error('error encountered in main loop', err)
  process.exit(1)
})
