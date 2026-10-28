# QMS Server

Node + Express + Sequelize (PostgreSQL / Supabase) + Socket.IO.

```
Server/
  Config/       env + Sequelize connection
  Controllers/  thin request handlers
  Middleware/   auth (JWT cookie), device tokens, validation, rate limits, errors
  Models/       Sequelize models + associations (Models/index.js)
  Routes/       /api/{auth,kiosk,display,employee,admin,webhooks}
  Service/      business logic (queueService is the core)
  Utils/        queueEngine (pure placement rules), socket, token, time, schemas, seed
  tests/        unit + integration tests
```

## Setup
```bash
cp .env.example .env        # fill in DATABASE_URL and JWT_SECRET
npm install
npm run db:sync             # creates the tables
npm run seed                # branch, Window 1/2, admin, kiosk + TV device tokens (printed once)
npm run dev
```

## Tests
```bash
npm test                                                   # queue-rule unit tests
TEST_DATABASE_URL=postgresql://... npm test                # + integration tests (WIPES that database)
```

## API cheat sheet
| Who | Auth | Endpoints |
|---|---|---|
| Kiosk | `x-device-token` | `GET /api/kiosk/config`, `POST /api/kiosk/tickets` |
| TV display | `x-device-token` | `GET /api/display/state` + socket `ticket:called` |
| Employee | cookie | `GET /api/employee/windows`, `POST/DELETE /session`, `POST /break`, `/heartbeat`, `/next`, `/done`, `/recall`, `/no-show`, `GET /queue` |
| Admin | cookie | `/api/admin/{users,windows,devices,settings}` |

Sockets: connect with `auth: { deviceToken }` (kiosk/TV) or the login cookie. Events: `ticket:called`, `queue:updated`, `window:updated`, `settings:updated`.
Employees must call `POST /api/employee/heartbeat` every ~15 s while their window is open.
