module.exports = class MonolithWallet {
  constructor(controller, env) {
    globalThis.controller = controller;
    globalThis.storage = controller.storage;
    globalThis.ticking = false;
    globalThis.env = env;

    controller.blockConcurrencyWhile(async () => {
        let state = await globalThis.storage.get("state") || {
          credit: {}, credit_out: {}, 
          earned: {}, earned_lifetime: {}
        };
        globalThis.state = state;
    })
  }

  async fetch(request) {
    let url = new URL(request.url);

    switch (url.pathname) {
    case "/api/wallet/transaction":
      var json = await request.json()
      return transaction(json)

    default:
      return new Response("Not found", {status: 404});
    }
  }

  transaction(json) {
    var tx_encoded = json.tx_encoded
    var tx_signature = json.tx_signature
    //verify tx signature
    //decode transaction as b58 or b64
    //verify timestamp atleast 1minute recent
    var sender = tx.sender;
    var receiver = tx.receiver;
    var timestamp = tx.timestamp;
    var opcode = tx.opcode;
    var params = tx.params;

    var result;
    if (opcode == "pay_for_resources") {
      result = pay_for_resources(sender, receiver, timestamp, opcode, params)
    }
    if (opcode == "refund_for_resources") {
      result = refund_for_resources(sender, receiver, timestamp, opcode, params)
    }

    var rx = {signer: "Our BDFL", timestamp: Date.now(), result: result}
    var rx_signature = "sign|tx_encoded+rx_encoded"
    var tx_rx = {
      tx_encoded: json.tx_encoded,
      tx_signature: json.tx_signature,
      rx_encoded: rx_encoded,
      tx_rx_signature: tx_rx_signature,
    }

    return new Response(JSON.stringify({error: "invalid_opcode"}), {status: 200});
  }

  pay_for_resources(sender, receiver, timestamp, opcode, params) {
    var amount = params.amount;
    //if string float?
    //if float convert to integer
    //if string convert to number
    //check > 0, check < total amount
    //
    var balance = globalThis.state["credit"][sender] || 0
    if (amount < 0) {
      return new Response(JSON.stringify({error: "amount_must_be_gt_0"}), {status: 200});
    }
    if (amount > balance) {
      return new Response(JSON.stringify({error: "amount_must_be_lt_balance"}), {status: 200});
    }

    globalThis.state["credit"][sender] -= amount
    globalThis.state["earned"][receiver] = (globalThis.state["earned"][receiver] || 0)
    globalThis.state["earned"][receiver] += amount
    globalThis.state["earned_lifetime"][receiver] += amount

    globalThis.state["credit_out"][`${sender}_${receiver}`] = (globalThis.state["credit_out"][`${sender}_${receiver}`] || 0)
    globalThis.state["credit_out"][`${sender}_${receiver}`] += amount

    var credit = globalThis.state["credit"][sender]
    var earned = globalThis.state["earned"][receiver]
    return new Response(JSON.stringify({error: "ok", balance: {credit: credit}}), {status: 200});
  }

  refund_for_resources(sender, receiver, timestamp, opcode, params) {
    var amount = params.amount;

    var credit_out = globalThis.state[`${receiver}_${sender}`] || 0
    if (amount < 0) {
      return new Response(JSON.stringify({error: "amount_must_be_gt_0"}), {status: 200});
    }
    if (amount > credit_out) {
      return new Response(JSON.stringify({error: "amount_must_be_lt_credit_out"}), {status: 200});
    }

    globalThis.state["credit"][receiver] += amount
    globalThis.state["earned"][sender] = (globalThis.state["earned"][sender] || 0)
    globalThis.state["earned"][sender] -= amount
    globalThis.state["earned_lifetime"][sender] -= amount

    globalThis.state["credit_out"][`${receiver}_${sender}`] = (globalThis.state["credit_out"][`${receiver}_${sender}`] || 0)
    globalThis.state["credit_out"][`${receiver}_${sender}`] -= amount

    var credit = globalThis.state["credit"][receiver]
    var earned = globalThis.state["earned"][sender]
    return new Response(JSON.stringify({error: "ok", balance: {earned: earned}}), {status: 200});
  }
}
