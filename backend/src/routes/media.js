const { Router } = require('express');
const radarr = require('../services/radarr');
const sonarr = require('../services/sonarr');
const { mediaCache } = require('../utils/cache');

const router = Router();

function isValidMediaType(type) {
  return type === 'movie' || type === 'show';
}

function isValidAction(action) {
  return action === 'delete' || action === 'unmonitor';
}

function toDeletePayload(item) {
  return {
    type: item.type,
    id: Number(item.id),
  };
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'At least one item is required';
  }

  const invalid = items.find((item) => {
    const idNum = Number(item?.id);
    return !isValidMediaType(item?.type) || !Number.isInteger(idNum) || idNum <= 0;
  });

  if (invalid) {
    return `Invalid item payload: ${JSON.stringify(invalid)}`;
  }

  return null;
}

async function deleteItem(item, options) {
  const id = Number(item.id);
  if (item.type === 'movie') {
    if (options.action === 'unmonitor') {
      await radarr.unmonitorMovie(id);
      return { ...toDeletePayload(item), ok: true, provider: 'radarr', action: 'unmonitor' };
    }

    await radarr.deleteMovie(id, {
      deleteFiles: options.deleteFiles,
      addImportExclusion: options.addExclusion,
    });
    return { ...toDeletePayload(item), ok: true, provider: 'radarr', action: 'delete' };
  }

  if (options.action === 'unmonitor') {
    await sonarr.unmonitorSeries(id);
    return { ...toDeletePayload(item), ok: true, provider: 'sonarr', action: 'unmonitor' };
  }

  await sonarr.deleteSeries(id, {
    deleteFiles: options.deleteFiles,
    addImportListExclusion: options.addExclusion,
  });
  return { ...toDeletePayload(item), ok: true, provider: 'sonarr', action: 'delete' };
}

async function runWithConcurrency(items, limit, handler) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await handler(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function invalidateMediaCache() {
  mediaCache.invalidate('radarr:movies');
  mediaCache.invalidate('sonarr:series');
}

// POST /api/media/delete-one
router.post('/delete-one', async (req, res) => {
  try {
    const {
      type,
      id,
      action = 'delete',
      deleteFiles = true,
      addExclusion = false,
    } = req.body ?? {};

    const validationError = validateItems([{ type, id }]);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (!isValidAction(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    const deleted = await deleteItem({ type, id }, { action, deleteFiles, addExclusion });
    invalidateMediaCache();

    return res.json({ deleted });
  } catch (err) {
    console.error('[media/delete-one]', err.message);
    return res.status(502).json({ error: `Delete failed: ${err.message}` });
  }
});

// POST /api/media/delete-bulk
router.post('/delete-bulk', async (req, res) => {
  try {
    const {
      items = [],
      action = 'delete',
      deleteFiles = true,
      addExclusion = false,
      concurrency = 3,
    } = req.body ?? {};

    const validationError = validateItems(items);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (!isValidAction(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    const effectiveConcurrency = Number.isInteger(concurrency)
      ? Math.max(1, Math.min(8, concurrency))
      : 3;

    const outcomes = await runWithConcurrency(items, effectiveConcurrency, async (item) => {
      try {
        return await deleteItem(item, { action, deleteFiles, addExclusion });
      } catch (err) {
        return {
          ...toDeletePayload(item),
          ok: false,
          error: err.message,
        };
      }
    });

    const deleted = outcomes.filter((x) => x.ok);
    const failed = outcomes.filter((x) => !x.ok);

    if (deleted.length > 0) {
      invalidateMediaCache();
    }

    return res.json({
      total: outcomes.length,
      deletedCount: deleted.length,
      failedCount: failed.length,
      deleted,
      failed,
    });
  } catch (err) {
    console.error('[media/delete-bulk]', err.message);
    return res.status(502).json({ error: `Bulk delete failed: ${err.message}` });
  }
});

module.exports = router;
