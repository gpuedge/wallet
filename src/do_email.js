const Util = require('./util.js')

module.exports = class DOEmail {
  constructor(controller, env) {
    globalThis.controller = controller;
    globalThis.storage = controller.storage;
    globalThis.ticking = false;
    globalThis.env = env;

    controller.blockConcurrencyWhile(async () => {
        let state = await globalThis.storage.get("state") || {email: {}};
        globalThis.state = state;
    })
  }

  async fetch(request) {
    let url = new URL(request.url);

    switch (url.pathname) {
    case "/api/email/login":
      var json = await request.json()
      return this.email_login(json)

    default:
      return new Response("Not found", {status: 404});
    }
  }

  email_login(json) {
    var email = json.email
    if (!Util.is_string(email) || email.length < 3 || email.length > 255) {
        return new Response(JSON.stringify({error: "invalid_email"}));
    }
    var password = json.password
    if (!Util.is_string(password)) {
        return new Response(JSON.stringify({error: "invalid_password"}));
    }
    if (password.length < 6 || password.length > 255) {
        return new Response(JSON.stringify({error: "password_less_than_6"}));
    }

    var lookup = globalThis.state["email"][email]
    if (!lookup) {
      var [pub, ed25519_secret_key] = Util.generate_random_keypair()
      globalThis.state["email"][email] = {ed25519_secret_key: ed25519_secret_key, password: password}
      globalThis.storage.put("state", globalThis.state, {allowUnconfirmed: false, noCache: true})
      return new Response(JSON.stringify({error: "ok", ed25519_secret_key: ed25519_secret_key}));
    }

    if (lookup && lookup.password == password) {
      return new Response(JSON.stringify({error: "ok", ed25519_secret_key: lookup.ed25519_secret_key}));
    } else {
      return new Response(JSON.stringify({error: "invalid_password"}));
    }
  }
}
