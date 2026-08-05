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

httpServer.listen(env.port, '0.0.0.0', () => {
  logProductionWarnings();
  console.info(`Avichian API running on http://0.0.0.0:${env.port} [${env.appEnv}]`);
  console.info(`Local:   http://localhost:${env.port}`);
  console.info(`Socket:  Socket.IO attached on same port`);
  console.info(`CORS:    ${env.frontendUrls.join(', ')}`);
  console.info(`Public:  ${env.publicApiUrl}`);
  console.info(`Uploads: POST /api/uploads (multipart field "file")`);
  if (!env.isProduction) {
    console.info(`Network: use your LAN IP, e.g. http://<your-ip>:${env.port}`);
  }
});
