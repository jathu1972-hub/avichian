import { createServer } from 'http';
import { createApp } from './app.js';
import { env, logProductionWarnings } from './config/env.js';
import { attachSocketServer } from './socket.js';

const app = createApp();
const httpServer = createServer(app);
attachSocketServer(httpServer);

httpServer.listen(env.port, '0.0.0.0', () => {
  logProductionWarnings();
  console.info(`Avichian API running on http://0.0.0.0:${env.port} [${env.appEnv}]`);
  console.info(`Local:   http://localhost:${env.port}`);
  console.info(`Socket:  Socket.IO attached on same port`);
  console.info(`CORS:    ${env.frontendUrls.join(', ')}`);
  console.info(`Public:  ${env.publicApiUrl}`);
  if (!env.isProduction) {
    console.info(`Network: use your LAN IP, e.g. http://<your-ip>:${env.port}`);
  }
});
