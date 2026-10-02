'use strict';

// Vercel entry point: every request is routed here (see vercel.json) and handled by the Express app.

const { createApp } = require('../server/app');
const { configFromEnv } = require('../server/config');

const app = createApp(configFromEnv());

app.locals.ready.then(() => {
  if (app.locals.adminMessage) console.log(app.locals.adminMessage);
}, (err) => console.error(`Beaver could not start: ${err.message}`));

module.exports = app;
