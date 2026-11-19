const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { issueToken } = require('../src/middleware/auth');

const profile = { firstname: 'Ana', surname: 'Souza', email: 'ana@example.com' };
const credentials = { email: profile.email, password: 'Senha@123' };
const category = { id: 3, name: 'Tênis', slug: 'tenis', use_in_menu: true };
let models, app, authorization;

beforeEach(() => {
  process.env.JWT_SECRET = 'segredo-exclusivamente-para-a-suite-com-mais-de-32-bytes';
  authorization = 'Bearer ' + issueToken(1);
  models = {
    User: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
    Category: { findByPk: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
    Product: { findByPk: jest.fn(), findAndCountAll: jest.fn(), findAll: jest.fn() },
    db: { transaction: jest.fn(), literal: jest.fn(x => x), escape: jest.fn(x => JSON.stringify(x)) }
  };
  app = createApp(models);
});

test('publica Swagger e identifica rota desconhecida', async () => {
  await request(app).get('/health').expect(200, { status: 'ok' });
  await request(app).get('/docs/').expect(200).expect(/Swagger UI/);
  const { body } = await request(app).get('/openapi.json').expect(200);
  expect(body.paths['/v1/user/token'].post).toBeDefined();
  await request(app).get('/v1/nao-existe').expect(404);
});

test('cadastro exige confirmação e envia somente o hash ao banco', async () => {
  await request(app).post('/v1/user').send({ ...profile, ...credentials, confirmPassword: 'Outra@123' }).expect(400);
  expect(models.User.create).not.toHaveBeenCalled();
  models.User.create.mockResolvedValue({ id: 1 });
  await request(app).post('/v1/user').send({ ...profile, ...credentials, confirmPassword: credentials.password })
    .expect(201, { id: 1 }).expect('Location', '/v1/user/1');
  const persisted = models.User.create.mock.calls[0][0];
  expect(persisted).not.toHaveProperty('confirmPassword');
  expect(await bcrypt.compare(credentials.password, persisted.password)).toBe(true);
});

test('login valida a senha e retorna um JWT que autentica uma rota protegida', async () => {
  models.User.findOne.mockResolvedValue({ id: 1, password: await bcrypt.hash(credentials.password, 4) });
  models.User.findByPk.mockResolvedValue({ id: 1 });
  models.Category.create.mockResolvedValue(category);
  await request(app).post('/v1/user/token').send({ ...credentials, password: 'Errada123' }).expect(400);
  const { body } = await request(app).post('/v1/user/token').send(credentials).expect(200);
  await request(app).post('/v1/category').set('Authorization', 'Bearer ' + body.token)
    .send({ name: 'Tênis', slug: 'tenis' }).expect(201, { id: 3 });
});

test('código 401 para token ausente ou inválido e 403 ao mexer em conta alheia', async () => {
  await request(app).delete('/v1/user/2').expect(401);
  await request(app).delete('/v1/user/2').set('Authorization', 'Bearer incorreto').expect(401);
  models.User.findByPk.mockResolvedValue({ id: 2 });
  await request(app).delete('/v1/user/2').set('Authorization', authorization).expect(403);
});

test('consulta de usuário não expõe o hash e responde 404 quando não existe', async () => {
  models.User.findByPk.mockResolvedValueOnce({ id: 1, ...profile, password: 'hash' });
  await request(app).get('/v1/user/1').expect(200, { id: 1, ...profile });
  await request(app).get('/v1/user/9').expect(404);
});

test('busca de categorias usa paginação, filtro e projeção de campos', async () => {
  models.Category.findAndCountAll.mockResolvedValue({ rows: [category], count: 3 });
  await request(app).get('/v1/category/search?limit=2&page=2&fields=name&use_in_menu=true')
    .expect(200, { data: [{ name: 'Tênis' }], total: 3, limit: 2, page: 2 });
  expect(models.Category.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
    limit: 2, offset: 2, where: { use_in_menu: true }
  }));
  await request(app).get('/v1/category/search?limit=-2').expect(400);
});

test('busca de produtos aceita filtros combinados e ignora page quando limit=-1', async () => {
  models.Product.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
  await request(app).get('/v1/product/search')
    .query({ limit: -1, page: 4, match: '%tênis', category_ids: '1,2', 'price-range': '10-100', 'option[45]': 'PP,GG' })
    .expect(200, { data: [], total: 0, limit: -1, page: 1 });
  expect(models.db.literal).toHaveBeenCalledTimes(2);
  expect(models.Product.findAll).not.toHaveBeenCalled();
  await request(app).get('/v1/product/search?price-range=80-10').expect(400);
});

test('produto inválido é rejeitado antes de chamar a transação', async () => {
  models.User.findByPk.mockResolvedValue({ id: 1 });
  await request(app).post('/v1/product').set('Authorization', authorization)
    .send({ name: 'A', slug: 'a', price: -1, price_with_discount: 0 }).expect(400);
  expect(models.db.transaction).not.toHaveBeenCalled();
});

test('excluir categoria retorna 204 sem corpo', async () => {
  models.User.findByPk.mockResolvedValue({ id: 1 });
  models.Category.destroy.mockResolvedValue(1);
  await request(app).delete('/v1/category/3').set('Authorization', authorization).expect(204, '');
});
