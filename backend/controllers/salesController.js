const crypto = require('crypto');
const db = require('../config/db');
const { AppError, asyncHandler, round2, require_ } = require('../utils/helpers');
const audit = require('../utils/audit');

// POST /api/sales  { idempotency_key, customer_id?, discount_amount?, items:[{product_id,quantity}], payments:[{method,amount,reference?}] }
// Selling price is GST-inclusive (Indian retail style); GST is extracted from line totals.
exports.create = asyncHandler(async (req, res) => {
  const { idempotency_key, customer_id = null, items, payments } = req.body;
  require_(req.body, ['idempotency_key', 'items', 'payments']);
  if (!Array.isArray(items) || !items.length) throw new AppError('Cart is empty');
  if (!Array.isArray(payments) || !payments.length) throw new AppError('Payment required');
  const [[dup]] = await db.execute('SELECT id,invoice_no FROM sales WHERE idempotency_key=?', [idempotency_key]);
  if (dup) return res.json({ success: true, duplicate: true, id: dup.id, invoice_no: dup.invoice_no });

  const merged = new Map();
  for (const it of items) {
    const q = Number(it.quantity);
    if (!(q > 0)) throw new AppError('Quantity must be greater than 0');
    merged.set(Number(it.product_id), (merged.get(Number(it.product_id)) || 0) + q);
  }
  if (payments.some(x => !['cash', 'upi', 'card'].includes(x.method) || !(Number(x.amount) > 0))) throw new AppError('Invalid payment entry');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const ids = [...merged.keys()].sort((a, b) => a - b);               // fixed lock order avoids deadlocks
    const [prods] = await conn.query('SELECT * FROM products WHERE id IN (?) AND is_active=1 ORDER BY id FOR UPDATE', [ids]);
    if (prods.length !== ids.length) throw new AppError('One or more products are unavailable');
    let subtotal = 0, gstTotal = 0; const lines = [];
    for (const p of prods) {
      const qty = merged.get(p.id);
      if (p.quantity < qty) throw new AppError(`Insufficient stock for ${p.name} (available ${p.quantity})`, 409);
      if (p.expiry_date && new Date(p.expiry_date) < new Date(new Date().toDateString())) throw new AppError(`${p.name} is expired and cannot be sold`, 409);
      const line = round2(p.selling_price * qty), gst = round2(line * p.gst_rate / (100 + Number(p.gst_rate)));
      subtotal += line; gstTotal += gst; lines.push({ p, qty, line, gst });
    }
    subtotal = round2(subtotal);
    const discount = round2(Number(req.body.discount_amount || 0));
    if (discount < 0 || discount > subtotal) throw new AppError('Invalid discount');
    const grand = round2(subtotal - discount), gstAmount = subtotal ? round2(gstTotal * (grand / subtotal)) : 0;
    const paid = round2(payments.reduce((s, x) => s + Number(x.amount), 0));
    const nonCash = round2(payments.filter(x => x.method !== 'cash').reduce((s, x) => s + Number(x.amount), 0));
    if (paid < grand) throw new AppError(`Payment short by ₹${round2(grand - paid)}`);
    if (nonCash > grand) throw new AppError('UPI/Card amount cannot exceed the bill total');
    const change = round2(paid - grand);

    const [s] = await conn.execute('INSERT INTO sales(invoice_no,idempotency_key,customer_id,cashier_id,subtotal,discount_amount,gst_amount,grand_total,paid_amount,change_amount) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [crypto.randomUUID().slice(0, 30), idempotency_key, customer_id, req.user.id, subtotal, discount, gstAmount, grand, paid, change]);
    const invoice = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(s.insertId).padStart(6, '0')}`;
    await conn.execute('UPDATE sales SET invoice_no=? WHERE id=?', [invoice, s.insertId]);

    for (const { p, qty, line, gst } of lines) {
      await conn.execute('INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,purchase_price,gst_rate,gst_amount,line_total) VALUES (?,?,?,?,?,?,?,?)',
        [s.insertId, p.id, qty, p.selling_price, p.purchase_price, p.gst_rate, gst, line]);
      await conn.execute('UPDATE products SET quantity=quantity-? WHERE id=?', [qty, p.id]);
      await conn.execute("INSERT INTO stock_movements(product_id,type,quantity,balance_after,reference_type,reference_id,created_by) VALUES (?,'sale',?,?,'sale',?,?)",
        [p.id, -qty, round2(p.quantity - qty), s.insertId, req.user.id]);
    }
    for (const x of payments) await conn.execute('INSERT INTO payments(sale_id,method,amount,reference) VALUES (?,?,?,?)', [s.insertId, x.method, x.amount, x.reference || null]);
    if (customer_id) {
      const [[st]] = await conn.execute("SELECT setting_value v FROM store_settings WHERE setting_key='loyalty_points_per_100'");
      await conn.execute('UPDATE customers SET total_spent=total_spent+?, loyalty_points=loyalty_points+? WHERE id=?', [grand, Math.floor(grand / 100) * Number(st?.v || 1), customer_id]);
    }
    await conn.commit();
    audit(req, 'create_sale', 'sale', s.insertId, { invoice, grand });
    res.status(201).json({ success: true, id: s.insertId, invoice_no: invoice, grand_total: grand, change });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

exports.list = asyncHandler(async (req, res) => {
  const w = [], v = [];
  if (req.query.from) { w.push('DATE(s.created_at)>=?'); v.push(req.query.from); }
  if (req.query.to) { w.push('DATE(s.created_at)<=?'); v.push(req.query.to); }
  if (req.query.customer_id) { w.push('s.customer_id=?'); v.push(req.query.customer_id); }
  if (req.user.role === 'cashier') { w.push('s.cashier_id=?'); v.push(req.user.id); }
  const [rows] = await db.query(`SELECT s.*, c.name customer_name, u.name cashier_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.cashier_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY s.id DESC LIMIT 200`, v);
  res.json({ success: true, data: rows });
});

exports.get = asyncHandler(async (req, res) => {
  const [[s]] = await db.execute('SELECT s.*, c.name customer_name, u.name cashier_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.cashier_id WHERE s.id=?', [req.params.id]);
  if (!s) throw new AppError('Sale not found', 404);
  const [items] = await db.execute('SELECT si.*, p.name FROM sale_items si JOIN products p ON p.id=si.product_id WHERE sale_id=?', [s.id]);
  const [pays] = await db.execute('SELECT method,amount,reference FROM payments WHERE sale_id=?', [s.id]);
  res.json({ success: true, data: { ...s, items, payments: pays } });
});
