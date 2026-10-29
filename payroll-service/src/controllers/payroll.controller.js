const service = require('../services/payroll.service');
const HttpError = require('../utils/http-error');

async function list(_req, res, next) {
  try {
    res.json(await service.listRuns());
  } catch (error) { next(error); }
}

async function run(req, res, next) {
  try {
    res.status(201).json(await service.runPayroll(req.body, req.token));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error.cause || error.name === 'TypeError') return res.status(502).json({ error: 'Employee service unavailable' });
    next(error);
  }
}

async function exportCsv(req, res, next) {
  try {
    const { filename, content } = await service.exportRun(req.params.id);
    res.type('text/csv').attachment(filename).send(content);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}

module.exports = { list, run, exportCsv };
