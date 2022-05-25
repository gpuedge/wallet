module.exports = class MonolithWallet {
  constructor(controller, env) {
    globalThis.controller = controller;
    globalThis.storage = controller.storage;
    globalThis.ticking = false;
    globalThis.env = env;

    controller.blockConcurrencyWhile(async () => {
        let state = await globalThis.storage.get("state") || {vms: {}};
        globalThis.state = state;
    })
  }

  async fetch(request) {
    let url = new URL(request.url);

    switch (url.pathname) {
    default:
      return new Response("Not found", {status: 404});
    }
  }
}
