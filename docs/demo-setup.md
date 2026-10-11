# Demo setup (development only)

Use this to try PDDMS with ready-made Admin, Staff and Cashier accounts and a small set of
fictional pharmacy records. It is a development tool. It is not part of the installed application.

## Commands

```bash
npm run demo:setup   # create ./pddms-demo.db with demo accounts and sample data
npm run demo:dev     # same, then start the app in development mode on that database
npm run test:roles   # check demo setup, role dashboards and permission rules
```

Options (after `--`): `--database <path>` to choose the demo database file, and
`--user-data <folder>` to choose where the sample invoice file is stored (default: the app's
Electron data folder, for example `%APPDATA%\pddms` on Windows).

## Demo sign-ins

These credentials are fictional and exist only in the demo database. Never use them for a real
pharmacy account.

| Role                   | Username       | Password           | Lands on                                                  |
| ---------------------- | -------------- | ------------------ | --------------------------------------------------------- |
| Admin (Master account) | `demo.admin`   | `DemoAdmin#2026`   | Admin dashboard: sales, stock, purchasing, users, reports |
| Staff                  | `demo.staff`   | `DemoStaff#2026`   | Pharmacy operations: stock, expiry, receiving, suppliers  |
| Cashier                | `demo.cashier` | `DemoCashier#2026` | Checkout: own sales today, low stock, start a sale        |

`demo.blocked` is a blocked Staff account with a random password. It shows the blocked state in
User management and cannot sign in.

## What the sample data contains

All names, phone numbers (`091700001xx`/`091700002xx`) and e-mail addresses (`@example.com`) are
fictional. Every record is created through the app's own IPC handlers, so the normal validation,
password hashing, stock, discount and payment rules apply.

- 3 suppliers and 8 products.
- 5 purchase orders: 2 received (one dated about 200 days ago, one about 25 days ago), 1 partially
  received, 1 draft and 1 cancelled.
- 7 inventory batches from receiving, covering normal stock, near expiry (about 45 days), an
  expired batch, a low-stock product and an out-of-stock product.
- 2 supplier invoices with an attached sample PDF: one paid in full, one partly paid with the
  balance due in 5 days.
- 4 customers: a walk-in customer, a Senior Citizen, a PWD customer and a clinic used for
  wholesale.
- 4 retail sales by the cashier (with Senior Citizen and PWD discounts), 1 delivered wholesale
  order with a partial payment and 1 pending wholesale order.

Dashboard figures are calculated live from these records; none are stored as fixed numbers.

## Safety rules

- The demo database is a separate file (`pddms-demo.db`, ignored by Git like every `*.db`).
  `npm run dev` and installed builds keep using their own database and the first-launch Master
  Account setup.
- Setup refuses any database file that already contains records that are not demo data, and an
  existing demo database is left unchanged. Running the command again is safe and creates no
  duplicates. To start over, delete `pddms-demo.db` and run it again.
- The data is built in a temporary file and only moved into place when every step succeeded.
- The script does not run with `NODE_ENV=production`, and `scripts/` is excluded from packaged
  builds by `electron-builder.yml`, so no demo credentials ship with the app.
- Purchase order and sale dates: the two received orders are back-dated so that order, delivery
  and expiry dates stay in order. The other orders and all sales are dated on the day the setup
  runs, so "today" figures on the dashboards are populated.
