// A tiny stand-in for api.paymongo.com so the payment code can be tested offline.
// It follows the request/response shapes in PayMongo's QR Ph docs. It does NOT prove the real API behaves the same.
import http from 'node:http';

export function startFakePaymongo() {
  const state = { calls: [], intents: new Map(), n: 0, failRetrieve: false };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      state.calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      let m;
      if (req.method === 'POST' && req.url === '/payment_intents') {
        const id = `pi_fake${++state.n}`;
        state.intents.set(id, { status: 'awaiting_payment_method', amount: body.data.attributes.amount });
        return send(200, { data: { id, attributes: { client_key: `${id}_client`, status: 'awaiting_payment_method' } } });
      }
      if (req.method === 'POST' && req.url === '/payment_methods') return send(200, { data: { id: 'pm_fake', attributes: { type: 'qrph' } } });
      if (req.method === 'POST' && (m = req.url.match(/^\/payment_intents\/(\w+)\/attach$/))) {
        state.intents.get(m[1]).status = 'awaiting_next_action';
        return send(200, { data: { id: m[1], attributes: { status: 'awaiting_next_action', next_action: { type: 'consume_qr', code: { image_url: 'data:image/png;base64,iVBORw0KGgo=' } } } } });
      }
      if (req.method === 'GET' && (m = req.url.match(/^\/payment_intents\/(\w+)$/))) {
        if (state.failRetrieve) return send(500, { errors: [{ detail: 'boom' }] });
        const i = state.intents.get(m[1]);
        return send(200, { data: { id: m[1], attributes: { status: i.status, amount: i.amount, payments: i.status === 'succeeded' ? [{ id: `pay_${m[1]}` }] : [] } } });
      }
      send(404, { errors: [{ detail: 'not found' }] });
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ state, url: `http://localhost:${server.address().port}`, close: () => server.close() })));
}
