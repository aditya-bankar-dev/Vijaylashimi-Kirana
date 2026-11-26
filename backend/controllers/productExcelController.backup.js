const ExcelJS = require('exceljs');
const db = require('../config/db');
const { AppError, asyncHandler, round2 } = require('../utils/helpers');
const audit = require('../utils/audit');
const COLS = ['sku', 'name', 'barcode', 'category', 'brand', 'unit', 'purchase_price', 'selling_price', 'mrp', 'gst_rate', 'quantity', 'reorder_level', 'expiry_date'];
const UNITS = ['kg', 'gram', 'litre', 'ml', 'packet', 'piece', 'dozen'], SLABS = [0, 0.25, 3, 5, 12, 18, 28];

exports.export = asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT p.*, c.name category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.is_active=1 ORDER BY p.name');
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Products');
  ws.columns = COLS.map(c => ({ header: c, key: c, width: 18 })); ws.getRow(1).font = { bold: true };
  rows.forEach(r => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
  await wb.xlsx.write(res); res.end();
});

const cell = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v && typeof v === 'object' ? (v.result ?? v.text ?? '') : v ?? '');

// Import rules: row identified by SKU. New SKU -> inserted with quantity. Existing SKU -> details/prices updated, stock untouched.
exports.import = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Upload an .xlsx file');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(req.file.buffer);
  const ws = wb.worksheets[0]; if (!ws) throw new AppError('Empty workbook');
  const head = ws.getRow(1).values.slice(1).map(h => String(cell(h)).trim().toLowerCase());
  if (!['sku', 'name', 'category', 'selling_price'].every(h => head.includes(h))) throw new AppError('Header must include: sku, name, category, purchase_price, selling_price, mrp');
  let added = 0, updated = 0; const errors = [], conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (let n = 2; n <= ws.rowCount; n++) {
      const row = {}; ws.getRow(n).values.slice(1).forEach((v, i) => (row[head[i]] = cell(v)));
      if (!row.sku && !row.name) continue;
      try {
        const [pp, sp, mrp, gst] = [row.purchase_price, row.selling_price, row.mrp, row.gst_rate || 0].map(Number), unit = String(row.unit || 'piece').toLowerCase();
        if (!row.sku || !row.name || !row.category) throw new Error('sku, name and category are required');
        if ([pp, sp, mrp].some(x => !(x >= 0))) throw new Error('invalid prices');
        if (mrp < sp) throw new Error('selling price exceeds MRP');
        if (!UNITS.includes(unit)) throw new Error('invalid unit'); if (!SLABS.includes(gst)) throw new Error('invalid GST slab');
        let [[c]] = await conn.execute('SELECT id FROM categories WHERE name=?', [row.category]);
        const cid = c ? c.id : (await conn.execute('INSERT INTO categories(name,default_gst) VALUES (?,?)', [row.category, gst]))[0].insertId;
        const [[ex]] = await conn.execute('SELECT id FROM products WHERE sku=?', [String(row.sku)]);
        const exp = row.expiry_date || null, bc = row.barcode ? String(row.barcode) : null, rl = Number(row.reorder_level || 10);
        if (ex) { await conn.execute('UPDATE products SET name=?,barcode=?,category_id=?,brand=?,unit=?,purchase_price=?,selling_price=?,mrp=?,gst_rate=?,reorder_level=?,expiry_date=?,is_active=1 WHERE id=?', [row.name, bc, cid, row.brand || null, unit, pp, sp, mrp, gst, rl, exp, ex.id]); updated++; }
        else {
          const q = Number(row.quantity || 0); if (!(q >= 0)) throw new Error('invalid quantity');
          const [r] = await conn.execute('INSERT INTO products(sku,name,barcode,category_id,brand,unit,purchase_price,selling_price,mrp,gst_rate,quantity,reorder_level,expiry_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [String(row.sku), row.name, bc, cid, row.brand || null, unit, pp, sp, mrp, gst, round2(q), rl, exp]);
          if (q > 0) await conn.execute("INSERT INTO stock_movements(product_id,type,quantity,balance_after,note,created_by) VALUES (?,'stock_in',?,?,'Excel import',?)", [r.insertId, q, q, req.user.id]);
          added++;
        }
      } catch (e) { errors.push(`Row ${n}: ${e.code === 'ER_DUP_ENTRY' ? 'duplicate barcode/sku' : e.message}`); }
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  audit(req, 'import_products', 'product', null, { added, updated, errors: errors.length });
  res.json({ success: true, added, updated, errors });
});
