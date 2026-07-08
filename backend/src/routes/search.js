const { Router } = require('express');
const radarr = require('../services/radarr');
const sonarr = require('../services/sonarr');
const tautulli = require('../services/tautulli');
const { mediaCache, historyCache } = require('../utils/cache');

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRating(item, provider) {
  if (!item.ratings) return null;
  const val = item.ratings[provider];
  if (val == null) return null;

  // Normalize Rotten Tomatoes (0–100) and Metacritic (0–100) to 0–10 scale
  if (provider === 'rottenTomatoes' || provider === 'metacritic') {
    return val / 10;
  }
  return val;
}

function yearOf(isoString) {
  if (!isoString) return null;
  return new Date(isoString).getFullYear();
}

function normalizePath(pathValue) {
  if (!pathValue) return null;
  return String(pathValue).trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function matchesDiskPathFilter(item, selectedDiskPaths) {
  if (!selectedDiskPaths.length) return true;

  const candidates = [item.filePath, item.folderPath, item.rootFolderPath]
    .map(normalizePath)
    .filter(Boolean);

  if (!candidates.length) return false;

  return selectedDiskPaths.some((selected) =>
    candidates.some((candidate) => candidate === selected || candidate.startsWith(`${selected}/`))
  );
}

// ---------------------------------------------------------------------------
// Build watched sets for the selected users
// ---------------------------------------------------------------------------

/**
 * Builds watched sets keyed by normalised title+year strings taken directly
 * from Tautulli history records.  This avoids the fragile ratingKey lookup
 * via get_library_media_info and works even when title normalisation between
 * Sonarr/Radarr and Plex/Tautulli differs slightly.
 *
 * For movies  : uses h.title + h.year
 * For episodes: uses h.grandparent_title (show name) + h.year
 *
 * We also store a year-agnostic key as a fallback so that minor year
 * discrepancies between Sonarr/Radarr metadata and Tautulli don't cause
 * watched items to slip through.
 */
function incrementWatchCount(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function buildWatchedData(userIds, includeMovies, includeShows) {
  const watched = {}; // { userId: Set<titleKey> }
  const watchCounts = {
    movie: new Map(),
    show: new Map(),
  };

  await Promise.all(
    userIds.map(async (userId) => {
      const userWatched = new Set();
      watched[userId] = userWatched;

      const fetches = [];

      if (includeMovies) {
        fetches.push(
          historyCache
            .getOrFetch(`history:${userId}:movie`, () =>
              tautulli.getAllHistoryForUser(userId, 'movie')
            )
            .then((items) => ({ mediaType: 'movie', items: items ?? [] }))
        );
      }

      if (includeShows) {
        fetches.push(
          historyCache
            .getOrFetch(`history:${userId}:episode`, () =>
              tautulli.getAllHistoryForUser(userId, 'episode')
            )
            .then((items) => ({ mediaType: 'episode', items: items ?? [] }))
        );
      }

      const results = await Promise.all(fetches);

      for (const { mediaType, items } of results) {
        for (const h of items) {
          if (mediaType === 'movie') {
            const keyWithYear = tautulli.makeTitleKey(h.title, h.year);
            const keyNoYear   = tautulli.makeTitleKey(h.title, null);
            if (keyWithYear) userWatched.add(keyWithYear);
            if (keyNoYear)   userWatched.add(keyNoYear);

            incrementWatchCount(watchCounts.movie, keyWithYear ?? keyNoYear);
          } else {
            // episode — grandparent_title is the show title
            const keyWithYear = tautulli.makeTitleKey(h.grandparent_title, h.year);
            const keyNoYear   = tautulli.makeTitleKey(h.grandparent_title, null);
            if (keyWithYear) userWatched.add(keyWithYear);
            if (keyNoYear)   userWatched.add(keyNoYear);

            incrementWatchCount(watchCounts.show, keyWithYear ?? keyNoYear);
          }
        }
      }
    })
  );

  return { watched, watchCounts };
}

/**
 * Returns true only if NONE of the selected users have a watched entry
 * matching the item's title key.  We check both the year-qualified key
 * and the year-agnostic key so a minor year mismatch does not cause a
 * watched item to be shown as unwatched.
 */
function isUnwatchedByAll(titleKey, titleKeyNoYear, userIds, watched) {
  if (!userIds.length) return true;
  for (const uid of userIds) {
    const set = watched[uid];
    if (!set) continue;
    if (titleKey && set.has(titleKey)) return false;
    if (titleKeyNoYear && set.has(titleKeyNoYear)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/search
// ---------------------------------------------------------------------------

router.post('/', async (req, res) => {
  try {
    const {
      userIds = [],
      includeMovies = true,
      includeShows = true,
      genres = [],
      yearRange = null,        // [minYear, maxYear]
      minRating = 0,
      ratingProvider = 'tmdb', // tmdb | imdb | rottenTomatoes | metacritic | tvdb
      contentRatings = [],
      minRuntime = null,
      maxRuntime = null,
      showStatus = [],         // 'continuing' | 'ended'
      watchedMode = 'unwatched', // 'unwatched' | 'watched' | 'any'
      diskPaths = [],
      includeWatchCount = false,
    } = req.body;

    const normalizedWatchedMode = ['unwatched', 'watched', 'any'].includes(watchedMode)
      ? watchedMode
      : 'unwatched';
    const normalizedDiskPaths = (diskPaths ?? []).map(normalizePath).filter(Boolean);

    // ------------------------------------------------------------------
    // 1. Fetch media from Radarr / Sonarr
    // ------------------------------------------------------------------
    const [allMovies, allSeries] = await Promise.all([
      includeMovies
        ? mediaCache.getOrFetch('radarr:movies', () => radarr.getAllMovies())
        : Promise.resolve([]),
      includeShows
        ? mediaCache.getOrFetch('sonarr:series', () => sonarr.getAllSeries())
        : Promise.resolve([]),
    ]);

    // ------------------------------------------------------------------
    // 2. Build watched sets (only if users were selected)
    // ------------------------------------------------------------------
    let watched = {};
    let watchCounts = { movie: new Map(), show: new Map() };

    let countUserIds = userIds;
    if (includeWatchCount && userIds.length === 0) {
      const tautulliUsers = await historyCache.getOrFetch('tautulli:users', () => tautulli.getUsers());
      countUserIds = (tautulliUsers ?? [])
        .map((u) => Number(u.user_id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }

    const needsWatchData = countUserIds.length > 0 && (normalizedWatchedMode !== 'any' || includeWatchCount);
    if (needsWatchData) {
      const result = await buildWatchedData(countUserIds, includeMovies, includeShows);
      watched = result.watched;
      watchCounts = result.watchCounts;
    }

    // ------------------------------------------------------------------
    // 3. Filter & normalize movies
    // ------------------------------------------------------------------
    const results = [];

    if (includeMovies) {
      for (const movie of allMovies) {
        if (!movie.hasFile) continue; // only downloaded content

        // Genre filter
        if (genres.length > 0 && !genres.some((g) => (movie.genres ?? []).includes(g))) continue;

        // Year filter (use inCinemas or year field)
        if (yearRange) {
          const y = movie.year ?? yearOf(movie.inCinemas);
          if (!y || y < yearRange[0] || y > yearRange[1]) continue;
        }

        // Rating filter
        if (minRating > 0) {
          const provider = ratingProvider === 'tvdb' ? 'tmdb' : ratingProvider;
          const rating = getRating(radarr.normalizeMovie(movie), provider);
          if (rating == null || rating < minRating) continue;
        }

        // Content rating filter
        if (contentRatings.length > 0 && !contentRatings.includes(movie.certification)) continue;

        // Runtime filter
        if (minRuntime != null && (movie.runtime ?? 0) < minRuntime) continue;
        if (maxRuntime != null && (movie.runtime ?? 0) > maxRuntime) continue;

        // Watch status filter
        if (userIds.length > 0 && normalizedWatchedMode !== 'any') {
          const key       = tautulli.makeTitleKey(movie.title, movie.year);
          const keyNoYear = tautulli.makeTitleKey(movie.title, null);
          const unwatchedByAll = isUnwatchedByAll(key, keyNoYear, userIds, watched);
          if (normalizedWatchedMode === 'unwatched' && !unwatchedByAll) continue;
          if (normalizedWatchedMode === 'watched' && unwatchedByAll) continue;
        }

        if (!matchesDiskPathFilter(movie, normalizedDiskPaths)) continue;

        const titleKey = tautulli.makeTitleKey(movie.title, movie.year);
        const fallbackTitleKey = tautulli.makeTitleKey(movie.title, null);
        const watchCount = includeWatchCount
          ? (watchCounts.movie.get(titleKey) ?? watchCounts.movie.get(fallbackTitleKey) ?? 0)
          : undefined;

        results.push({
          ...radarr.normalizeMovie(movie),
          posterPath: `/api/image/movie/${movie.id}/poster`,
          ...(includeWatchCount ? { watchCount } : {}),
        });
      }
    }

    // ------------------------------------------------------------------
    // 4. Filter & normalize shows
    // ------------------------------------------------------------------
    if (includeShows) {
      for (const show of allSeries) {
        // Genre filter
        if (genres.length > 0 && !genres.some((g) => (show.genres ?? []).includes(g))) continue;

        // Year filter
        if (yearRange) {
          const y = show.year ?? yearOf(show.firstAired);
          if (!y || y < yearRange[0] || y > yearRange[1]) continue;
        }

        // Rating filter — Sonarr only has a single TVDB rating
        if (minRating > 0 && ratingProvider === 'tvdb') {
          const val = show.ratings?.value ?? null;
          if (val == null || val < minRating) continue;
        } else if (minRating > 0 && ratingProvider !== 'tvdb') {
          // Other providers not available for shows → skip the filter (include all)
        }

        // Content rating filter
        if (contentRatings.length > 0 && !contentRatings.includes(show.certification)) continue;

        // Runtime filter
        if (minRuntime != null && (show.runtime ?? 0) < minRuntime) continue;
        if (maxRuntime != null && (show.runtime ?? 0) > maxRuntime) continue;

        // Show status filter
        if (showStatus.length > 0 && !showStatus.includes(show.status)) continue;

        // Watch status filter
        if (userIds.length > 0 && normalizedWatchedMode !== 'any') {
          const key       = tautulli.makeTitleKey(show.title, show.year);
          const keyNoYear = tautulli.makeTitleKey(show.title, null);
          const unwatchedByAll = isUnwatchedByAll(key, keyNoYear, userIds, watched);
          if (normalizedWatchedMode === 'unwatched' && !unwatchedByAll) continue;
          if (normalizedWatchedMode === 'watched' && unwatchedByAll) continue;
        }

        if (!matchesDiskPathFilter(show, normalizedDiskPaths)) continue;

        const titleKey = tautulli.makeTitleKey(show.title, show.year);
        const fallbackTitleKey = tautulli.makeTitleKey(show.title, null);
        const watchCount = includeWatchCount
          ? (watchCounts.show.get(titleKey) ?? watchCounts.show.get(fallbackTitleKey) ?? 0)
          : undefined;

        const norm = sonarr.normalizeSeries(show);
        results.push({
          ...norm,
          posterPath: `/api/image/show/${show.id}/poster`,
          ...(includeWatchCount ? { watchCount } : {}),
        });
      }
    }

    // ------------------------------------------------------------------
    // 5. Sort alphabetically by title
    // ------------------------------------------------------------------
    results.sort((a, b) => {
      const ta = (a.sortTitle ?? a.title).toLowerCase();
      const tb = (b.sortTitle ?? b.title).toLowerCase();
      return ta.localeCompare(tb);
    });

    res.json(results);
  } catch (err) {
    console.error('[search]', err.message, err.stack);
    res.status(500).json({ error: `Search failed: ${err.message}` });
  }
});

module.exports = router;
