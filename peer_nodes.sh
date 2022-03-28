n1_enode=`$GETH --datadir $DATADIR1 attach --exec "admin.nodeInfo.enode"`
$GETH --datadir $DATADIR2 attach --exec "admin.addPeer($n1_enode)"
