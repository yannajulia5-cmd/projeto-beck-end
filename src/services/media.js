const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { HttpError } = require('../middleware/errors');

const root = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
const localPattern = /^\/media\/([\da-f-]+\.(?:png|jpg|gif|webp))$/;
function format(bytes) {
  if (bytes.length < 12) return undefined;
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'jpg';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
}
async function saveImage(value, mime, created) {
  if (/^https?:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); } catch { throw new HttpError(400, 'URL de imagem inválida.'); }
    if (url.username || url.password || url.href.length > 255) throw new HttpError(400, 'URL de imagem inválida.');
    // Apenas armazenamos a URL. O servidor não faz requisições para endereços informados pelo cliente.
    return url.href;
  }
  const data = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(value);
  if (data && mime && mime.replace('jpeg', 'jpg') !== data[1].toLowerCase().replace('jpeg', 'jpg')) {
    throw new HttpError(400, 'Tipos de imagem não coincidem.');
  }
  const base64 = data ? data[2] : value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new HttpError(400, 'Imagem deve conter Base64 válido ou URL HTTP(S).');
  }
  const bytes = Buffer.from(base64, 'base64');
  const ext = format(bytes);
  const requested = (mime || data?.[1] || '').toLowerCase().replace('image/', '').replace('jpeg', 'jpg');
  if (!ext || (requested && ext !== requested) || bytes.length > 2 * 1024 * 1024) {
    throw new HttpError(400, 'Imagem inválida ou maior que 2 MB (PNG, JPEG, GIF ou WebP).');
  }
  const name = randomUUID() + '.' + ext;
  await fs.mkdir(root, { recursive: true });
  created.push('/media/' + name);
  await fs.writeFile(path.join(root, name), bytes, { flag: 'wx' });
  return '/media/' + name;
}
async function discard(paths) {
  await Promise.all(paths.map(async item => {
    const match = localPattern.exec(item);
    if (!match) return;
    try { await fs.rm(path.join(root, match[1]), { force: true }); }
    catch (error) { console.warn('Não foi possível limpar uma imagem:', error.code); }
  }));
}
module.exports = { root, saveImage, discard };
