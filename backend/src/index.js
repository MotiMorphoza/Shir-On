import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');

dotenv.config({ path: envPath });

const { default: songsRouter } = await import('./routes/songs.js');
const { default: spotifyRouter } = await import('./routes/spotify.js');
const { default: printRouter } = await import('./routes/print.js');
const { default: importRouter } = await import('./routes/import.js');
const { default: collectionsRouter } = await import('./routes/collections.js');
const { default: reportsRouter } = await import('./routes/reports.js');
const { default: db } = await import('./db/index.js');

const schema = readFileSync(join(__dirname, 'db/schema.sql'), 'utf8');
db.exec(schema);

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL?.trim(),
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://localhost:5173',
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET?.trim() || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

app.use('/api/songs', songsRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/print', printRouter);
app.use('/api/import', importRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/reports', reportsRouter);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    allowedOrigins,
  });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: err?.message || 'Internal server error',
  });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Songbook API running on http://127.0.0.1:${PORT}`);
  console.log('Allowed CORS origins:', allowedOrigins);
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }

  console.error('Server failed to start:', err);
  process.exit(1);
});