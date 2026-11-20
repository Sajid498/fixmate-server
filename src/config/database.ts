
import dns from "node:dns";
import { Db, MongoClient } from "mongodb";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is missing from the backend environment.");
}

const databaseName = "fixmate";

const client = new MongoClient(mongoUri, {
  maxPoolSize: 10,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 15000,
});

let database: Db | null = null;
let connectionPromise: Promise<Db> | null = null;

export async function connectDatabase(): Promise<Db> {
  if (database) {
    return database;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      await client.connect();

      const db = client.db(databaseName);
      await db.command({ ping: 1 });

      database = db;
      console.log(`MongoDB connected successfully: ${databaseName}`);

      return db;
    } catch (error) {
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

export function getDatabase(): Db {
  if (!database) {
    throw new Error("Database is not connected. Call connectDatabase first.");
  }

  return database;
}

export function getMongoClient(): MongoClient {
  if (!database) {
    throw new Error("Database is not connected. Call connectDatabase first.");
  }

  return client;
}

export async function closeDatabase(): Promise<void> {
  await client.close();
  database = null;
  connectionPromise = null;
}
