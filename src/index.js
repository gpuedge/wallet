// In order for our ES6 shim to find the class, we must export it
// from the root of the CommonJS bundle
const MonolithWallet = require('./monolith_wallet.js')
const DOEmail = require('./do_email.js')
exports.MonolithWallet = MonolithWallet
exports.DOEmail = DOEmail

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
  return obj.fetch(request.url)
  let resp = await obj.fetch(request.url)
  return new Response(await resp.text())
}

async function handleRequestEmail(request, env) {
  let id = env.DOEMAIL.idFromName('email')
  let obj = env.DOEMAIL.get(id)
  return obj.fetch(request)
}

exports.handlers = {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return handleOptions(request);
      }

      if (request.method === "GET") {
        return new Response(index_bin, {status: 200, headers: {"Content-Type": "text/html"}})
      }

      if (request.method === "POST") {
        const url = new URL(request.url);
        if (url.pathname == "/api/email/login") {
          return await handleRequestEmail(request, env)
        }
        if (url.pathname == "/api/wallet/transaction") {
          return await handleRequestWallet(request, env)
        }
      }

      return new Response("", {status: 404, headers: {"Content-Type": "text/html"}})
    } catch (e) {
      return new Response(e.message)
    }
  },
}