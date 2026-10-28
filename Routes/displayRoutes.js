import { Router } from 'express';
import * as c from '../Controllers/displayController.js';
import { requireDevice } from '../Middleware/device.js';

const r = Router();
r.get('/state', requireDevice('display'), c.state);
export default r;
