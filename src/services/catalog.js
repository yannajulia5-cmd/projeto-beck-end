const { Op } = require('sequelize');
const { HttpError } = require('../middleware/errors');
const { parseId, pagination } = require('../middleware/validation');
const media = require('./media');

const categoryFields = ['id', 'name', 'slug', 'use_in_menu'];
const productFields = [
  'id', 'enabled', 'name', 'slug', 'use_in_menu', 'stock', 'description', 'price',
  'price_with_discount', 'category_ids', 'images', 'options'
];
const pick = (row, fields) => Object.fromEntries(fields.map(key => [key, row[key]]));
const list = (rows, total, paging) => ({ data: rows, total, limit: paging.limit, page: paging.page });
const order = [['id', 'ASC']];
const notFound = () => new HttpError(404, 'Registro não encontrado.');

function catalog(models) {
  const { db, Category, Product, Option, Image } = models;
  const include = [
    { association: 'images', separate: true, attributes: ['id', 'path', 'product_id'], order },
    { association: 'options', separate: true, order },
    { association: 'categories', attributes: ['id'], through: { attributes: [] } }
  ];
  function productJson(row, origin, fields = productFields) {
    const data = row.get({ plain: true });
    return pick({
      ...data,
      images: data.images.map(({ id, path }) => ({ id, content: path.startsWith('/') ? origin + path : path })),
      category_ids: data.categories.map(({ id }) => id).sort((a, b) => a - b),
      options: data.options.map(({ id, title, shape, radius, type, values }) =>
        ({ id, title, shape, radius, type, values: values.split(',') }))
    }, fields);
  }

  async function categorySearch(query) {
    const paging = pagination(query, categoryFields);
    const where = {};
    if (query.use_in_menu !== undefined) {
      if (!['true', 'false', '1', '0'].includes(query.use_in_menu)) throw new HttpError(400, 'Filtro de menu inválido.');
      where.use_in_menu = ['true', '1'].includes(query.use_in_menu);
    }
    const result = await Category.findAndCountAll({ attributes: categoryFields, where, order, ...paging.slice });
    return list(result.rows.map(row => pick(row, paging.fields || categoryFields)), result.count, paging);
  }

  async function productSearch(query, origin) {
    const paging = pagination(query, productFields);
    const conditions = [];
    if (query.match !== undefined) {
      if (typeof query.match !== 'string' || !query.match.trim() || query.match.length > 255) {
        throw new HttpError(400, 'Termo de busca inválido.');
      }
      const keyword = query.match.trim().replace(/[\\%_]/g, character => '\\' + character);
      conditions.push({ [Op.or]: ['name', 'description'].map(field => ({ [field]: { [Op.like]: '%' + keyword + '%' } })) });
    }
    if (query.category_ids !== undefined) {
      if (typeof query.category_ids !== 'string') throw new HttpError(400, 'Categorias inválidas.');
      const ids = query.category_ids.split(',').map(value => parseId(value.trim()));
      if (ids.length > 100) throw new HttpError(400, 'Informe até 100 categorias.');
      // Os IDs são inteiros validados. EXISTS evita duplicatas e mantém a paginação por produto.
      conditions.push(db.literal('EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = Product.id AND pc.category_id IN (' + ids.join(',') + '))'));
    }
    if (query['price-range'] !== undefined) {
      const value = query['price-range'];
      const match = typeof value === 'string' && /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(value);
      if (!match || +match[1] > +match[2] || +match[2] > 1e10) throw new HttpError(400, 'Faixa de preços inválida.');
      conditions.push({ price: { [Op.between]: [+match[1], +match[2]] } });
    }
    for (const [key, value] of Object.entries(query)) {
      if (!key.startsWith('option')) continue;
      const option = /^option\[(\d+)\]$/.exec(key);
      if (!option || typeof value !== 'string') throw new HttpError(400, 'Filtro de opção inválido.');
      const id = parseId(option[1]);
      const values = value.split(',').map(x => x.trim());
      if (values.length > 100 || values.some(x => !x || x.length > 255)) throw new HttpError(400, 'Valores de opção inválidos.');
      const clauses = values.map(x => 'FIND_IN_SET(' + db.escape(x) + ', po.`values`) > 0');
      conditions.push(db.literal('EXISTS (SELECT 1 FROM product_options po WHERE po.product_id = Product.id AND po.id = ' +
        id + ' AND (' + clauses.join(' OR ') + '))'));
    }
    // Primeiro localiza os IDs paginados, depois traz as associações em lote.
    const where = conditions.length ? { [Op.and]: conditions } : {};
    const result = await Product.findAndCountAll({ attributes: ['id'], where, order, ...paging.slice });
    const ids = result.rows.map(row => row.id);
    const rows = ids.length ? await Product.findAll({ where: { id: ids }, include, order }) : [];
    return list(rows.map(row => productJson(row, origin, paging.fields)), result.count, paging);
  }

  async function productGet(id, origin) {
    const row = await Product.findByPk(id, { include });
    if (!row) throw notFound();
    return productJson(row, origin);
  }

  async function updateImages(row, images, transaction, created, obsolete, updating) {
    for (const { id, deleted, type, content, enabled } of images) {
      if (id !== undefined && !updating) throw new HttpError(400, 'Não informe ID para imagens novas.');
      const old = id ? await Image.findOne({ where: { id, product_id: row.id }, transaction }) : null;
      if (id && !old) throw new HttpError(400, 'Imagem não pertence a este produto.');
      if (deleted) {
        if (!old) throw new HttpError(400, 'Informe o ID da imagem a excluir.');
        obsolete.push(old.path);
        await old.destroy({ transaction });
        continue;
      }
      if (!old && !content) throw new HttpError(400, 'Informe o conteúdo da imagem.');
      const update = enabled === undefined ? {} : { enabled };
      if (content) update.path = await media.saveImage(content, type, created);
      if (old) {
        if (update.path && update.path !== old.path) obsolete.push(old.path);
        await old.update(update, { transaction });
      } else await Image.create({ ...update, product_id: row.id }, { transaction });
    }
  }

  async function updateOptions(row, options, transaction, updating) {
    for (const { id, deleted, value, values, ...data } of options) {
      if (id !== undefined && !updating) throw new HttpError(400, 'Não informe ID para opções novas.');
      const old = id ? await Option.findOne({ where: { id, product_id: row.id }, transaction }) : null;
      if (id && !old) throw new HttpError(400, 'Opção não pertence a este produto.');
      if (deleted) {
        if (!old) throw new HttpError(400, 'Informe o ID da opção a excluir.');
        await old.destroy({ transaction });
        continue;
      }
      if (value && values) throw new HttpError(400, 'Use apenas values, ou o alias value.');
      const items = values || value;
      if (items) {
        data.values = items.join(',');
        if (data.values.length > 255 || items.some(item => item.includes(','))) {
          throw new HttpError(400, 'Opções não podem conter vírgula e seu total não pode ultrapassar 255 caracteres.');
        }
      }
      if (!old && (!data.title || !data.values)) throw new HttpError(400, 'Informe título e valores da opção.');
      if (old) await old.update(data, { transaction });
      else await Option.create({ ...data, product_id: row.id }, { transaction });
    }
  }

  async function productSave(id, data) {
    const { category_ids, images = [], options = [], ...fields } = data;
    const created = [], obsolete = [];
    let result;
    try {
      result = await db.transaction(async transaction => {
        const row = id
          ? await Product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
          : await Product.create(fields, { transaction });
        if (!row) throw notFound();
        if (id) await row.update(fields, { transaction });
        if (category_ids !== undefined) {
          const ids = [...new Set(category_ids)];
          if (ids.length && await Category.count({ where: { id: ids }, transaction }) !== ids.length) {
            throw new HttpError(400, 'Uma ou mais categorias não existem.');
          }
          await row.setCategories(ids, { transaction });
        }
        await updateImages(row, images, transaction, created, obsolete, Boolean(id));
        await updateOptions(row, options, transaction, Boolean(id));
        return row.id;
      });
    } catch (error) {
      await media.discard(created);
      throw error;
    }
    await media.discard(obsolete);
    return result;
  }

  async function productDelete(id) {
    const paths = await db.transaction(async transaction => {
      const row = await Product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw notFound();
      const images = await Image.findAll({ where: { product_id: id }, attributes: ['path'], transaction });
      await row.destroy({ transaction });
      return images.map(({ path }) => path);
    });
    await media.discard(paths);
  }

  return { categorySearch, productSearch, productGet, productSave, productDelete };
}
module.exports = { catalog, categoryFields, pick, notFound };
