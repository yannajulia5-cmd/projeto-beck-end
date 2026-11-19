const { z } = require('zod');
const { HttpError } = require('./errors');

const text = z.string().trim().min(1).max(255);
const slug = text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const email = text.email().transform(value => value.toLowerCase());
const password = z.string().min(6).refine(value => Buffer.byteLength(value) <= 72, 'A senha deve ter até 72 bytes.');
const id = z.number().int().min(1).max(2147483647);
const uint = z.number().int().min(0).max(2147483647);
const userUpdate = z.object({ firstname: text, surname: text, email }).strict();
const userCreate = userUpdate.extend({ password, confirmPassword: password }).refine(
  data => data.password === data.confirmPassword,
  { message: 'As senhas não coincidem.', path: ['confirmPassword'] }
);
const login = z.object({ email, password }).strict();
const category = z.object({ name: text, slug, use_in_menu: z.boolean().optional() }).strict();
const image = z.object({
  id: id.optional(), deleted: z.boolean().optional(), enabled: z.boolean().optional(),
  type: z.enum(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']).optional(),
  content: z.string().trim().min(1).max(2800000).optional()
}).strict();
const option = z.object({
  id: id.optional(), deleted: z.boolean().optional(), title: text.optional(),
  shape: z.enum(['square', 'circle']).optional(),
  radius: z.union([uint, z.string().regex(/^\d+px$/).transform(s => Number(s.slice(0, -2))).pipe(uint)]).optional(),
  type: z.enum(['text', 'color']).optional(),
  value: z.array(text).min(1).max(100).optional(), values: z.array(text).min(1).max(100).optional()
}).strict();
const product = z.object({
  enabled: z.boolean().optional(), name: text, slug, use_in_menu: z.boolean().optional(),
  stock: uint.optional(), description: z.string().max(255).nullable().optional(),
  price: z.number().finite().min(0).max(1e10),
  price_with_discount: z.number().finite().min(0).max(1e10),
  category_ids: z.array(id).max(100).optional(),
  images: z.array(image).max(20).optional(), options: z.array(option).max(50).optional()
}).strict();
function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new HttpError(400, 'ID inválido.');
  return id.parse(Number(value));
}
function pagination(query, allowed) {
  const limit = query.limit === undefined ? 12 : query.limit === '-1' ? -1 : parseId(query.limit);
  const page = limit === -1 || query.page === undefined ? 1 : parseId(query.page);
  const offset = limit === -1 ? 0 : (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new HttpError(400, 'Paginação inválida.');
  let fields;
  if (query.fields !== undefined) {
    if (typeof query.fields !== 'string') throw new HttpError(400, 'Campos inválidos.');
    fields = [...new Set(query.fields.split(',').map(field => field.trim()))];
    if (fields.some(field => !allowed.includes(field))) throw new HttpError(400, 'Campo não permitido.');
  }
  return { limit, page, fields, slice: limit === -1 ? {} : { limit, offset } };
}
module.exports = { userCreate, userUpdate, login, category, product, parseId, pagination };
