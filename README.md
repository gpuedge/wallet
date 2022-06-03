# wallet
Settlement mechanism

## How do I create my wallet?
Visit https://wallet.gpux.ai/

## How does wallet works?

 - Wallet is a distributed ledger governed by a BDFL (like many blockchains today)
 - There are no blocks

## How can wallet be improved?

 - [ ] Cloudflare can step in as the BDFL
 - [ ] COW for cloudflare storage (so we can snapshot state transitions and rollback easy)
 - [ ] Rewrite channel/sync logic (especially iframe communication) using Actor model
 - [ ] Possibly add WebSocket (maybe wait for CF PubSub) to have realtime balance updates