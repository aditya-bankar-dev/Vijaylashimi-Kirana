const db = require('../config/db');
const { AppError, asyncHandler, round2, require_ } = require('../utils/helpers');
const audit = require('../utils/audit');

async function applyPayment(conn, p, userId) {
  const amount = round2(p.amount);
  if (!(amount > 0)) throw new AppError('Payment amount must be greater than 0');
  if (!['cash', 'upi', 'card', 'bank'].includes(p.method)) throw new AppError('Invalid payment method');
  const [[sup]] = await conn.execute('SELECT outstanding_balance FROM suppliers WHERE id=? FOR UPDATE', [p.supplier_id]);
  if (!sup) throw new AppError('Supplier not found', 404);
  if (amount > sup.outstanding_balance) throw new AppError(`Payment exceeds outstanding balance (₹${sup.outstanding_balance})`);
  if (p.purchase_id) {
    const [[pu]] = await conn.execute("SELECT total,paid_amount FROM purchases WHERE id=? AND supplier_id=? AND status='confirmed' FOR UPDATE", [p.purchase_id, p.supplier_id]);
    if (!pu) throw new AppError('Confirmed purchase not found for this supplier', 404);
    const paid = round2(pu.paid_amount + amount);
    if (paid > pu.total) throw new AppError('Payment exceeds purchase balance');
    await conn.execute('UPDATE purchases SET paid_amount=?, payment_status=? WHERE id=?', [paid, paid >= pu.total ? 'paid' : 'partial', p.purchase_id]);
  }
  await conn.execute('UPDATE suppliers SET outstanding_balance=outstanding_balance-? WHERE id=?', [amount, p.supplier_id]);
  const [r] = await conn.execute('INSERT INTO supplier_payments(supplier_id,purchase_id,amount,method,reference,paid_on,created_by) VALUES (?,?,?,?,?,CURDATE(),?)',
    [p.supplier_id, p.purchase_id || null, amount, p.method, p.reference || null, userId]);
  return r.insertId;
}

async function confirmPurchase(conn, id, req) {
  const [[pu]] = await conn.execute('SELECT * FROM purchases WHERE id=? FOR UPDATE', [id]);
  if (!pu) throw new AppError('Purchase not found', 404);
  if (pu.status !== 'draft') throw new AppError(`Purchase is already ${pu.status}`, 409);
  const [items] = await conn.execute('SELECT * FROM purchase_items WHERE purchase_id=? ORDER BY product_id', [id]);
  for (const it of items) {
    const [[p]] = await conn.execute('SELECT quantity FROM products WHERE id=? FOR UPDATE', [it.product_id]);
    const after = round2(p.quantity + Number(it.quantity));
    await conn.execute('UPDATE products SET quantity=?, purchase_price=?, expiry_date=COALESCE(?,expiry_date) WHERE id=?', [after, it.unit_price, it.expiry_date, it.product_id]);
    await conn.execute('INSERT INTO product_batches(product_id,batch_no,expiry_date,quantity,purchase_price,received_on) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
      [it.product_id, it.batch_no || pu.purchase_no, it.expiry_date, it.quantity, it.unit_price, pu.purchase_date]);
    await conn.execute("INSERT INTO stock_movements(product_id,type,quantity,balance_after,reference_type,reference_id,created_by) VALUES (?,'purchase',?,?,'purchase',?,?)", [it.product_id, it.quantity, after, id, req.user.id]);
  }
  await conn.execute("UPDATE purchases SET status='confirmed' WHERE id=?", [id]);
  await conn.execute('UPDATE suppliers SET outstanding_balance=outstanding_balance+? WHERE id=?', [pu.total, pu.supplier_id]);
}

exports.create = asyncHandler(async (req, res) => {
  require_(req.body, ['supplier_id', 'purchase_date', 'items']);
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) throw new AppError('Add at least one item');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let sub = 0, gst = 0; const rows = [];
    for (const it of items) {
      const q = Number(it.quantity), pr = Number(it.unit_price), rate = Number(it.gst_rate || 0);
      if (!(q > 0) || !(pr >= 0)) throw new AppError('Invalid quantity or price');
      const line = round2(q * pr), g = round2(line * rate / 100); sub += line; gst += g;
      rows.push([it.product_id, q, pr, rate, g, round2(line + g), it.batch_no || null, it.expiry_date || null]);
    }
    sub = round2(sub); gst = round2(gst);
    const [r] = await conn.execute('INSERT INTO purchases(purchase_no,supplier_id,supplier_invoice_no,purchase_date,subtotal,gst_amount,total,created_by) VALUES (?,?,?,?,?,?,?,?)',
      ['TMP' + Date.now(), req.body.supplier_id, req.body.supplier_invoice_no || null, req.body.purchase_date, sub, gst, round2(sub + gst), req.user.id]);
    await conn.execute('UPDATE purchases SET purchase_no=? WHERE id=?', [`PO-${String(r.insertId).padStart(6, '0')}`, r.insertId]);
    for (const x of rows) await conn.execute('INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_price,gst_rate,gst_amount,line_total,batch_no,expiry_date) VALUES (?,?,?,?,?,?,?,?,?)', [r.insertId, ...x]);
    if (req.body.confirm) {
      await confirmPurchase(conn, r.insertId, req);
      if (Number(req.body.paid_amount) > 0) await applyPayment(conn, { supplier_id: req.body.supplier_id, purchase_id: r.insertId, amount: req.body.paid_amount, method: req.body.payment_method || 'cash' }, req.user.id);
    }
    await conn.commit();
    audit(req, 'create_purchase', 'purchase', r.insertId);
    res.status(201).json({ success: true, id: r.insertId });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

exports.confirm = asyncHandler(async (req, res) => {
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); await confirmPurchase(conn, req.params.id, req); await conn.commit(); }
  catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  audit(req, 'confirm_purchase', 'purchase', req.params.id);
  res.json({ success: true });
});

exports.cancel = asyncHandler(async (req, res) => {
  const [r] = await db.execute("UPDATE purchases SET status='cancelled' WHERE id=? AND status='draft'", [req.params.id]);
  if (!r.affectedRows) throw new AppError('Only draft purchases can be cancelled', 409);
  res.json({ success: true });
});

exports.list = asyncHandler(async (req, res) => {
  const w = [], v = [];
  for (const [k, c] of [['supplier_id', 'p.supplier_id=?'], ['status', 'p.status=?'], ['payment_status', 'p.payment_status=?']]) if (req.query[k]) { w.push(c); v.push(req.query[k]); }
  const [rows] = await db.query(`SELECT p.*, s.name supplier_name FROM purchases p JOIN suppliers s ON s.id=p.supplier_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.id DESC LIMIT 200`, v);
  res.json({ success: true, data: rows });
});

exports.get = asyncHandler(async (req, res) => {
  const [[p]] = await db.execute('SELECT p.*, s.name supplier_name FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?', [req.params.id]);
  if (!p) throw new AppError('Purchase not found', 404);
  const [items] = await db.execute('SELECT i.*, pr.name FROM purchase_items i JOIN products pr ON pr.id=i.product_id WHERE purchase_id=?', [p.id]);
  res.json({ success: true, data: { ...p, items } });
});

exports.pay = asyncHandler(async (req, res) => {
  require_(req.body, ['supplier_id', 'amount', 'method']);
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); const id = await applyPayment(conn, req.body, req.user.id); await conn.commit(); audit(req, 'supplier_payment', 'supplier', req.body.supplier_id, { id }); res.status(201).json({ success: true, id }); }
  catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

exports.supplierHistory = asyncHandler(async (req, res) => {
  const [purchases] = await db.execute('SELECT id,purchase_no,purchase_date,total,paid_amount,payment_status,status FROM purchases WHERE supplier_id=? ORDER BY id DESC', [req.params.id]);
  const [payments] = await db.execute('SELECT * FROM supplier_payments WHERE supplier_id=? ORDER BY id DESC', [req.params.id]);
  const [[s]] = await db.execute('SELECT outstanding_balance FROM suppliers WHERE id=?', [req.params.id]);
  res.json({ success: true, outstanding: s?.outstanding_balance ?? 0, purchases, payments });
});
