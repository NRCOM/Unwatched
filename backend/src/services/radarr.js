const axios = require('axios');

const BASE_URL = process.env.RADARR_URL;
const API_KEY = process.env.RADARR_API_KEY;

const cfHeaders = process.env.CF_ACCESS_CLIENT_ID
  ? {
      'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
      'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET,
    }
  : {};

const client = axios.create({
  baseURL: `${BASE_URL}/api/v3`,
  headers: { 'X-Api-Key': API_KEY, ...cfHeaders },
  timeout: 30000,
});

async function getAllMovies() {
  const response = await client.get('/movie');
  return response.data;
}

async function getMovie(movieId) {
  const response = await client.get(`/movie/${movieId}`);
  return response.data;
}

async function deleteMovie(movieId, options = {}) {
  const {
    deleteFiles = true,
    addImportExclusion = false,
  } = options;

  await client.delete(`/movie/${movieId}`, {
    params: {
      deleteFiles,
      addImportExclusion,
    },
  });

  return { id: Number(movieId), deleted: true };
}

async function unmonitorMovie(movieId) {
  const movie = await getMovie(movieId);
  await client.put('/movie', {
    ...movie,
    monitored: false,
  });

  return { id: Number(movieId), monitored: false };
}

function getPosterUrl(movieId, size = '') {
  const filename = size ? `poster-${size}.jpg` : 'poster.jpg';
  return `${BASE_URL}/api/v3/mediacover/${movieId}/${filename}?apikey=${API_KEY}`;
}

/**
 * Normalize a Radarr movie into the app's standard shape.
 */
function normalizeMovie(movie) {
  const ratings = movie.ratings ?? {};
  return {
    type: 'movie',
    id: movie.id,
    title: movie.title,
    sortTitle: movie.sortTitle ?? movie.title,
    year: movie.year,
    genres: movie.genres ?? [],
    overview: movie.overview ?? '',
    runtime: movie.runtime ?? 0,
    certification: movie.certification ?? '',
    studio: movie.studio ?? '',
    youTubeTrailerId: movie.youTubeTrailerId ?? null,
    imdbId: movie.imdbId ?? null,
    tmdbId: movie.tmdbId ?? null,
    inCinemas: movie.inCinemas ?? null,
    physicalRelease: movie.physicalRelease ?? movie.digitalRelease ?? null,
    added: movie.added ?? null,
    hasFile: movie.hasFile ?? false,
    rootFolderPath: movie.rootFolderPath ?? null,
    folderPath: movie.path ?? null,
    filePath: movie.movieFile?.path ?? movie.path ?? null,
    monitored: movie.monitored ?? true,
    ratings: {
      tmdb: ratings.tmdb?.value ?? null,
      imdb: ratings.imdb?.value ?? null,
      rottenTomatoes: ratings.rottenTomatoes?.value ?? null,
      metacritic: ratings.metacritic?.value ?? null,
    },
    popularity: movie.popularity ?? null,
    collection: movie.collection?.title ?? null,
  };
}

module.exports = {
  getAllMovies,
  getMovie,
  deleteMovie,
  unmonitorMovie,
  getPosterUrl,
  normalizeMovie,
};
