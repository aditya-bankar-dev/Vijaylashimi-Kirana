class AppError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const require_ = (body, fields) => {
  const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new AppError(`Missing required fields: ${missing.join(', ')}`);
};
module.exports = { AppError, asyncHandler, round2, require_ };
