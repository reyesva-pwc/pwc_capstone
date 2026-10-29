const { Router } = require('express');
const controller = require('../controllers/payroll.controller');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', controller.list);
router.post('/run', requireAdmin, controller.run);
router.get('/:id/export', controller.exportCsv);

module.exports = router;
