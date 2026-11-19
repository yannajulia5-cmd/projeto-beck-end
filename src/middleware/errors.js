const { ZodError } = require('zod');
const { UniqueConstraintError, ForeignKeyConstraintError, ValidationError } = require('sequelize');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Dados inválidos.',
      details: error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
  }
  if (error instanceof UniqueConstraintError) return res.status(400).json({ message: 'E-mail ou slug já cadastrado.' });
  if (error instanceof ForeignKeyConstraintError || error instanceof ValidationError) {
    return res.status(400).json({ message: 'Dados ou vínculo inválidos.' });
  }
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON inválido.' });
  if (error.status === 413) return res.status(413).json({ message: 'Corpo da requisição muito grande.' });
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  console.error('Erro interno:', error.name, error.original?.code || error.code || '');
  return res.status(500).json({ message: 'Erro interno do servidor.' });
}

module.exports = { HttpError, errorHandler };
