import { ethers, Wallet } from 'ethers'
import fetch from 'node-fetch'

const FAUCET = '0x133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791'
const DUMMY_RECEIVER = '0x1111111111111111111111111111111111111111'
// connect to the simple provider
let provider = new ethers.providers.JsonRpcProvider('http://localhost:8545')
// we use the miner as a faucet for testing
const faucet = new ethers.Wallet(FAUCET, provider)
// we create a random user who will submit bundles
const user = ethers.Wallet.createRandom().connect(provider)

;(async () => {
  // wrap it with the mev-geth provider
  const authSigner = Wallet.createRandom()

  console.log('Faucet', faucet.address)
  // fund the user with some Ether from the coinbase address
  console.log('Funding account...this may take a while due to DAG generation in the PoW testnet')
  let tx = await faucet.sendTransaction({
    to: user.address,
    value: ethers.utils.parseEther('1')
  })
  await tx.wait()
  console.log('OK')
  const balance = await provider.getBalance(user.address)
  console.log('Balance:', balance.toString())

  const nonce = await user.getTransactionCount()
  const bribe = ethers.utils.parseEther('0.06666666666')
  const txs = [
    // some transaction
    await user.signTransaction({
      to: DUMMY_RECEIVER,
      value: ethers.utils.parseEther('0.1'),
      nonce: nonce
    }),
    // the miner bribe
    await user.signTransaction({
      to: faucet.address,
      value: bribe,
      nonce: nonce + 1
    })
  ]

  console.log('Submitting bundle')
  const blk = await provider.getBlockNumber()

  for (let i = 1; i <= 10; i++) {
    const params = [
      {
        txs,
        blockNumber: `0x${(blk + i).toString(16)}`
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
    if (respRaw.status >= 300) {
      console.error('error sending bundle')
      process.exit(1)
    }
    const json = await respRaw.json()
    if (json.error) {
      console.error('error sending bundle, error was', json.error)
      process.exit(1)
    }
  }
  while (true) {
    const newBlock = await provider.getBlockNumber()
    if (newBlock > blk + 10) break
    await new Promise((resolve) => setTimeout(resolve, 100)) // sleep
  }

  const balanceBefore = await provider.getBalance(faucet.address, blk)
  const balanceAfter = await provider.getBalance(faucet.address, blk + 10)
  console.log('Miner before', balanceBefore.toString())
  console.log('Miner after', balanceAfter.toString())
  // subtract 2 for block reward
  const profit = balanceAfter.sub(balanceBefore).sub(ethers.utils.parseEther('2'))
  console.log('Profit (ETH)', ethers.utils.formatEther(profit))
  console.log('Profit equals bribe?', profit.eq(bribe))
})().catch((err) => {
  console.error('error encountered in main loop', err)
  process.exit(1)
})
