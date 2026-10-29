// Thin wrapper around the PayMongo REST API (QR Ph via the Payment Intent workflow).
// Docs: https://developers.paymongo.com/docs/payment-acceptance-qr-ph-api
import axios from 'axios';
import crypto from 'crypto';
import { env } from '../Config/env.js';
import { ApiError } from '../Utils/ApiError.js';

const P = env.paymongo;
export const gcashAvailable = () => P.mock || !!(P.secretKey && P.publicKey);
const basic = (key) => `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

// axios: hard timeout, no redirects, never throws on HTTP errors (we map them ourselves)
const http = axios.create({ timeout: 15_000, maxRedirects: 0, validateStatus: () => true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });

async function call(method, path, key, attributes) {
  let res;
  try {
    res = await http.request({ method, url: `${P.apiUrl}${path}`, headers: { Authorization: basic(key) }, data: attributes ? { data: { attributes } } : undefined });
  } catch { throw new ApiError(502, 'Cannot reach PayMongo', 'PROVIDER_UNREACHABLE'); }
  if (res.status < 200 || res.status >= 300) throw new ApiError(502, res.data?.errors?.[0]?.detail || `PayMongo error (${res.status})`, 'PROVIDER_ERROR');
  return res.data.data;
}

const mockQr = (amount) => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#fff" stroke="#000" stroke-width="6"/>` +
  `<text x="150" y="130" font-size="28" text-anchor="middle" font-family="sans-serif">TEST QR</text>` +
  `<text x="150" y="175" font-size="24" text-anchor="middle" font-family="sans-serif">PHP ${amount}</text></svg>`).toString('base64')}`;

/** Create the intent, create the QR Ph payment method, attach it, and return the QR image (data URL). */
export async function createQr({ amountPesos, description, metadata, expirySeconds }) {
  if (!gcashAvailable()) throw new ApiError(503, 'GCash payments are not configured', 'PAYMENTS_NOT_CONFIGURED');
  if (P.mock) return { intentId: `pi_mock_${crypto.randomBytes(8).toString('hex')}`, qrImage: mockQr(amountPesos) };

  const intent = await call('POST', '/payment_intents', P.secretKey, {
    amount: Math.round(amountPesos * 100), currency: 'PHP', payment_method_allowed: ['qrph'], description, metadata,   // amount is in centavos
  });
  const method = await call('POST', '/payment_methods', P.publicKey, {
    type: 'qrph', expiry_seconds: Math.min(9000, Math.max(60, Math.round(expirySeconds))),
  });
  const attached = await call('POST', `/payment_intents/${intent.id}/attach`, P.publicKey, {
    payment_method: method.id, client_key: intent.attributes.client_key,
  });
  let image = attached.attributes?.next_action?.code?.image_url;
  if (!image) throw new ApiError(502, 'PayMongo did not return a QR code', 'NO_QR');
  if (!image.startsWith('data:')) image = `data:image/png;base64,${image}`;
  return { intentId: intent.id, qrImage: image };
}

/** Ask PayMongo for the truth: never trust the browser or a webhook body alone. */
export async function retrieveIntent(intentId) {
  const d = await call('GET', `/payment_intents/${intentId}`, P.secretKey);
  return { status: d.attributes.status, amount: d.attributes.amount, paymentId: d.attributes.payments?.[0]?.id || null };
}

/** Paymongo-Signature: "t=<timestamp>,te=<test sig>,li=<live sig>"; HMAC-SHA256 of "<t>.<raw body>" with the webhook secret. */
export function verifyWebhookSignature(rawBody, header, secret = P.webhookSecret) {
  if (!secret || !header || !rawBody) return false;
  const parts = Object.fromEntries(String(header).split(',').map((s) => { const i = s.indexOf('='); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; }));
  const body = rawBody.toString('utf8');
  let live = false;
  try { live = JSON.parse(body).data?.attributes?.livemode === true; } catch { return false; }
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex');
  const given = live ? parts.li : parts.te;
  if (!given || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
