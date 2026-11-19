const { Sequelize, DataTypes: T } = require('sequelize');
const configurations = require('../config/database');
const db = new Sequelize(configurations[process.env.NODE_ENV || 'development'] || configurations.development);

const col = (type, defaultValue) => ({
  type, allowNull: false, ...(defaultValue === undefined ? {} : { defaultValue })
});
const model = (name, tableName, fields, timestamps = true) =>
  db.define(name, fields, { tableName, timestamps, underscored: true });

const User = model('User', 'users', {
  firstname: col(T.STRING), surname: col(T.STRING), email: { ...col(T.STRING), unique: true },
  password: col(T.STRING)
});
const Category = model('Category', 'categories', {
  name: col(T.STRING), slug: { ...col(T.STRING), unique: true }, use_in_menu: col(T.BOOLEAN, false)
});
const Product = model('Product', 'products', {
  enabled: col(T.BOOLEAN, false), name: col(T.STRING), slug: { ...col(T.STRING), unique: true },
  use_in_menu: col(T.BOOLEAN, false), stock: col(T.INTEGER, 0), description: T.STRING,
  price: col(T.FLOAT), price_with_discount: col(T.FLOAT)
});
const Image = model('ProductImage', 'product_images', {
  product_id: col(T.INTEGER), enabled: col(T.BOOLEAN, false), path: col(T.STRING)
}, false);
const Option = model('ProductOption', 'product_options', {
  product_id: col(T.INTEGER), title: col(T.STRING), shape: col(T.ENUM('square', 'circle'), 'square'),
  radius: col(T.INTEGER, 0), type: col(T.ENUM('text', 'color'), 'text'), values: col(T.STRING)
}, false);
const ProductCategory = model('ProductCategory', 'product_categories', {
  product_id: { ...col(T.INTEGER), primaryKey: true },
  category_id: { ...col(T.INTEGER), primaryKey: true }
}, false);

Product.hasMany(Image, { as: 'images', foreignKey: 'product_id' });
Image.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(Option, { as: 'options', foreignKey: 'product_id' });
Option.belongsTo(Product, { foreignKey: 'product_id' });
Product.belongsToMany(Category, {
  as: 'categories', through: ProductCategory, foreignKey: 'product_id', otherKey: 'category_id'
});
Category.belongsToMany(Product, {
  as: 'products', through: ProductCategory, foreignKey: 'category_id', otherKey: 'product_id'
});
module.exports = { db, User, Category, Product, Image, Option, ProductCategory };
