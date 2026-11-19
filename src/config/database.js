require('dotenv').config();
const configuration = {
  dialect: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'digital_store',
  username: process.env.DB_USER || 'digital_store',
  password: process.env.DB_PASSWORD || '',
  logging: false
};
module.exports = { development: configuration, test: configuration, production: configuration };
