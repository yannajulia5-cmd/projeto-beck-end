const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const directory = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(directory, '.env.example'), 'utf8');
const content = template.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + randomBytes(48).toString('hex'))
  .replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=' + randomBytes(24).toString('hex'));
try {
  fs.writeFileSync(path.join(directory, '.env'), content, { flag: 'wx', mode: 0o600 });
  console.log('.env criado. Confira as credenciais do banco.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('O .env já existe e foi mantido.');
}
