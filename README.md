# QMS Server (Node + Express + Sequelize + Socket.IO)

Login is a **JWT sent in the `Authorization: Bearer <token>` header**. There are no cookies.
Kiosk / TV screens send their device token in the `x-device-token` header. PayMongo calls use axios.

    npm install
    npm run db:sync      # first time only (or: npm run db:upgrade after model changes)
    npm run seed
    npm run dev
    npm test             # unit tests; add TEST_DATABASE_URL=... (a throwaway database!) for the full suite

Environment variables: see `.env.example`. Important: `CLIENT_ORIGINS` = your Vercel address (a trailing slash is ignored).

API cheat sheet
- `POST /api/auth/login` -> `{ token, user }`   `GET /api/auth/me`   `POST /api/auth/logout`
- Kiosk (device token): `GET /api/kiosk/config`, `POST /api/kiosk/tickets`, `POST /api/kiosk/payments`, `GET /api/kiosk/payments/:id`
- TV (device token): `GET /api/display/state`
- Employee: `/api/employee/*`   Supervisor + Admin: `/api/payments`   Admin: `/api/admin/*`
- Admin devices: `POST /api/admin/devices`, `POST /api/admin/devices/:id/rotate` (new token), `DELETE /api/admin/devices/:id`
- PayMongo webhook: `POST /api/webhooks/paymongo`
Sockets: connect with `auth: { token }` (staff) or `auth: { deviceToken }` (kiosk / TV).
