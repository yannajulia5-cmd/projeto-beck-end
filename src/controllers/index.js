const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { HttpError } = require('../middleware/errors');
const validation = require('../middleware/validation');
const { issueToken } = require('../middleware/auth');
const { catalog, categoryFields, pick, notFound } = require('../services/catalog');

const userFields = ['id', 'firstname', 'surname', 'email'];
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);
const getId = req => validation.parseId(req.params.id);
const origin = req => process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
const created = (res, resource, id) => res.location('/v1/' + resource + '/' + id).status(201).json({ id });
const noContent = res => res.status(204).end();
function assertOwner(req, id) {
  if (req.userId !== id) throw new HttpError(403, 'Você só pode alterar ou excluir a sua própria conta.');
}

function controllers(models) {
  const { User, Category } = models;
  const service = catalog(models);
  return {
    user: {
      async get(req, res) {
        const user = await User.findByPk(getId(req), { attributes: userFields });
        if (!user) throw notFound();
        res.json(pick(user, userFields));
      },
      async create(req, res) {
        const { firstname, surname, email, password } = validation.userCreate.parse(req.body);
        const user = await User.create({ firstname, surname, email, password: await bcrypt.hash(password, 12) });
        created(res, 'user', user.id);
      },
      async token(req, res) {
        const { email, password } = validation.login.parse(req.body);
        const user = await User.findOne({ where: { email }, attributes: ['id', 'password'] });
        const match = await bcrypt.compare(password, user ? user.password : await dummyHash);
        if (!match || !user) throw new HttpError(400, 'E-mail ou senha incorretos.');
        res.json({ token: issueToken(user.id) });
      },
      async update(req, res) {
        const id = getId(req);
        const data = validation.userUpdate.parse(req.body);
        const user = await User.findByPk(id);
        if (!user) throw notFound();
        assertOwner(req, id);
        await user.update(data);
        noContent(res);
      },
      async remove(req, res) {
        const id = getId(req);
        const user = await User.findByPk(id);
        if (!user) throw notFound();
        assertOwner(req, id);
        await user.destroy();
        noContent(res);
      }
    },
    category: {
      async search(req, res) { res.json(await service.categorySearch(req.query)); },
      async get(req, res) {
        const row = await Category.findByPk(getId(req));
        if (!row) throw notFound();
        res.json(pick(row, categoryFields));
      },
      async create(req, res) {
        const row = await Category.create(validation.category.parse(req.body));
        created(res, 'category', row.id);
      },
      async update(req, res) {
        const data = validation.category.parse(req.body);
        const row = await Category.findByPk(getId(req));
        if (!row) throw notFound();
        await row.update(data);
        noContent(res);
      },
      async remove(req, res) {
        const count = await Category.destroy({ where: { id: getId(req) } });
        if (!count) throw notFound();
        noContent(res);
      }
    },
    product: {
      async search(req, res) { res.json(await service.productSearch(req.query, origin(req))); },
      async get(req, res) { res.json(await service.productGet(getId(req), origin(req))); },
      async create(req, res) {
        const id = await service.productSave(undefined, validation.product.parse(req.body));
        created(res, 'product', id);
      },
      async update(req, res) {
        await service.productSave(getId(req), validation.product.parse(req.body));
        noContent(res);
      },
      async remove(req, res) {
        await service.productDelete(getId(req));
        noContent(res);
      }
    }
  };
}
module.exports = controllers;
