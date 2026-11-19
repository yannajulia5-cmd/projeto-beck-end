const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swagger = require('swagger-ui-express');
const models = require('./models');
const buildRoutes = require('./routes');
const { root } = require('./services/media');
const { HttpError, errorHandler } = require('./middleware/errors');
const spec = require('../docs/openapi.json');

function createApp(dependencies = models) {
  const app = express();
  app.disable('x-powered-by');
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(value => value.trim());
  app.use(cors({ origin: origins }));
  app.use(helmet({
    // Swagger injeta estilos inline. Em desenvolvimento mantemos URLs locais como HTTP.
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.use('/docs', swagger.serve, swagger.setup(spec, { swaggerOptions: { persistAuthorization: false } }));
  app.use('/media', express.static(root, { index: false, dotfiles: 'deny' }));
  app.use('/v1', express.json({ limit: '12mb' }), buildRoutes(dependencies));
  app.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
