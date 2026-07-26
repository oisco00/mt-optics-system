const serverless = require('serverless-http');
const { app, initialize } = require('../../backend/src/app');

let cachedHandler;

exports.handler = async (event, context) => {
  await initialize();
  if (!cachedHandler) cachedHandler = serverless(app);

  const path = event.path || '';
  if (!path.startsWith('/api')) {
    const stripped = path.replace('/.netlify/functions/api', '');
    event = { ...event, path: `/api${stripped.startsWith('/') ? stripped : `/${stripped}`}` };
  }

  return cachedHandler(event, context);
};
