const Util = require('./util.js')
const nacl = require('tweetnacl');

module.exports = class MonolithWallet {
  constructor(controller, env) {
    globalThis.controller = controller;
    globalThis.storage = controller.storage;
    globalThis.ticking = false;
    globalThis.env = env;

    controller.blockConcurrencyWhile(async () => {
        //await globalThis.storage.deleteAll();
        let state = await globalThis.storage.get("state") || {
          credit: {}, credit_out: {}, 
          earned: {}, earned_lifetime: {},
          anti_replay: {},
          stripe_anti_replay: {},
        };
        globalThis.state = state;

        var keyPair_ed = nacl.sign.keyPair.fromSeed(Util.from_b58(env.BDFLSECKEY))
        globalThis.BDFL_PUBLIC_KEY = Util.to_b58(keyPair_ed.publicKey)
        globalThis.BDFL_PUBLIC_KEY_RAW = keyPair_ed.publicKey
        globalThis.BDFL_SECRET_KEY_RAW = keyPair_ed.secretKey
    })
  }

  async fetch(request) {
    let url = new URL(request.url);

    switch (url.pathname) {
    case "/api/wallet/balance":
      var json = await request.json()
      var balance = this.balance(json)
      return new Response(JSON.stringify(balance), {status: 200});

    case "/api/wallet/transaction":
      var json = await request.json()
      var tx_rx = this.transaction(json)
      return new Response(JSON.stringify(tx_rx), {status: 200});

    case "/api/wallet/stripe_mint":
      var json = await request.json()
      var tx_rx = this.stripe_mint(json)
      return new Response(JSON.stringify(tx_rx), {status: 200});

    default:
      return new Response("Not found", {status: 404});
    }
  }

  balance(json) {
    var public_key = json.public_key;
    var credit = globalThis.state["credit"][public_key] || 0
    var earned = globalThis.state["earned"][public_key] || 0
    return {credit: credit, earned: earned}
  }

  create_transaction_from_bdfl(receiver, opcode, params) {
    var tx = {
      sender: globalThis.BDFL_PUBLIC_KEY,
      receiver: receiver,
      timestamp: Date.now()*1000*1000,
      opcode: opcode,
      params: params,
    }
    var json = JSON.stringify(tx)

    var tx_signature = nacl.sign.detached(
      new TextEncoder().encode(json), globalThis.BDFL_SECRET_KEY_RAW)
    return {tx: json, tx_signature: Util.to_b58(tx_signature)}
  }

  stripe_mint(json) {
    if (!!globalThis.state["stripe_anti_replay"][json.signature])
      return;
    globalThis.state["stripe_anti_replay"][json.signature] = true;
    globalThis.storage.put("state", globalThis.state, {allowUnconfirmed: false, noCache: true})

    var tx = this.create_transaction_from_bdfl(globalThis.BDFL_PUBLIC_KEY, "mint", 
      {receiver: json.params.receiver, amount: json.params.credit})
    return this.transaction(tx)
  }

  transaction(json) {
    var tx_encoded = new TextEncoder().encode(json.tx)
    var tx_signature = Util.from_b58(json.tx_signature)
    var tx = JSON.parse(json.tx)
    var tx_public_key = Util.from_b58(tx.sender)

    //verify tx signature
    var valid = nacl.sign.detached.verify(
      tx_encoded, tx_signature, tx_public_key)
    if (!valid) {
      return {error: "invalid_signature"}
    }

    //We can clear the anti-replay buffer with this contraint
    var time_delta = (Date.now() - tx.timestamp/1_000_000)
    if (time_delta <= 60_000 && time_delta >= -60_000) {
      return {error: "stale_timestamp"}
    }

    //Use timestamp+signature as nonce for antireplay
    if (!!globalThis.state["anti_replay"][json.tx_signature]) {
      return {error: "replay"}
    }
    globalThis.state["anti_replay"][json.tx_signature] = true;
    globalThis.storage.put("state", globalThis.state, {allowUnconfirmed: false, noCache: true})

    var sender = tx.sender;
    var receiver = tx.receiver;
    var opcode = tx.opcode;
    var params = tx.params;

    if (!Util.is_string(receiver) || receiver.length > 255) {
      return {error: "sanitization_receiver"}
    }
    if (!Util.is_string(opcode) || opcode.length > 255) {
      return {error: "sanitization_opcode"}
    }

    var result = {};
    if (opcode == "mint") {
      result = this.mint(sender, receiver, params)
    } else if (opcode == "pay_for_resources") {
      result = this.pay_for_resources(sender, receiver, params)
    } else if (opcode == "refund_for_resources") {
      result = this.refund_for_resources(sender, receiver, params)
    } else {
      return {error: "invalid_opcode"}
    }

    var rx = {signer: globalThis.BDFL_PUBLIC_KEY, timestamp: Date.now()*1000*1000, result: result}
    var rx_json = JSON.stringify(rx)

    var tx_rx_signature = nacl.sign.detached(
      new TextEncoder().encode(`${json.tx}${rx_json}`), globalThis.BDFL_SECRET_KEY_RAW)
    var tx_rx_signature_b58 = Util.to_b58(tx_rx_signature)
    var tx_rx = {
      error: "ok",
      tx: json.tx,
      tx_signature: json.tx_signature,
      rx: rx_json,
      tx_rx_signature: tx_rx_signature_b58,
    }

    globalThis.storage.put(`tx:${tx_rx_signature_b58}`, tx_rx, {allowUnconfirmed: false, noCache: true})

    return tx_rx;
  }

  mint(sender, receiver, params) {    
    var credit_receiver = params.receiver

    var amount = params.amount;
    if (!Number.isInteger(amount)) {
      return {error: "amount_must_be_integer"}
    }
    if (amount < 0) {
      return {error: "amount_must_be_gt_0"}
    }

    globalThis.state["credit"][credit_receiver] = (globalThis.state["credit"][credit_receiver] || 0)
    globalThis.state["credit"][credit_receiver] += amount

    globalThis.storage.put("state", globalThis.state, {allowUnconfirmed: false, noCache: true})

    var credit = globalThis.state["credit"][credit_receiver]
    return {credit: credit}
  }

  pay_for_resources(sender, receiver, params) {
    var amount = params.amount

    var balance = globalThis.state["credit"][sender] || 0
    if (!Number.isInteger(amount)) {
      return {error: "amount_must_be_integer"}
    }
    if (amount < 0) {
      return {error: "amount_must_be_gt_0"}
    }
    if (amount > balance) {
      return {error: "amount_must_be_lt_balance"}
    }

    globalThis.state["credit"][sender] -= amount
    globalThis.state["earned"][receiver] = (globalThis.state["earned"][receiver] || 0)
    globalThis.state["earned"][receiver] += amount
    globalThis.state["earned_lifetime"][receiver] += amount

    globalThis.state["credit_out"][`${sender}_${receiver}`] = (globalThis.state["credit_out"][`${sender}_${receiver}`] || 0)
    globalThis.state["credit_out"][`${sender}_${receiver}`] += amount

    globalThis.storage.put("state", globalThis.state, {allowUnconfirmed: false, noCache: true})

    var credit = globalThis.state["credit"][sender]
    var earned = globalThis.state["earned"][receiver]
    return {credit: credit}
  }

  refund_for_resources(sender, receiver, params) {
    var amount = params.amount

    var credit_out = globalThis.state[`${receiver}_${sender}`] || 0
    if (!Number.isInteger(amount)) {
      return {error: "amount_must_be_integer"}
    }
    if (amount < 0) {
      return {error: "amount_must_be_gt_0"}
    }
    if (amount > credit_out) {
      return {error: "amount_must_be_lt_credit_out"}
    }

    globalThis.state["credit"][receiver] += amount
    globalThis.state["earned"][sender] = (globalThis.state["earned"][sender] || 0)
    globalThis.state["earned"][sender] -= amount
    globalThis.state["earned_lifetime"][sender] -= amount

    globalThis.state["credit_out"][`${receiver}_${sender}`] = (globalThis.state["credit_out"][`${receiver}_${sender}`] || 0)
    globalThis.state["credit_out"][`${receiver}_${sender}`] -= amount

    globalThis.storage.put("state", globalThis.state, {allowUnconfirmed: false, noCache: true})

    var credit = globalThis.state["credit"][receiver]
    var earned = globalThis.state["earned"][sender]
    return {earned: earned}
  }
}
