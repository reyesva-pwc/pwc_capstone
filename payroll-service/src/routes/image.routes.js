const express = require('express');
const config = require('../config');
const controller = require('../controllers/image.controller');
const HttpError = require('../utils/http-error');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const rawImage = express.raw({ type: () => true, limit: config.imageMaxBytes });

function imageBodyErrors(error, _req, res, next) {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: `Image must be ${config.imageMaxBytes / 1024 / 1024} MB or smaller` });
  }
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  return next(error);
}

router.get('/', controller.list);
router.put('/:employeeId', requireAdmin, rawImage, controller.upload, imageBodyErrors);
router.delete('/:employeeId', requireAdmin, controller.remove);

module.exports = router;
