rm -rf datadir

$GETH init --datadir datadir genesis.json

$GETH --datadir datadir --rpc --rpcapi debug,personal,eth,net,web3,txpool,admin,miner --miner.etherbase=0xd912aecb07e9f4e1ea8e6b4779e7fb6aa1c3e4d8 --miner.gasprice 0 --mine --miner.threads=8 --relayWSURL="localhost:8080" --relayWSSigningKey="32e97bd66e7de7611aabe7b2eb2afbfe17c8bf1b82bb7f20ce096fcee1d7e750"
