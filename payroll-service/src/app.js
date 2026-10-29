const config = require('./config');

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middleware/error-handler');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: config.bodyLimit }));
app.use(routes);
app.use(errorHandler);

module.exports = app;
