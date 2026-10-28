import { asyncHandler } from '../Utils/asyncHandler.js';
import * as paymentService from '../Service/paymentService.js';

// PayMongo -> POST /api/webhooks/paymongo  (needs the RAW body to check the signature; see app.js)
export const paymongo = asyncHandler(async (req, res) => {
  res.json(await paymentService.handleWebhook(req.rawBody, req.headers['paymongo-signature']));
});
