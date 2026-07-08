require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const usersRouter = require('./routes/users');
const genresRouter = require('./routes/genres');
const searchRouter = require('./routes/search');
const metadataRouter = require('./routes/metadata');
const imagesRouter = require('./routes/images');
const mediaRouter = require('./routes/media');

const app = express();
const PORT = process.env.BACKEND_PORT ?? 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Routes
app.use('/api/users', usersRouter);
app.use('/api/genres', genresRouter);
app.use('/api/search', searchRouter);
app.use('/api/metadata', metadataRouter);
app.use('/api/image', imagesRouter);
app.use('/api/media', mediaRouter);

if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});
