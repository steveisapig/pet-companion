import { getDatabase } from './sqlite';
import type { DbUser, DbPet, DbPetData } from './types';
import { dbLog } from './logger';

export async function sqliteInsertUser(googleId?: string | null, appleId?: string | null): Promise<number> {
  const params = [googleId ?? null, appleId ?? null];
  dbLog('INSERT', 'users (SQLite)', {
    query: 'INSERT INTO users',
    params,
    message: `Inserting user (google_id=${googleId ?? 'null'}, apple_id=${appleId ?? 'null'})`,
  });
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO users (google_id, apple_id) VALUES (?, ?)',
    params
  );
  dbLog('INSERT', 'users (SQLite)', {
    params,
    result: { lastInsertRowId: result.lastInsertRowId },
    message: `Successfully inserted user id=${result.lastInsertRowId}`,
  });
  return result.lastInsertRowId;
}

export async function sqliteGetUser(id: number): Promise<DbUser | null> {
  dbLog('SELECT', 'users (SQLite)', {
    params: { id },
    message: `Querying user by id=${id}`,
  });
  const db = await getDatabase();
  const rows = await db.getAllAsync<DbUser>(
    'SELECT * FROM users WHERE id = ?',
    [id]
  );
  const result = rows[0] ?? null;
  dbLog('SELECT', 'users (SQLite)', {
    params: { id },
    result,
    message: result ? `Found user id=${id}` : `User not found for id=${id}`,
  });
  return result;
}

export async function sqliteInsertPet(
  id: number,
  name: string,
  type: number,
  experience: number
): Promise<void> {
  const params = { id, name, type, experience };
  dbLog('INSERT', 'pets (SQLite)', {
    params,
    message: `Inserting pet (id=${id}, name=${name}, type=${type}, experience=${experience})`,
  });
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO pets (id, name, type, experience) VALUES (?, ?, ?, ?)',
    [id, name, type, experience]
  );
  dbLog('INSERT', 'pets (SQLite)', {
    params,
    result: 'ok',
    message: `Successfully inserted pet id=${id} (${name})`,
  });
}

export async function sqliteGetPet(id: number): Promise<DbPet | null> {
  dbLog('SELECT', 'pets (SQLite)', {
    params: { id },
    message: `Querying pet by id=${id}`,
  });
  const db = await getDatabase();
  const rows = await db.getAllAsync<DbPet>('SELECT * FROM pets WHERE id = ?', [id]);
  const result = rows[0] ?? null;
  dbLog('SELECT', 'pets (SQLite)', {
    params: { id },
    result,
    message: result ? `Found pet id=${id} (${result.name})` : `Pet not found for id=${id}`,
  });
  return result;
}

export async function sqliteInsertPetData(
  id: number,
  happiness: number = 0,
  experience: number = 0,
  photosCount: number = 0
): Promise<void> {
  const params = { id, happiness, experience, photosCount };
  dbLog('INSERT', 'pet_data (SQLite)', {
    params,
    message: `Inserting pet_data (id=${id}, happiness=${happiness}, experience=${experience})`,
  });
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO pet_data (id, happiness, experience, tap_count, photos_count) VALUES (?, ?, ?, 0, ?)',
    [id, happiness, experience, photosCount]
  );
  dbLog('INSERT', 'pet_data (SQLite)', {
    params,
    result: 'ok',
    message: `Successfully inserted pet_data id=${id}`,
  });
}

export async function sqliteUpdatePetData(
  id: number,
  updates: { happiness?: number; experience?: number; photosCount?: number }
): Promise<void> {
  dbLog('UPDATE', 'pet_data (SQLite)', {
    params: { id, updates },
    message: `Updating pet_data id=${id} with ${JSON.stringify(updates)}`,
  });
  const db = await getDatabase();
  const { happiness, experience, photosCount } = updates;
  const setClauses: string[] = [];
  const params: (number | string)[] = [];
  if (happiness !== undefined) {
    setClauses.push('happiness = ?');
    params.push(happiness);
  }
  if (experience !== undefined) {
    setClauses.push('experience = ?');
    params.push(experience);
  }
  if (photosCount !== undefined) {
    setClauses.push('photos_count = ?');
    params.push(photosCount);
  }
  if (setClauses.length > 0) {
    params.push(id);
    await db.runAsync(
      `UPDATE pet_data SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      params
    );
    dbLog('UPDATE', 'pet_data (SQLite)', {
      params: { id, updates },
      result: 'ok',
      message: `Successfully updated pet_data id=${id}`,
    });
  }
}

export async function sqliteGetPetData(id: number): Promise<DbPetData | null> {
  dbLog('SELECT', 'pet_data (SQLite)', {
    params: { id },
    message: `Querying pet_data by id=${id}`,
  });
  const db = await getDatabase();
  const rows = await db.getAllAsync<DbPetData>('SELECT * FROM pet_data WHERE id = ?', [id]);
  const result = rows[0] ?? null;
  dbLog('SELECT', 'pet_data (SQLite)', {
    params: { id },
    result,
    message: result ? `Found pet_data id=${id}` : `Pet data not found for id=${id}`,
  });
  return result;
}

export async function sqliteGetOrCreateLocalUser(): Promise<number> {
  dbLog('SELECT', 'users (SQLite)', {
    query: 'getOrCreate',
    message: 'Looking up or creating local user',
  });
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: number }>('SELECT id FROM users LIMIT 1');
  if (rows[0]) {
    dbLog('SELECT', 'users (SQLite)', {
      query: 'getOrCreate',
      result: rows[0],
      message: `Found existing local user id=${rows[0].id}`,
    });
    return rows[0].id;
  }
  const result = await db.runAsync('INSERT INTO users (google_id, apple_id) VALUES (NULL, NULL)');
  dbLog('INSERT', 'users (SQLite)', {
    query: 'getOrCreate',
    result: { lastInsertRowId: result.lastInsertRowId },
    message: `Successfully created new local user id=${result.lastInsertRowId}`,
  });
  return result.lastInsertRowId;
}

/** Ensure a user exists with the given id (for Supabase sync). No-op if already exists. */
export async function sqliteEnsureUserExists(id: number): Promise<void> {
  dbLog('INSERT', 'users (SQLite)', {
    query: 'ensureUserExists',
    params: { id },
    message: `Ensuring user id=${id} exists (insert or ignore)`,
  });
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR IGNORE INTO users (id, google_id, apple_id) VALUES (?, NULL, NULL)',
    [id]
  );
  dbLog('INSERT', 'users (SQLite)', {
    query: 'ensureUserExists',
    params: { id },
    result: 'ok',
    message: `User id=${id} ensured (inserted or already existed)`,
  });
}
