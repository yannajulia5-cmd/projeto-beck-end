const tables = ['users', 'categories', 'products', 'product_images', 'product_options', 'product_categories'];

module.exports = {
  async up(query, T) {
    const id = () => ({ type: T.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false });
    const required = (type) => ({ type, allowNull: false });
    const defaults = (type, defaultValue) => ({ type, defaultValue, allowNull: false });
    const timestamps = () => ({ created_at: required(T.DATE), updated_at: required(T.DATE) });
    const foreign = (model) => ({
      ...required(T.INTEGER), references: { model, key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
    });
    await query.createTable('users', {
      id: id(), firstname: required(T.STRING), surname: required(T.STRING),
      email: { ...required(T.STRING), unique: true }, password: required(T.STRING), ...timestamps()
    });
    await query.createTable('categories', {
      id: id(), name: required(T.STRING), slug: { ...required(T.STRING), unique: true },
      use_in_menu: defaults(T.BOOLEAN, false), ...timestamps()
    });
    await query.createTable('products', {
      id: id(), enabled: defaults(T.BOOLEAN, false), name: required(T.STRING),
      slug: { ...required(T.STRING), unique: true }, use_in_menu: defaults(T.BOOLEAN, false),
      stock: defaults(T.INTEGER, 0), description: { type: T.STRING }, price: required(T.FLOAT),
      price_with_discount: required(T.FLOAT), ...timestamps()
    });
    await query.createTable('product_images', {
      id: id(), product_id: foreign('products'), enabled: defaults(T.BOOLEAN, false), path: required(T.STRING)
    });
    await query.createTable('product_options', {
      id: id(), product_id: foreign('products'), title: required(T.STRING),
      shape: defaults(T.ENUM('square', 'circle'), 'square'), radius: defaults(T.INTEGER, 0),
      type: defaults(T.ENUM('text', 'color'), 'text'), values: required(T.STRING)
    });
    await query.createTable('product_categories', {
      product_id: { ...foreign('products'), primaryKey: true },
      category_id: { ...foreign('categories'), primaryKey: true }
    });
    await query.addIndex('products', ['price']);
    await query.addIndex('categories', ['use_in_menu']);
    await query.addIndex('product_categories', ['category_id', 'product_id']);
  },

  async down(query) {
    for (const table of [...tables].reverse()) await query.dropTable(table);
  }
};
