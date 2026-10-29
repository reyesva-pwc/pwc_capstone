const { Router } = require('express');
const { requireUser } = require('../middleware/auth');

const router = Router();

router.use('/health', require('./health.routes'));
router.use('/api', requireUser);
router.use('/api/payroll', require('./payroll.routes'));
router.use('/api/aws', require('./aws.routes'));
router.use('/api/employee-images', require('./image.routes'));

module.exports = router;
