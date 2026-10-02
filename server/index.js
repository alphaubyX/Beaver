'use strict';

const { createApp } = require('./app');
const { configFromEnv, describeDb } = require('./config');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const config = configFromEnv();
const app = createApp(config);

app.locals.ready.then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Beaver is running on http://localhost:${PORT}`);
    console.log(`Data is stored in ${describeDb(config.dbFile)}`);
    if (app.locals.adminMessage) console.log(app.locals.adminMessage);
  });
}, (err) => {
  console.error(`Beaver could not start: ${err.message}`);
  process.exit(1);
});
