// ws server - relay side
const FlashbotsBundleProvider = require("@flashbots/ethers-provider-bundle").FlashbotsBundleProvider
const ethers =require("ethers")
const WebSocket = require('ws')
const _ = require("lodash")
// miner pk on the private network
const FAUCET = "0x133be114715e5fe528a1b8adf36792160601a2d63ab59d1fd454275b31328791"
const DUMMY_RECEIVER = "0x1111111111111111111111111111111111111111" // address we'll send funds via bundles

const wss = new WebSocket.Server({ port: 8080 })
const simpleProvider = new ethers.providers.JsonRpcProvider("http://localhost:8545")
const flashBotsProvider = new FlashbotsBundleProvider(simpleProvider, "http://localhost:8545")
// we use the miner as a faucet for testing
const faucet = new ethers.Wallet(FAUCET, simpleProvider)
// we create a random user who will submit bundles
const user = ethers.Wallet.createRandom().connect(simpleProvider)
const bribe = ethers.utils.parseEther('0.02')

// Message sent to clients on first connection
const initMessage = {
  data: "Successfully connected to relay WS",
  type: "success"
}

// Set heartbeat
function heartbeat(){
  console.log("received: pong")
  this.isAlive = true;
}

const accessKeys = ["secretABC", "secretDEF"] // access keys for auth
// Helper functions
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const generateTestBundle = async () => {
  console.log("Funding account.....")
  let tx =  await faucet.sendTransaction({
      to: user.address,
      value: ethers.utils.parseEther('1')
  })
  await tx.wait()
  const balance = await simpleProvider.getBalance(user.address)
  console.log("Balance:", balance.toString())
  const nonce = await user.getTransactionCount()
  const txs = [
      // some transaction
      {
          signer: user,
          transaction: {
              to: DUMMY_RECEIVER,
              value: ethers.utils.parseEther('0.05'),
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
  const blk = await simpleProvider.getBlockNumber()

  const targetBlockNumber = blk + 5
  const payload = {
    data: {
      encodedTxs: await flashBotsProvider.signBundle(txs),
      blockNumber: `0x${targetBlockNumber.toString(16)}`,
      minTimestamp: 0,
      maxTimestamp: 0,
      revertingTxHashes: []
    },
    type: "bundle"
  }
  return payload
}

const checkBundle = async (payload) => {
  const hash = ethers.utils.keccak256(payload.data.encodedTxs[0])
  const receipt = await simpleProvider.getTransactionReceipt(hash)    
  const block = receipt.blockNumber
  const balanceBefore = await simpleProvider.getBalance(faucet.address, block - 1)
  const balanceAfter = await simpleProvider.getBalance(faucet.address, block)
  console.log("Miner before", balanceBefore.toString())
  console.log("Miner after", balanceAfter.toString())
  // subtract 2 for block reward
  const profit = balanceAfter.sub(balanceBefore).sub(ethers.utils.parseEther('2'))
  console.log("Profit (ETH)", ethers.utils.formatEther(profit))
  console.log("Profit equals bribe?", profit.eq(bribe))
  if(profit.eq(bribe)){
    wss.close()
  }
}

wss.on('connection', async function connection(ws, req){
  ws.isAlive = true;
  ws.on('pong', heartbeat)
  ws.on('message', message => {
    console.log("received message from ws client: " + message)
  })
  
  // Ensure the client is authenticated
  if(_.includes(accessKeys, req.headers['x-api-key'])){
    // Send bundle to test
    await sleep(1000)
    const payload = await generateTestBundle()
    ws.send(JSON.stringify(payload))
    await sleep(3000)
    await checkBundle(payload)
  } else {
    console.log("auth failed")
    ws.terminate()
  }

  ws.on("close", m => {
    console.log("client closed " + m)
  })

})

// Heartbeat test to see if connection is still alive every 10 seconds
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {return ws.terminate()}
    ws.isAlive = false;
    ws.ping(()=> {console.log("sending: ping")});
  });
}, 10000);

wss.on('close', function close() {
  clearInterval(interval);
});
