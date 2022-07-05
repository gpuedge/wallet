// In order for our ES6 shim to find the class, we must export it
// from the root of the CommonJS bundle
const MonolithWallet = require('./monolith_wallet.js')
const DOEmail = require('./do_email.js')
exports.MonolithWallet = MonolithWallet
exports.DOEmail = DOEmail

const Stripe = require('./stripe.js')
const Util = require('./util.js')
const nacl = require('tweetnacl');

import index_bin from './html/index.html'

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  //"Access-Control-Allow-Origin": request.headers.get("Origin"),
  //"Access-Control-Allow-Headers": "Cache-Control, Pragma, Origin, Accept, Authorization, Content-Type, X-Requested-With, Range",
  "Access-Control-Allow-Credentials": "true"
}

const REPLY = {
  status: 200,
  headers: {
    "Content-Type": "application/json;charset=UTF-8",
    ...corsHeaders
  },
}

function handleOptions(request) {
  if (request.headers.get("Origin") !== null &&
      request.headers.get("Access-Control-Request-Method") !== null &&
      request.headers.get("Access-Control-Request-Headers") !== null) {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    })
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      status: 200,
      headers: {
        "Allow": "GET, HEAD, POST, OPTIONS",
      }
    })
  }
}

async function handleRequestWallet(request, env) {
  let id = env.MONOLITHWALLET.idFromName('monolith_wallet')
  let obj = env.MONOLITHWALLET.get(id)
  return obj.fetch(request)
}

async function handleRequestEmail(request, env) {
  let id = env.DOEMAIL.idFromName('email')
  let obj = env.DOEMAIL.get(id)
  return obj.fetch(request)
}

exports.handlers = {
  async fetch(request, env) {
    globalThis.env = env;
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS" || request.method === "HEAD") {
        return handleOptions(request);
      }

      if (url.pathname == "/api/node/list") {
        const keys = (await env.NODELIST.list()).keys;
        const nodes = [];
        for (var x = 0; x<keys.length; x++) {
          const {name} = keys[x]
          const node = await env.NODELIST.get(name, {type: "json", cacheTtl: 300})
          nodes.push(node)
        }
        return new Response(JSON.stringify({error: "ok", nodes: nodes}))
      }

      if (request.method === "GET") {
        return new Response(index_bin, {status: 200, headers: {"Content-Type": "text/html"}})
      }

      if (request.method === "POST") {
        if (url.pathname == "/api/stripe/create-payment-intent") {
          var json = await request.json()
          var reply = await Stripe.create_payment_intent(json.public_key, json.amount);
          return new Response(JSON.stringify(reply), {status: 200, headers: {"Content-Type": "application/json"}})
        }
        if (url.pathname == "/api/stripe/webhook_AwZ863") {
          var [signature, json] = await Stripe.process_webhook(request);
          
          let id = env.MONOLITHWALLET.idFromName('monolith_wallet')
          let obj = env.MONOLITHWALLET.get(id)
          await obj.fetch(
            "https://ignore.com/api/wallet/stripe_mint", {
              method: "POST",
              body: JSON.stringify({signature: signature, params: json}),
              headers: {
                "Content-Type": "application/json"
              }
            }
          )

          return new Response("", {status: 200})
        }
        if (url.pathname == "/api/wallet/transaction") {
          return await handleRequestWallet(request, env)
        }
        if (url.pathname == "/api/wallet/balance") {
          return await handleRequestWallet(request, env)
        }
        if (url.pathname == "/api/email/login") {
          return await handleRequestEmail(request, env)
        }
        if (url.pathname == "/api/node/ping") {
          var json = await request.json()
          var ping_encoded = new TextEncoder().encode(json.json)
          var ping_signature = Util.from_b58(json.signature)
          var ping = JSON.parse(json.json)
          var ping_public_key = Util.from_b58(ping.farmer)

          //verify tx signature
          var valid = nacl.sign.detached.verify(
            ping_encoded, ping_signature, ping_public_key)
          if (!valid) {
            return new Response(JSON.stringify({error: "invalid_signature"}))
          }

          //Check stale
          var time_delta = ((Date.now()/1000) - ping.timestamp)
          if (time_delta > 60 || time_delta < -60) {
            return new Response(JSON.stringify({error: "stale_timestamp"}))
          }

          env.NODELIST.put(ping.identity, JSON.stringify(ping), {expirationTtl: 300})

          return new Response(JSON.stringify({error: "ok"}))
        }
      }
      return new Response("", {status: 404, headers: {"Content-Type": "text/html"}})
    } catch (e) {
      if (e.stack) {
        return new Response(JSON.stringify({error: e.message, stack_trace: e.stack}))
      } else {
        return new Response(JSON.stringify({error: e}))
      }
    }
  },
}