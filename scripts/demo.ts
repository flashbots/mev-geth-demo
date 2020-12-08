import { ethers } from 'ethers'
import { FlashbotsBundleProvider } from "ethers-flashbots";

const FAUCET = "0x133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791"
const DUMMY_RECEIVER = "0x1111111111111111111111111111111111111111"
// connect to the simple provider
let base = new ethers.providers.JsonRpcProvider("http://localhost:8545")
// wrap it with the mev-geth provider
let provider = new FlashbotsBundleProvider(base, "http://localhost:8545") as FlashbotsBundleProvider

// we use the miner as a faucet for testing
const faucet = new ethers.Wallet(FAUCET, provider)
// we create a random user who will submit bundles
const user = ethers.Wallet.createRandom().connect(provider)

;(async () => {
    console.log("Faucet", faucet.address)
    // fund the user with some Ether from the coinbase address
    console.log("Funding account...this may take a while due to DAG generation in the PoW testnet")
    let tx =  await faucet.sendTransaction({
        to: user.address,
        value: ethers.utils.parseEther('1')
    })
    await tx.wait()
    console.log("OK")
    const balance = await provider.getBalance(user.address)
    console.log("Balance:", balance.toString())

    const nonce = await user.getTransactionCount()
    const bribe = ethers.utils.parseEther('0.06666666666')
    const txs = [
        // some transaction
        {
            signer: user,
            transaction: {
                to: DUMMY_RECEIVER,
                value: ethers.utils.parseEther('0.1'),
                nonce: nonce,
            },
        },
        // the miner bribe
        {
            signer: user,
            transaction: {
                to: faucet.address,
                value: bribe,
                nonce: nonce + 1,
            }
        },
    ]

  console.log("Submitting bundle");
  const result = await provider.sendBundle(txs, 0);
  await result.wait();
  // wait a bit for the bundle to get processed
  await new Promise(r => setTimeout(r, 5000));
  const txHash = result.bundleTransactions[1].hash
  console.log("Bundle mined")

  // get the inclusion block
  const retTx = await provider.getTransaction(txHash)
  const block = (await provider.getBlock(retTx.blockNumber!)).number
  const receipt = await provider.getTransactionReceipt(retTx.hash)
  console.log("Transaction mined", receipt)

  const balanceBefore = await provider.getBalance(faucet.address, block - 1)
  const balanceAfter = await provider.getBalance(faucet.address, block)
  console.log("Miner before", balanceBefore.toString())
  console.log("Miner after", balanceAfter.toString())
  // subtract 2 for block reward
  const profit = balanceAfter.sub(balanceBefore).sub(ethers.utils.parseEther('2'))
  console.log("Profit (ETH)", ethers.utils.formatEther(profit))
  console.log("Profit equals bribe?", profit.eq(bribe))
})()
