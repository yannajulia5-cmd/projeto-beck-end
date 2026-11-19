const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
let app, db, uploadDir, auth;
const clean = { user: [], category: [], product: [] };

beforeAll(async () => {
  uploadDir = await mkdtemp(join(tmpdir(), 'digital-store-test-'));
  process.env.UPLOAD_DIR = uploadDir;
  const models = require('../src/models');
  db = models.db;
  await db.authenticate();
  app = require('../src/app').createApp();
});

afterAll(async () => {
  try {
    if (app && auth) {
      for (const resource of ['product', 'category', 'user']) {
        for (const id of clean[resource]) await request(app).delete('/v1/' + resource + '/' + id).set('Authorization', auth);
      }
    }
  } finally {
    if (db) await db.close();
    if (uploadDir) await rm(uploadDir, { force: true, recursive: true });
  }
});

test('migrations + CRUD completo com MySQL, filtros e mídia', async () => {
  const suffix = randomUUID();
  const profile = { firstname: 'Ana', surname: 'Teste', email: suffix + '@example.com' };
  const password = 'Senha@123';
  const user = await request(app).post('/v1/user').send({ ...profile, password, confirmPassword: password }).expect(201);
  const userId = user.body.id;
  clean.user.push(userId);
  await request(app).get('/v1/user/' + userId).expect(200, { id: userId, ...profile });
  const login = await request(app).post('/v1/user/token').send({ email: profile.email, password }).expect(200);
  auth = 'Bearer ' + login.body.token;
  const http = (method, path) => request(app)[method]('/v1' + path).set('Authorization', auth);
  await http('put', '/user/' + userId).send({ ...profile, surname: 'Atualizado' }).expect(204);

  const cat = { name: 'Tênis', slug: 'tenis-' + suffix, use_in_menu: true };
  const category = await http('post', '/category').send(cat).expect(201);
  const categoryId = category.body.id;
  clean.category.push(categoryId);
  await http('get', '/category/' + categoryId).expect(200, { id: categoryId, ...cat });
  await http('put', '/category/' + categoryId).send({ ...cat, name: 'Tênis Esportivo' }).expect(204);
  const cats = await http('get', '/category/search').query({ limit: -1, use_in_menu: true }).expect(200);
  expect(cats.body.data.some(row => row.id === categoryId)).toBe(true);

  const product = {
    name: 'Tênis teste ' + suffix, slug: 'produto-' + suffix, enabled: true, stock: 10,
    price: 150, price_with_discount: 120, category_ids: [categoryId]
  };
  const onePxPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5cAAAAASUVORK5CYII=';
  const created = await http('post', '/product').send({
    ...product, images: [{ type: 'image/png', content: onePxPng }],
    options: [{ title: 'Tamanho', radius: '4px', values: ['PP', 'GG'] }]
  }).expect(201);
  const productId = created.body.id;
  clean.product.push(productId);
  const detail = await http('get', '/product/' + productId).expect(200);
  expect(detail.body).toMatchObject({ id: productId, ...product });
  expect(detail.body.options[0]).toMatchObject({ radius: 4, values: ['PP', 'GG'] });
  const mediaPath = new URL(detail.body.images[0].content).pathname;
  await request(app).get(mediaPath).expect(200).expect('Content-Type', /image\/png/);
  const optId = detail.body.options[0].id;
  const search = await http('get', '/product/search').query({
    match: suffix, category_ids: categoryId, 'price-range': '100-200', ['option[' + optId + ']']: 'GG',
    fields: 'id,name,images', page: 1, limit: 1
  }).expect(200);
  expect(search.body).toMatchObject({ total: 1, limit: 1, page: 1, data: [{ id: productId, name: product.name }] });

  await http('put', '/product/' + productId).send({
    ...product, stock: 2, images: [{ id: detail.body.images[0].id, deleted: true }],
    options: [{ id: optId, value: ['M'] }]
  }).expect(204);
  const updated = await http('get', '/product/' + productId).expect(200);
  expect(updated.body).toMatchObject({ stock: 2, images: [], options: [{ id: optId, values: ['M'] }] });
  await request(app).get(mediaPath).expect(404);
  await http('delete', '/category/' + categoryId).expect(204);
  const afterUnlink = await http('get', '/product/' + productId).expect(200);
  expect(afterUnlink.body.category_ids).toEqual([]);
  await http('delete', '/product/' + productId).expect(204);
  await http('get', '/product/' + productId).expect(404);
  await http('delete', '/user/' + userId).expect(204);
  await http('get', '/user/' + userId).expect(404);
}, 25000);
