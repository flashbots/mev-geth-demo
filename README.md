# MEV GETH Demo

Launches an MEV GETH node, and shows how a miner may profit from it by accepting MEV
bundles either via direct `block.coinbase` smart contract "bribes", or with extra transactions that pay
the block's coinbase if it's known ahead of time.

## Quickstart

```
GETH=/path/to/mev_geth ./run.sh
yarn run demo-simple
yarn run demo-contract
```
