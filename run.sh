rm -rf datadir

$GETH init --datadir datadir genesis.json

$GETH --datadir datadir --http --http.api debug,personal,eth,net,web3,txpool,admin,miner --miner.etherbase=0xd912aecb07e9f4e1ea8e6b4779e7fb6aa1c3e4d8 --miner.trustedrelays=0xfb11e78C4DaFec86237c2862441817701fdf197F --mine --miner.threads=8
