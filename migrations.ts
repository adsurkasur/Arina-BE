import { getDb, initializeDb } from "./db";

async function collectionExists(collectionName: string): Promise<boolean> {
  const collections = await getDb()
    .listCollections({ name: collectionName })
    .toArray();
  return collections.length > 0;
}

export async function migrate() {
  console.log("Running MongoDB migrations...");

  try {
    // Ensure the database is initialized
    await initializeDb();

    // Check and create collections with validators
    if (!(await collectionExists("users"))) {
      await getDb().createCollection("users", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["id", "email", "name"],
            properties: {
              id: { bsonType: "string" },
              email: { bsonType: "string" },
              name: { bsonType: "string" },
              photo_url: { bsonType: ["string", "null"] },
              created_at: { bsonType: "date" },
            },
          },
        },
      });
    }

    if (!(await collectionExists("chat_conversations"))) {
      await getDb().createCollection("chat_conversations", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["user_id", "title"],
            properties: {
              id: { bsonType: "string" },
              user_id: { bsonType: "string" },
              title: { bsonType: "string" },
              created_at: { bsonType: "date" },
              updated_at: { bsonType: "date" },
            },
          },
        },
      });
    }

    if (!(await collectionExists("chat_messages"))) {
      await getDb().createCollection("chat_messages", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["conversation_id", "content", "sender_id"],
            properties: {
              id: { bsonType: "string" },
              conversation_id: { bsonType: "string" },
              content: { bsonType: "string" },
              sender_id: { bsonType: "string" },
              created_at: { bsonType: "date" },
            },
          },
        },
      });
    }

    if (!(await collectionExists("analysis_results"))) {
      await getDb().createCollection("analysis_results", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["user_id", "type", "data"],
            properties: {
              id: { bsonType: "string" },
              user_id: { bsonType: "string" },
              type: { bsonType: "string" },
              data: { bsonType: "object" },
              created_at: { bsonType: "date" },
              updated_at: { bsonType: "date" },
            },
          },
        },
      });
    }

    // Create indexes
    await getDb().collection("users").createIndex({ email: 1 }, { unique: true });
    await getDb().collection("users").createIndex({ id: 1 }, { unique: true });
    await getDb().collection("chat_conversations").createIndex({ user_id: 1 });
    await getDb().collection("chat_messages").createIndex({ conversation_id: 1 });
    await getDb().collection("chat_messages").createIndex({ created_at: 1 });
    await getDb().collection("analysis_results").createIndex({ user_id: 1 });

    console.log("MongoDB migrations completed successfully");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
}
