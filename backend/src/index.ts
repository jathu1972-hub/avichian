import { createServer } from 'http';
import { createApp } from './app.js';
import { env, logProductionWarnings } from './config/env.js';
import { attachSocketServer } from './socket.js';
import { ensureUploadStorageReady } from './services/storage.service.js';

ensureUploadStorageReady();

const app = createApp();
const httpServer = createServer(app);
// Allow large multipart uploads without premature socket close
httpServer.requestTimeout = 0;
httpServer.headersTimeout = 0;
httpServer.timeout = 10 * 60 * 1000; // 10 min for large videos
attachSocketServer(httpServer);

// Keep process alive on unexpected errors; platform restarts on exit.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException — process will exit for platform restart', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection — process will exit for platform restart', reason);
  process.exit(1);
});

httpServer.listen(env.port, '0.0.0.0', () => {
  logProductionWarnings();
  console.info(`Avichian API running on 0.0.0.0:${env.port} [${env.appEnv}]`);
  console.info(`Socket:  Socket.IO attached on same port`);
  console.info(`CORS:    ${env.frontendUrls.join(', ')}`);
  console.info(`Public:  ${env.publicApiUrl}`);
  console.info(`Health:  GET /health and GET /api/health`);
  console.info(`Uploads: POST /api/uploads (multipart field "file")`);
  if (!env.isProduction) {
    console.info(`Local:   http://localhost:${env.port}`);
    console.info(`Network: use your LAN IP, e.g. http://<your-ip>:${env.port}`);
  }
});
