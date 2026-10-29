const { Router } = require('express');

const router = Router();

router.get('/', (_req, res) => res.json({ status: 'ok' }));

module.exports = router;
