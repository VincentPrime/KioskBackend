// JWT-in-header authentication over real HTTP. Needs TEST_DATABASE_URL (it WIPES that database).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

const URL = process.env.TEST_DATABASE_URL;
const skip = !URL && 'set TEST_DATABASE_URL to run';
let server, base, M, branch, win;
const SECRET = 'jwt-test-secret';

const call = async (method, path, { token, body, headers = {} } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, json: await res.json().catch(() => ({})) };
};
const login = async (username, password = 'password123') => (await call('POST', '/auth/login', { body: { username, password } }));

before(async () => {
  if (skip) return;
  Object.assign(process.env, { DATABASE_URL: URL, DB_SSL: 'false', JWT_SECRET: SECRET, CLIENT_ORIGINS: 'https://app.example.com/, https://other.example.com' });
  M = await import('../Models/index.js');
  const { hashPassword } = await import('../Service/authService.js');
  const { default: app } = await import('../app.js');
  await M.sequelize.sync({ force: true });
  branch = await M.Branch.create({ name: 'B' });
  win = await M.Window.create({ branchId: branch.id, name: 'Window 1' });
  const mk = async (username, role, extra = {}) => M.User.create({ branchId: branch.id, username, fullName: username, role, passwordHash: await hashPassword('password123'), ...extra });
  await mk('emp', 'employee'); await mk('boss', 'admin', { isSuper: true }); await mk('sup', 'supervisor');
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(async () => { if (!skip) { server.close(); await M.sequelize.close(); } });

test('login returns a JWT and sets NO cookie', { skip }, async () => {
  const r = await login('emp');
  assert.equal(r.status, 200);
  assert.ok(r.json.token.split('.').length === 3);
  assert.equal(r.headers.get('set-cookie'), null);
  assert.equal(r.json.user.role, 'employee');
  assert.equal(r.json.user.passwordHash, undefined);
});

test('wrong password / unknown user are both 401 with the same message', { skip }, async () => {
  const a = await login('emp', 'nope'); const b = await login('ghost', 'nope');
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.json.error.message, b.json.error.message);
});

test('protected routes need the Bearer header; cookies are ignored', { skip }, async () => {
  assert.equal((await call('GET', '/auth/me')).status, 401);
  const { json: { token } } = await login('emp');
  assert.equal((await call('GET', '/auth/me', { headers: { Cookie: `qms_token=${token}` } })).status, 401);   // a cookie alone does nothing
  assert.equal((await call('GET', '/auth/me', { token })).json.user.username, 'emp');
});

test('two people on the same PC never mix up: each request is identified only by its own token', { skip }, async () => {
  const emp = (await login('emp')).json.token;
  const admin = (await login('boss')).json.token;
  assert.equal((await call('GET', '/auth/me', { token: emp })).json.user.username, 'emp');
  assert.equal((await call('GET', '/auth/me', { token: admin })).json.user.username, 'boss');
  assert.equal((await call('GET', '/admin/users', { token: emp })).status, 403);     // employee token cannot use admin routes
  assert.equal((await call('GET', '/admin/users', { token: admin })).status, 200);
  assert.equal((await call('POST', '/auth/logout', { token: emp })).status, 200);    // "logout" needs no cookie handling
  assert.equal((await call('GET', '/admin/users', { token: admin })).status, 200);   // admin unaffected
});

test('forged, expired, wrong-algorithm and tampered tokens are rejected', { skip }, async () => {
  const user = await M.User.findOne({ where: { username: 'emp' } });
  const bad = {
    garbage: 'not.a.jwt',
    wrongSecret: jwt.sign({ sub: user.id, role: 'admin' }, 'other-secret'),
    expired: jwt.sign({ sub: user.id, role: 'employee' }, SECRET, { expiresIn: -10 }),
    hs512: jwt.sign({ sub: user.id, role: 'employee' }, SECRET, { algorithm: 'HS512' }),
    none: `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, role: 'admin' })).toString('base64url')}.`,
  };
  for (const [name, token] of Object.entries(bad)) assert.equal((await call('GET', '/auth/me', { token })).status, 401, name);
});

test('a role claim in the token cannot grant access: the role comes from the database', { skip }, async () => {
  const user = await M.User.findOne({ where: { username: 'emp' } });
  const sneaky = jwt.sign({ sub: user.id, role: 'admin' }, SECRET, { algorithm: 'HS256' });   // correctly signed, but lies about the role
  assert.equal((await call('GET', '/admin/users', { token: sneaky })).status, 403);
});

test('deactivated accounts lose access immediately', { skip }, async () => {
  const token = (await login('emp')).json.token;
  await M.User.update({ isActive: false }, { where: { username: 'emp' } });
  assert.equal((await call('GET', '/auth/me', { token })).status, 401);
  assert.equal((await login('emp')).status, 401);
  await M.User.update({ isActive: true }, { where: { username: 'emp' } });
});

test('supervisor token cannot reach employee or admin routes, only payments', { skip }, async () => {
  const token = (await login('sup')).json.token;
  assert.equal((await call('GET', '/employee/windows', { token })).status, 403);
  assert.equal((await call('GET', '/admin/users', { token })).status, 403);
  assert.equal((await call('GET', '/payments', { token })).status, 200);
});

test('CORS: allows the listed frontends (trailing slash tolerated), blocks others, allows Authorization', { skip }, async () => {
  const pre = (origin) => fetch(`${base}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-branch-id' } });
  const ok = await pre('https://app.example.com');
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.com');
  assert.match(ok.headers.get('access-control-allow-headers'), /authorization/i);
  assert.equal((await pre('https://other.example.com')).headers.get('access-control-allow-origin'), 'https://other.example.com');
  assert.equal((await pre('https://evil.example.com')).headers.get('access-control-allow-origin'), null);
});

test('device token rotate: old token dies at once, new one works, list never shows hashes', { skip }, async () => {
  const admin = (await login('boss')).json.token;
  const created = (await call('POST', '/admin/devices', { token: admin, body: { kind: 'kiosk', name: 'K' } })).json.device;
  const kiosk = (t) => call('GET', '/kiosk/config', { headers: { 'x-device-token': t } });
  assert.equal((await kiosk(created.token)).status, 200);
  const rotated = (await call('POST', `/admin/devices/${created.id}/rotate`, { token: admin })).json.device;
  assert.notEqual(rotated.token, created.token);
  assert.equal((await kiosk(created.token)).status, 401);
  assert.equal((await kiosk(rotated.token)).status, 200);
  const list = (await call('GET', '/admin/devices', { token: admin })).json.devices;
  assert.ok(list.every((d) => d.tokenHash === undefined && d.token === undefined));
  await call('DELETE', `/admin/devices/${created.id}`, { token: admin });
  assert.equal((await call('POST', `/admin/devices/${created.id}/rotate`, { token: admin })).status, 404);   // revoked devices cannot be revived
  assert.equal((await kiosk(rotated.token)).status, 401);
});
