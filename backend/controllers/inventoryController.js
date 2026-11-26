const db = require('../config/db');
const { AppError, asyncHandler, round2, require_ } = require('../utils/helpers');
const audit = require('../utils/audit');
const SIGN = { stock_in: 1, stock_out: -1, damaged: -1, expired: -1, adjustment: 0 };

// adjustment: quantity = new absolute stock; others: quantity = positive amount moved
exports.move = asyncHandler(async (req, res) => {
  require_(req.body, ['product_id', 'type', 'quantity']);
  const { product_id, type, note } = req.body, q = Number(req.body.quantity);
  if (!(type in SIGN)) throw new AppError('Invalid movement type');
  if (!(q >= 0) || (type !== 'adjustment' && q === 0)) throw new AppError('Invalid quantity');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.execute('SELECT quantity FROM products WHERE id=? FOR UPDATE', [product_id]);
    if (!p) throw new AppError('Product not found', 404);
    const delta = type === 'adjustment' ? round2(q - p.quantity) : SIGN[type] * q, after = round2(p.quantity + delta);
    if (after < 0) throw new AppError('Stock cannot go below zero', 409);
    await conn.execute('UPDATE products SET quantity=? WHERE id=?', [after, product_id]);
    await conn.execute('INSERT INTO stock_movements(product_id,type,quantity,balance_after,note,created_by) VALUES (?,?,?,?,?,?)', [product_id, type, delta, after, note || null, req.user.id]);
    await conn.commit();
    audit(req, 'stock_' + type, 'product', product_id, { delta });
    res.json({ success: true, balance: after });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

exports.movements = asyncHandler(async (req, res) => {
  const w = [], v = [];
  if (req.query.product_id) { w.push('m.product_id=?'); v.push(req.query.product_id); }
  if (req.query.type) { w.push('m.type=?'); v.push(req.query.type); }
  const [rows] = await db.query(`SELECT m.*, p.name product_name FROM stock_movements m JOIN products p ON p.id=m.product_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY m.id DESC LIMIT 300`, v);
  res.json({ success: true, data: rows });
});

exports.valuation = asyncHandler(async (req, res) => {
  const [[t]] = await db.query('SELECT COALESCE(SUM(quantity*purchase_price),0) cost_value, COALESCE(SUM(quantity*selling_price),0) retail_value, COUNT(*) products FROM products WHERE is_active=1');
  res.json({ success: true, data: t });
});
