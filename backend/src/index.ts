import { createServer } from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { attachSocketServer } from './socket.js';

const app = createApp();
const httpServer = createServer(app);
attachSocketServer(httpServer);

httpServer.listen(env.port, '0.0.0.0', () => {
  console.info(`Avichian API running on http://0.0.0.0:${env.port} [${env.nodeEnv}]`);
  console.info(`Local:   http://localhost:${env.port}`);
  console.info(`Socket:  Socket.IO attached on same port`);
  console.info(`Network: use your LAN IP, e.g. http://<your-ip>:${env.port}`);
});
