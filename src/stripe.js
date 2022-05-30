async function hit_stripe(url, body) {
  var www_body = Object.keys(body).reduce((acc, key) => 
    acc.concat(`&${key}=${encodeURIComponent(body[key])}`)
  , "");
  www_body = www_body.substring(1);

  const init = {
    method: "POST",
    body: www_body,
    headers: {
      "authorization": `Basic ${btoa(globalThis.env.STRIPESK.concat(":"))}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    }
  }
  const response = await fetch(url, init);
  if (response.status != 200) {
    throw {error: "stripe_api_error", status: response.status, response: await response.json()}
  }
  return await response.json();
}

async function create_payment_intent(public_key, amount) {
  if (amount != 610 && amount != 2440 && amount != 12200) {
    return {error: "invalid_amount"}
  }

  var {client_secret, last_payment_error} = await hit_stripe("https://api.stripe.com/v1/payment_intents", {
    "amount": amount.toString(),
    "currency": "usd",
    "automatic_payment_methods[enabled]": true,
    "metadata[public_key]": public_key,
  })
  return {client_secret: client_secret, last_payment_error: last_payment_error};
}

async function process_webhook(request) {
  var [verified, signature, json] = await unwrap_webhook(request)
  if (!verified) {
    return [null, null];
  }
  return [signature, json]
}

async function unwrap_webhook(request) {
  var sig_obj = request.headers
    .get("Stripe-Signature")
    .split(",")
    .reduce((acc,o)=> {var [k,v] = o.split("="); return {...acc, [k]: v}}, {})
  var body = await request.text()
  var json = JSON.parse(body)
  var signed_payload = `${sig_obj.t}.${body}`

  const encoder = new TextEncoder();

  const hexStringToUint8Array = hexString => {
    const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    return bytes;
  };

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(globalThis.env.STRIPEWHSEC),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    hexStringToUint8Array(sig_obj.v1),
    encoder.encode(signed_payload)
  );

  var credit = "0";
  if (json.data.object.amount_received == 610)
    credit = 500000000;
  if (json.data.object.amount_received == 2440)
    credit = 2000000000;
  if (json.data.object.amount_received == 12200)
    credit = 10000000000;

  var reply = {
    credit: credit,
    receiver: json.data.object.metadata.public_key,
  }

  //console.log(json.data.object.charges.data[0].metadata.public_key)
  //console.log(json.data.object.charges.data[0].outcome.network_status) approved_by_network
  //console.log(json.data.object.charges.data[0].outcome.type) authorized
  //console.log(json.data.object.charges.data[0].outcome.risk_score) 40
  //console.log(json.data.object.charges.data[0].outcome.risk_level) normal

  var success = verified && json.data.object.status == "succeeded"

  //const elapsed = Math.floor(Date.now() / 1000) - Number(sig_obj.t);
  //var valid = verified && !(tolerance && elapsed > tolerance)
  return [success, sig_obj.v1, reply]
}

exports.create_payment_intent = create_payment_intent
exports.process_webhook = process_webhook
exports.unwrap_webhook = unwrap_webhook
