import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { initializeConnections } from "./lib/db-init";
import { initSocket } from "./lib/socket";
import { EventBroker } from "./services/event-broker";

initializeConnections()
  .then(async () => {
    const app = createApp();
    const server = http.createServer(app);

    // Initialize Socket.IO
    initSocket(server);

    // Initialize Redis Pub/Sub Event Broker
    await EventBroker.init();

    server.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server is running on port ${env.port}`);
    });
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start server", error);
    process.exit(1);
  });
