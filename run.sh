rm -rf datadir datadir2

$GETH init --datadir datadir genesis.json
$GETH init --datadir datadir2 genesis.json

trap "kill $(jobs -p)" EXIT

$GETH --port 30301 --nodiscover --networkid 1234 --datadir datadir --http --http.port 8545 --http.api debug,personal,eth,net,web3,txpool,admin,miner --miner.etherbase=0xd912aecb07e9f4e1ea8e6b4779e7fb6aa1c3e4d8 --miner.trustedrelays=0xfb11e78C4DaFec86237c2862441817701fdf197F --mine --miner.threads=2 &
$GETH --port 30302 --nodiscover --networkid 1234 --datadir datadir2 --http --http.port 8546 --http.api debug,personal,eth,net,web3,txpool,admin,miner --txpool.privatelifetime "0h0m59s" &

sleep 30

n1_enode=`$GETH --datadir datadir attach --exec "admin.nodeInfo.enode"`
$GETH --datadir datadir2 attach --exec "admin.addPeer($n1_enode)"

wait
