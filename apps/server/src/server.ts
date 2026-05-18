import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./database/mongo";
import { initSockets } from "./sockets";
async function bootstrap(): Promise<void> {
  await connectMongo(env.mongoUri);

  const app = createApp();

  const server = http.createServer(app);

  // initialize socket.io handlers
  initSockets(server);

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is running on port ${env.port}`);
  });
}

connectMongo(env.mongoUri)
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("MongoDB connected ✅");

    const app = createApp();
    const server = http.createServer(app);

    // initialize socket.io handlers
    initSockets(server);

    server.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server 🖥️ is running on port ${env.port}`);
    });
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start server", error);
    process.exit(1);
  });
