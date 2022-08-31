P2P_PORT="${P2P_PORT:-30301}"
DATADIR="${DATADIR:-datadir}"
HTTP_PORT="${HTTP_PORT:-8545}"
AUTH_PORT="${AUTH_PORT:-8551}"

MINER_ARGS="${MINER_ARGS:---miner.etherbase=0xd912aecb07e9f4e1ea8e6b4779e7fb6aa1c3e4d8 --miner.trustedrelays=0xfb11e78C4DaFec86237c2862441817701fdf197F --mine --miner.threads=2}"

rm -rf $DATADIR

$GETH init --datadir $DATADIR genesis.json
$GETH --port $P2P_PORT --nodiscover --networkid 1234 --datadir $DATADIR --http --http.port $HTTP_PORT --http.api debug,personal,eth,net,web3,txpool,admin,miner --authrpc.port=$AUTH_PORT $MINER_ARGS
