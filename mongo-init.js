// MongoDB initialization script for Docker Compose
// Creates the database and initial collections structure

db = db.getSiblingDB("vibechat");

// Create message_buckets collection with schema validation
db.createCollection("message_buckets", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "channel_id",
        "seq_min",
        "seq_max",
        "message_count",
        "messages",
        "created_at",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        channel_id: { bsonType: "string", description: "UUID of the channel" },
        seq_min: {
          bsonType: "int",
          description: "Minimum sequence number in this bucket",
        },
        seq_max: {
          bsonType: "int",
          description: "Maximum sequence number in this bucket",
        },
        message_count: {
          bsonType: "int",
          description: "Count of messages in this bucket",
        },
        messages: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              _mid: { bsonType: "string", description: "Message UUID" },
              seq: { bsonType: "int", description: "Sequence number" },
              sender_id: { bsonType: "string", description: "User UUID" },
              body: { bsonType: "string" },
              media: { bsonType: "array" },
              reactions: { bsonType: "array" },
              receipts: { bsonType: "array" },
              sent_at: { bsonType: "date" },
              edited_at: { bsonType: "date" },
              deleted_by: { bsonType: "string" },
            },
          },
        },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" },
      },
    },
  },
});

// Create indexes for efficient queries
db.message_buckets.createIndex(
  { channel_id: 1, seq_max: -1 },
  { name: "idx_channel_seq_max" },
);

db.message_buckets.createIndex(
  { channel_id: 1, seq_min: 1, seq_max: 1 },
  { name: "idx_channel_seq_range" },
);

db.message_buckets.createIndex(
  { channel_id: 1, message_count: 1 },
  { name: "idx_channel_open_bucket", sparse: true },
);

db.message_buckets.createIndex(
  { channel_id: 1, "messages.sent_at": -1 },
  { name: "idx_channel_media", sparse: true },
);

print("✓ MongoDB vibechat database initialized");
print("✓ Collections and indexes created");
