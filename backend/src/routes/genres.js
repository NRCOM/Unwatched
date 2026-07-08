const { Router } = require('express');
const radarr = require('../services/radarr');
const sonarr = require('../services/sonarr');
const { mediaCache } = require('../utils/cache');

const router = Router();

// GET /api/genres  — returns { movies: [...], shows: [...], all: [...], diskPaths: [...] }
router.get('/', async (_req, res) => {
  try {
    const [movies, series] = await Promise.all([
      mediaCache.getOrFetch('radarr:movies', () => radarr.getAllMovies()),
      mediaCache.getOrFetch('sonarr:series', () => sonarr.getAllSeries()),
    ]);

    const movieGenres = new Set();
    const showGenres = new Set();

    for (const m of movies) {
      (m.genres ?? []).forEach((g) => movieGenres.add(g));
    }
    for (const s of series) {
      (s.genres ?? []).forEach((g) => showGenres.add(g));
    }

    const all = new Set([...movieGenres, ...showGenres]);

    const movieCerts = new Set(movies.map((m) => m.certification).filter(Boolean));
    const showCerts = new Set(series.map((s) => s.certification).filter(Boolean));
    const allCerts = [...new Set([...movieCerts, ...showCerts])].sort();
    const moviePaths = new Set(movies.map((m) => m.rootFolderPath).filter(Boolean));
    const showPaths = new Set(series.map((s) => s.rootFolderPath).filter(Boolean));
    const diskPaths = [...new Set([...moviePaths, ...showPaths])].sort();

    res.json({
      movies: [...movieGenres].sort(),
      shows: [...showGenres].sort(),
      all: [...all].sort(),
      contentRatings: allCerts,
      diskPaths,
    });
  } catch (err) {
    console.error('[genres]', err.message);
    res.status(502).json({ error: `Failed to fetch genres: ${err.message}` });
  }
});

module.exports = router;
