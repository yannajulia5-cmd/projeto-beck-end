const { createApp } = require('./app');
const { db } = require('./models');
const { secret } = require('./middleware/auth');

async function start() {
  secret();
  await db.authenticate();
  const port = Number(process.env.PORT || 3000);
  const server = createApp().listen(port, () => {
    console.log(`API http://localhost:${port} | Swagger http://localhost:${port}/docs/`);
  });
  server.on('error', async error => {
    console.error('Não foi possível iniciar a API:', error.message);
    await db.close();
    process.exitCode = 1;
  });
}

start().catch(error => {
  console.error('Não foi possível iniciar a API:', error.message);
  console.error('Confira o .env e se o MySQL está ligado.');
  process.exitCode = 1;
});
