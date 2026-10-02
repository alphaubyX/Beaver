'use strict';

const path = require('node:path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.BEAVER_DB || path.join(__dirname, '..', 'data', 'beaver.db');
// Set TRUST_PROXY=1 when running behind a reverse proxy (nginx, Caddy, IIS) that terminates HTTPS.
const TRUST_PROXY = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false;

const app = createApp({ dbFile: DB_FILE, trustProxy: TRUST_PROXY });

app.listen(PORT, HOST, () => {
  console.log(`Beaver is running on http://localhost:${PORT}`);
  console.log(`Data is stored in ${DB_FILE}`);
});
