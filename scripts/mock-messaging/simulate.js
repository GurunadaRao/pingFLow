const ioClient = require("socket.io-client");
const axios = require("axios");

const SERVER = process.env.SERVER || "http://localhost:5000";
const CHANNEL = "channel1";

async function run() {
  console.log("Starting simulation against", SERVER);

  // Create two socket clients
  const alice = ioClient(SERVER, {
    auth: { token: "alice" },
    transports: ["websocket"],
  });
  const bob = ioClient(SERVER, {
    auth: { token: "bob" },
    transports: ["websocket"],
  });

  alice.on("connect", () => {
    console.log("Alice connected", alice.id);
    alice.emit("join", CHANNEL);
  });

  bob.on("connect", () => {
    console.log("Bob connected", bob.id);
    bob.emit("join", CHANNEL);
  });

  alice.on("message.created", (payload) => {
    console.log("Alice received message.created", payload.data);
  });

  bob.on("message.created", (payload) => {
    console.log("Bob received message.created", payload.data);
  });

  // wait for both to connect
  await new Promise((res) => setTimeout(res, 1000));

  // Alice sends a message via REST
  const aMsg = await axios.post(
    `${SERVER}/api/v1/channels/${CHANNEL}/messages`,
    {
      text: "Hello from Alice",
      sender: "alice",
    },
  );
  console.log("Alice sent REST message, id=", aMsg.data.id);

  // Bob sends a message via REST
  const bMsg = await axios.post(
    `${SERVER}/api/v1/channels/${CHANNEL}/messages`,
    {
      text: "Hey Alice, Bob here",
      sender: "bob",
    },
  );
  console.log("Bob sent REST message, id=", bMsg.data.id);

  // Wait to receive events
  await new Promise((res) => setTimeout(res, 1000));

  alice.disconnect();
  bob.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
