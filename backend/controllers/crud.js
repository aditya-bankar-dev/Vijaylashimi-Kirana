// Generic, parameterised CRUD factory (used by suppliers, customers, expenses, categories)
const db = require('../config/db');
const { AppError, asyncHandler, require_ } = require('../utils/helpers');
const audit = require('../utils/audit');
module.exports = ({ table, fields, required = [], search = [], soft = false, order = 'id DESC' }) => ({
  list: asyncHandler(async (req, res) => {
    const where = [], vals = [];
    if (soft) where.push('is_active=1');
    if (req.query.q && search.length) { where.push('(' + search.map(c => `${c} LIKE ?`).join(' OR ') + ')'); search.forEach(() => vals.push(`%${req.query.q}%`)); }
    if (req.query.from && fields.includes('expense_date')) { where.push('expense_date>=?'); vals.push(req.query.from); }
    if (req.query.to && fields.includes('expense_date')) { where.push('expense_date<=?'); vals.push(req.query.to); }
    const [rows] = await db.query(`SELECT * FROM ${table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 500`, vals);
    res.json({ success: true, data: rows });
  }),
  get: asyncHandler(async (req, res) => {
    const [[row]] = await db.execute(`SELECT * FROM ${table} WHERE id=?`, [req.params.id]);
    if (!row) throw new AppError('Not found', 404);
    res.json({ success: true, data: row });
  }),
  create: asyncHandler(async (req, res) => {
    require_(req.body, required);
    const f = fields.filter(k => req.body[k] !== undefined && k !== 'created_by');
    if (fields.includes('created_by')) { f.push('created_by'); req.body.created_by = req.user.id; }
    const [r] = await db.execute(`INSERT INTO ${table}(${f.join(',')}) VALUES (${f.map(() => '?').join(',')})`, f.map(k => req.body[k]));
    audit(req, 'create', table, r.insertId);
    res.status(201).json({ success: true, id: r.insertId });
  }),
  update: asyncHandler(async (req, res) => {
    const f = fields.filter(k => req.body[k] !== undefined && k !== 'created_by');
    if (!f.length) throw new AppError('Nothing to update');
    const [r] = await db.execute(`UPDATE ${table} SET ${f.map(k => k + '=?').join(',')} WHERE id=?`, [...f.map(k => req.body[k]), req.params.id]);
    if (!r.affectedRows) throw new AppError('Not found', 404);
    audit(req, 'update', table, req.params.id);
    res.json({ success: true });
  }),
  remove: asyncHandler(async (req, res) => {
    const sql = soft ? `UPDATE ${table} SET is_active=0 WHERE id=?` : `DELETE FROM ${table} WHERE id=?`;
    const [r] = await db.execute(sql, [req.params.id]);
    if (!r.affectedRows) throw new AppError('Not found', 404);
    audit(req, 'delete', table, req.params.id);
    res.json({ success: true });
  })
});
