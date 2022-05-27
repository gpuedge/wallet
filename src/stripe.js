async function hit_stripe(url, body) {
  var www_body = Object.keys(body).reduce((acc, key) => 
    acc.concat(`&${key}=${encodeURIComponent(body[key])}`)
  , "");
  www_body = www_body.substring(1);

  const init = {
    method: "POST",
    body: www_body,
    headers: {
      "authorization": `Basic ${btoa(globalThis.env.STRIPESK_DEV.concat(":"))}`,
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
  if (amount != "610" && amount != "2440" && amount != "12200") {
    return {error: "invalid_amount"}
  }

  var {client_secret, last_payment_error} = await hit_stripe("https://api.stripe.com/v1/payment_intents", {
    "amount": amount,
    "currency": "usd",
    //"automatic_payment_methods": {
    //  enabled: true,
    //},
    "metadata[public_key]": public_key,
  })
  return {client_secret: client_secret, last_payment_error: last_payment_error};
}

exports.create_payment_intent = create_payment_intent
