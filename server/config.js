'use strict';

const path = require('node:path');

/** Read Beaver's settings from environment variables. */
function configFromEnv(env = process.env) {
  const onVercel = !!env.VERCEL;
  // Turso's Vercel integration sets TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
  const remoteUrl = env.TURSO_DATABASE_URL || env.LIBSQL_URL;
  let dbFile = remoteUrl || env.BEAVER_DB;
  let ephemeral = false;
  if (!dbFile) {
    // Vercel functions only have a temporary /tmp folder: fine for a quick look, but data will not last.
    dbFile = onVercel ? '/tmp/beaver.db' : path.join(__dirname, '..', 'data', 'beaver.db');
    ephemeral = onVercel;
  }
  return {
    dbFile,
    dbAuthToken: env.TURSO_AUTH_TOKEN || env.LIBSQL_AUTH_TOKEN || env.BEAVER_DB_TOKEN,
    ephemeral,
    // Behind Vercel or another HTTPS proxy, trust it so sign-in cookies are marked secure.
    trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : (onVercel ? 1 : false),
    admin: {
      username: env.BEAVER_ADMIN_USERNAME,
      password: env.BEAVER_ADMIN_PASSWORD,
      name: env.BEAVER_ADMIN_NAME,
      resetPassword: /^(1|true|yes)$/i.test(env.BEAVER_ADMIN_RESET_PASSWORD || ''),
    },
  };
}

/** Describe where data lives without printing secrets. */
function describeDb(dbFile) {
  if (/^(libsql|https?|wss?):/i.test(dbFile)) return new URL(dbFile).host;
  return dbFile;
}

module.exports = { configFromEnv, describeDb };
