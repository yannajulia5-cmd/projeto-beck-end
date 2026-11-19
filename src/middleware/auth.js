const jwt = require('jsonwebtoken');
const { HttpError } = require('./errors');

const claims = { issuer: 'digital-store', audience: 'digital-store-api' };
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('Configure JWT_SECRET com pelo menos 32 bytes no .env.');
  }
  return value;
}
function issueToken(id) {
  return jwt.sign({}, secret(), { ...claims, subject: String(id), expiresIn: '1h', algorithm: 'HS256' });
}
function authenticate(User) {
  return async (req, _res, next) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
    if (!bearer) throw new HttpError(401, 'Informe um token Bearer válido.');
    const jwtSecret = secret();
    let payload;
    try {
      payload = jwt.verify(bearer[1], jwtSecret, { ...claims, algorithms: ['HS256'] });
    } catch {
      throw new HttpError(401, 'Token inválido ou expirado.');
    }
    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id < 1 || !(await User.findByPk(id, { attributes: ['id'] }))) {
      throw new HttpError(401, 'Usuário do token não encontrado.');
    }
    req.userId = id;
    next();
  };
}
module.exports = { secret, issueToken, authenticate };
