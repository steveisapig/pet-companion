import * as SQLite from 'expo-sqlite';

const DB_NAME = 'pet_companion.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  google_id TEXT UNIQUE,
  apple_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  type INTEGER NOT NULL,
  experience INTEGER NOT NULL,
  FOREIGN KEY (id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS pet_data (
  id INTEGER PRIMARY KEY,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  happiness INTEGER DEFAULT 0,
  experience INTEGER DEFAULT 0,
  tap_count INTEGER DEFAULT 0,
  photos_count INTEGER DEFAULT 0,
  FOREIGN KEY (id) REFERENCES pets (id)
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id);
`;

const MIGRATIONS = [
  "ALTER TABLE pet_data ADD COLUMN tap_count INTEGER DEFAULT 0",
  "ALTER TABLE pet_data ADD COLUMN photos_count INTEGER DEFAULT 0",
];

async function runMigrations(database: SQLite.SQLiteDatabase) {
  for (const sql of MIGRATIONS) {
    try {
      await database.runAsync(sql);
    } catch {
      // Column may already exist, ignore
    }
  }
}

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(SCHEMA);
  await runMigrations(db);
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
