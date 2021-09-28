
const Common = require('@ethereumjs/common').default
const ethTx = require('@ethereumjs/tx')
const Web3 = require('web3');
const web3 = new Web3();
const ethers = require('ethers')
const localRPC = "http://localhost:8545/"
const chainID = 5465 // from genesis.json file, for the common required for tx signing
const client = new Web3(new Web3.providers.HttpProvider(localRPC))

const getLatestBaseFee = async() => {
    const block = await client.eth.getBlock("latest")
    return parseInt(block.baseFeePerGas)
}

const signEIP1559Tx = async (input, client) => {
    const accountNonce = await client.eth.getTransactionCount(input.fromAddress);
    const tx = {
        to: input.to,
        data: input.data,
        value: Web3.utils.toHex(input.value),
        nonce: Web3.utils.toHex(input.nonce) || Web3.utils.toHex(accountNonce),
        gasLimit: Web3.utils.toHex(input.gasLimit),
        maxFeePerGas: Web3.utils.toHex(await getLatestBaseFee() + input.priorityFee),
        maxPriorityFeePerGas: Web3.utils.toHex(input.priorityFee), // 0 tip for now
        chainId: Web3.utils.toHex(await client.eth.getChainId()),
        accessList: [],
        type: "0x02" // ensures the tx isn't legacy type
    }
    // custom common for our private network
    const customCommon = Common.forCustomChain(
        'mainnet',
        {
            name: 'mev-geth-with-1559',
            chainId: chainID,
        },
        'london',
    );
    // sign and return
    const unsignedTx = new ethTx.FeeMarketEIP1559Transaction(tx, {customCommon});
    const signedTx = unsignedTx.sign(Buffer.from(input.privateKey, 'hex'))
    return '0x' + signedTx.serialize().toString('hex');
}

const generateRelaySignature = async(megabundle, relayPk) => {
    const formattedMegabundle = [
        megabundle.txs,
        '0x' + megabundle.blockNumber.toString(16),
        (megabundle.minTimestamp == 0) ? '0x' : '0x' + megabundle.minTimestamp.toString(16),
        (megabundle.maxTimestamp == 0) ? '0x' : '0x' + megabundle.maxTimestamp.toString(16),
        megabundle.revertingTxHashes
    ]
    const encodedMegabundle = ethers.utils.RLP.encode(formattedMegabundle)
    const signedMegaBundle = web3.eth.accounts.sign(encodedMegabundle, relayPk)
    return signedMegaBundle.signature
}

exports.signEIP1559Tx = signEIP1559Tx
exports.generateRelaySignature = generateRelaySignature