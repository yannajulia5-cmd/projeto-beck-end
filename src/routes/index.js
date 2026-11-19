const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const controllers = require('../controllers');

module.exports = models => {
  const api = Router();
  const auth = authenticate(models.User);
  const { user, category, product } = controllers(models);
  const throttle = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Muitas tentativas. Tente novamente em alguns minutos.' }
  });
  api.post('/user/token', throttle, user.token);
  api.post('/user', throttle, user.create);
  api.get('/user/:id', user.get);
  api.put('/user/:id', auth, user.update);
  api.delete('/user/:id', auth, user.remove);
  for (const [path, resource] of [['category', category], ['product', product]]) {
    api.get('/' + path + '/search', resource.search);
    api.get('/' + path + '/:id', resource.get);
    api.post('/' + path, auth, resource.create);
    api.put('/' + path + '/:id', auth, resource.update);
    api.delete('/' + path + '/:id', auth, resource.remove);
  }
  return api;
};
