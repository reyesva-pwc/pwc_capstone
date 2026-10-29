const jwt = require('jsonwebtoken');
const config = require('../config');

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(\S{1,2048})$/i.exec(header);
  return match ? match[1] : null;
}

// The token is a signed JWT issued by employee-service. It is checked here with the shared secret,
// so no call to employee-service is needed. Only HS256 is accepted and the expiry is enforced.
function requireUser(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  try {
    const claims = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });
    if (!claims.sub || !claims.email || !claims.role) return res.status(401).json({ error: 'Sign in required' });
    req.user = { id: Number(claims.sub), emailAddress: claims.email, role: claims.role };
    req.token = token;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Sign in required' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  return next();
}

module.exports = { requireUser, requireAdmin };
