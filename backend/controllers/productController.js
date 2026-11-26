const db = require('../config/db');
const { AppError, asyncHandler, require_ } = require('../utils/helpers');
const audit = require('../utils/audit');
const F = ['sku','name','barcode','category_id','brand','unit','purchase_price','selling_price','mrp','gst_rate','reorder_level','expiry_date','supplier_id'];

exports.list = asyncHandler(async (req, res) => {
  const w = ['p.is_active=1'], v = [];
  if (req.query.q) { w.push('(p.name LIKE ? OR p.barcode=? OR p.sku LIKE ?)'); v.push(`%${req.query.q}%`, req.query.q, `%${req.query.q}%`); }
  if (req.query.category_id) { w.push('p.category_id=?'); v.push(req.query.category_id); }
  if (req.query.low === '1') w.push('p.quantity<=p.reorder_level');
  if (req.query.expiring === '1') w.push('p.expiry_date IS NOT NULL AND p.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY)');
  const [rows] = await db.query(`SELECT p.*, c.name category_name, s.name supplier_name FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE ${w.join(' AND ')} ORDER BY p.name LIMIT 500`, v);
  res.json({ success: true, data: rows });
});

exports.byBarcode = asyncHandler(async (req, res) => {
  const [[p]] = await db.execute('SELECT * FROM products WHERE barcode=? AND is_active=1', [req.params.code]);
  if (!p) throw new AppError('Product not found for this barcode', 404);
  res.json({ success: true, data: p });
});

exports.alerts = asyncHandler(async (req, res) => {
  const [low] = await db.query('SELECT id,name,quantity,reorder_level,unit FROM products WHERE is_active=1 AND quantity<=reorder_level ORDER BY quantity');
  const [expiring] = await db.query('SELECT id,name,expiry_date,quantity FROM products WHERE is_active=1 AND expiry_date IS NOT NULL AND expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY) ORDER BY expiry_date');
  res.json({ success: true, lowStock: low, expiring });
});

function check(b) {
  if (Number(b.selling_price) < 0 || Number(b.purchase_price) < 0) throw new AppError('Prices cannot be negative');
  if (b.mrp !== undefined && b.selling_price !== undefined && Number(b.mrp) < Number(b.selling_price)) throw new AppError('Selling price cannot exceed MRP');
  if (b.gst_rate !== undefined && ![0, 0.25, 3, 5, 12, 18, 28].includes(Number(b.gst_rate))) throw new AppError('Invalid GST slab');
}

exports.create = asyncHandler(async (req, res) => {
  require_(req.body, ['sku', 'name', 'category_id', 'purchase_price', 'selling_price', 'mrp']);
  check(req.body);
  const f = F.filter(k => req.body[k] !== undefined), qty = Number(req.body.quantity || 0);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.execute(`INSERT INTO products(${f.join(',')},quantity,image_path) VALUES (${f.map(() => '?').join(',')},?,?)`,
      [...f.map(k => req.body[k]), qty, req.file ? '/uploads/' + req.file.filename : null]);
    if (qty > 0) await conn.execute("INSERT INTO stock_movements(product_id,type,quantity,balance_after,note,created_by) VALUES (?,'stock_in',?,?,'Opening stock',?)", [r.insertId, qty, qty, req.user.id]);
    await conn.commit();
    audit(req, 'create', 'product', r.insertId);
    res.status(201).json({ success: true, id: r.insertId });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

exports.update = asyncHandler(async (req, res) => {
  check(req.body);
  const f = F.filter(k => req.body[k] !== undefined), vals = f.map(k => req.body[k]), sets = f.map(k => k + '=?');
  if (req.file) { sets.push('image_path=?'); vals.push('/uploads/' + req.file.filename); }
  if (!sets.length) throw new AppError('Nothing to update');
  const [r] = await db.execute(`UPDATE products SET ${sets.join(',')} WHERE id=?`, [...vals, req.params.id]);
  if (!r.affectedRows) throw new AppError('Product not found', 404);
  audit(req, 'update', 'product', req.params.id);
  res.json({ success: true });
});

// Safe delete: products with sales/purchase history are deactivated, never hard-deleted
exports.remove = asyncHandler(async (req, res) => {
  const [[used]] = await db.execute('SELECT (SELECT COUNT(*) FROM sale_items WHERE product_id=?) + (SELECT COUNT(*) FROM purchase_items WHERE product_id=?) n', [req.params.id, req.params.id]);
  if (used.n > 0) await db.execute('UPDATE products SET is_active=0 WHERE id=?', [req.params.id]);
  else await db.execute('DELETE FROM products WHERE id=?', [req.params.id]);
  audit(req, 'delete', 'product', req.params.id, { soft: used.n > 0 });
  res.json({ success: true, deactivated: used.n > 0 });
});
