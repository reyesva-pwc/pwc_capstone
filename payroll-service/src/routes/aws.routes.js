const { Router } = require('express');
const controller = require('../controllers/aws.controller');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/identity', requireAdmin, controller.identity);

module.exports = router;
