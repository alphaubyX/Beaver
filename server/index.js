'use strict';

const path = require('node:path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.BEAVER_DB || path.join(__dirname, '..', 'data', 'beaver.db');
// Set TRUST_PROXY=1 when running behind a reverse proxy (nginx, Caddy, IIS) that terminates HTTPS.
const TRUST_PROXY = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false;

// Optional admin login from the environment (or a .env file next to package.json).
const ADMIN = {
  username: process.env.BEAVER_ADMIN_USERNAME,
  password: process.env.BEAVER_ADMIN_PASSWORD,
  name: process.env.BEAVER_ADMIN_NAME,
  resetPassword: /^(1|true|yes)$/i.test(process.env.BEAVER_ADMIN_RESET_PASSWORD || ''),
};

let app;
try {
  app = createApp({ dbFile: DB_FILE, trustProxy: TRUST_PROXY, admin: ADMIN });
} catch (err) {
  console.error(`Beaver could not start: ${err.message}`);
  process.exit(1);
}

app.listen(PORT, HOST, () => {
  console.log(`Beaver is running on http://localhost:${PORT}`);
  console.log(`Data is stored in ${DB_FILE}`);
  if (app.locals.adminMessage) console.log(app.locals.adminMessage);
});
