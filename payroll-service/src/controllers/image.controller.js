const service = require('../services/image.service');
const HttpError = require('../utils/http-error');

function fail(error, res, next) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.cause || error.name === 'TypeError') return res.status(502).json({ error: 'Employee service unavailable' });
  return next(error);
}

async function list(_req, res, next) {
  try {
    res.json(await service.listUrls());
  } catch (error) { fail(error, res, next); }
}

async function upload(req, res, next) {
  try {
    res.json(await service.upload(req.params.employeeId, req.body, req.token));
  } catch (error) { fail(error, res, next); }
}

async function remove(req, res, next) {
  try {
    await service.remove(req.params.employeeId);
    res.status(204).end();
  } catch (error) { fail(error, res, next); }
}

module.exports = { list, upload, remove };
