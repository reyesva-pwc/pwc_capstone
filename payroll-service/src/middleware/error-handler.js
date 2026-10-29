function errorHandler(error, _req, res, _next) {
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
