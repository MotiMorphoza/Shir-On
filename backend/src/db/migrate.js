import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '../../data');
const DB_PATH   = join(DATA_DIR, 'songbook.db');

mkdirSync(DATA_DIR, { recursive: true });

const db     = new Database(DB_PATH);
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
console.log('✓ Database migrated:', DB_PATH);
db.close();
