const service = require('../services/aws.service');

async function identity(_req, res) {
  if (!service.isEnabled()) {
    return res.json({ mode: 'offline', enabled: false });
  }
  try {
    const { account, arn } = await service.getCallerIdentity();
    return res.json({ mode: 'aws', enabled: true, account, arn });
  } catch (_error) {
    return res.status(503).json({ error: 'AWS identity unavailable' });
  }
}

module.exports = { identity };
