
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { AppError, asyncHandler, round2 } = require('../utils/helpers');
const audit = require('../utils/audit');

const COLS = [
  'sku', 'name', 'barcode', 'category', 'brand',
  'unit', 'purchase_price', 'selling_price', 'mrp',
  'gst_rate', 'quantity', 'reorder_level', 'expiry_date'
];

const REQUIRED = [
  'sku', 'name', 'category',
  'purchase_price', 'selling_price', 'mrp'
];

const UNITS = [
  'kg', 'gram', 'litre', 'ml',
  'packet', 'piece', 'dozen'
];

const SLABS = [0, 0.25, 3, 5, 12, 18, 28];

function cell(v) {
  if (v instanceof Date) return v;

  if (v && typeof v === 'object') {
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
  }

  return v ?? '';
}

function numberValue(value, field, optional = false, fallback = 0) {
  if (value === '' || value === null || value === undefined) {
    if (optional) return fallback;
    throw new Error(`${field} is required`);
  }

  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${field}`);
  }

  return n;
}

function dateValue(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  let date;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Invalid expiry date');
    }

    date = value;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  } else {
    const s = String(value).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new Error('Expiry date must use YYYY-MM-DD format');
    }

    const [y, m, d] = s.split('-').map(Number);
    date = new Date(Date.UTC(y, m - 1, d));

    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      throw new Error('Invalid expiry date');
    }
  }

  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

// EXPORT PRODUCTS
exports.export = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT
      p.sku,
      p.name,
      p.barcode,
      c.name AS category,
      p.brand,
      p.unit,
      p.purchase_price,
      p.selling_price,
      p.mrp,
      p.gst_rate,
      p.quantity,
      p.reorder_level,
      p.expiry_date
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = 1
    ORDER BY p.name
  `);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');

  ws.columns = COLS.map(c => ({
    header: c,
    key: c,
    width: 18
  }));

  ws.getRow(1).font = { bold: true };

  rows.forEach(row => {
    if (row.expiry_date instanceof Date) {
      row.expiry_date = dateValue(row.expiry_date);
    } else if (row.expiry_date) {
      row.expiry_date = String(row.expiry_date).slice(0, 10);
    }

    ws.addRow(row);
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  res.setHeader(
    'Content-Disposition',
    'attachment; filename="products.xlsx"'
  );

  await wb.xlsx.write(res);
  res.end();
});

// IMPORT PRODUCTS
exports.import = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Upload an .xlsx file');
  }

  const wb = new ExcelJS.Workbook();

  await wb.xlsx.load(req.file.buffer);

  const ws = wb.worksheets[0];

  if (!ws || ws.rowCount < 1) {
    throw new AppError('Empty workbook');
  }

  const head = ws.getRow(1).values
    .slice(1)
    .map(h => String(cell(h)).trim().toLowerCase());

  if (new Set(head).size !== head.length) {
    throw new AppError('Duplicate column headers found');
  }

  const missing = REQUIRED.filter(h => !head.includes(h));

  if (missing.length) {
    throw new AppError(
      `Missing required columns: ${missing.join(', ')}`
    );
  }

  let added = 0;
  let updated = 0;

  const errors = [];
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    for (let n = 2; n <= ws.rowCount; n++) {
      const row = {};

      ws.getRow(n).values.slice(1).forEach((v, i) => {
        if (head[i]) {
          row[head[i]] = cell(v);
        }
      });

      if (!row.sku && !row.name) continue;

      try {
        await conn.execute('SAVEPOINT import_row');

        const sku = String(row.sku || '').trim();
        const name = String(row.name || '').trim();
        const category = String(row.category || '').trim();

        const pp = round2(numberValue(row.purchase_price, 'purchase price'));
        const sp = round2(numberValue(row.selling_price, 'selling price'));
        const mrp = round2(numberValue(row.mrp, 'MRP'));

        const gst = numberValue(row.gst_rate, 'GST rate', true, 0);
        const unit = String(row.unit || 'piece').trim().toLowerCase();

        const quantity = numberValue(
          row.quantity,
          'quantity',
          true,
          0
        );

        const reorder = numberValue(
          row.reorder_level,
          'reorder level',
          true,
          10
        );

        if (!sku || sku.length > 30) {
          throw new Error('SKU is required and must be within 30 characters');
        }

        if (!name || name.length > 150) {
          throw new Error('Product name is required and must be within 150 characters');
        }

        if (!category || category.length > 80) {
          throw new Error('Valid category is required');
        }

        if (sp > mrp) {
          throw new Error('Selling price cannot exceed MRP');
        }

        if (!UNITS.includes(unit)) {
          throw new Error('Invalid unit');
        }

        if (!SLABS.includes(gst)) {
          throw new Error('Invalid GST slab');
        }

        const expiry = dateValue(row.expiry_date);

        const barcode = row.barcode
          ? String(row.barcode).trim()
          : null;

        if (barcode && barcode.length > 50) {
          throw new Error('Barcode must be within 50 characters');
        }

        const brand = row.brand
          ? String(row.brand).trim()
          : null;

        const [[categoryRow]] = await conn.execute(
          'SELECT id, is_active FROM categories WHERE name = ?',
          [category]
        );

        let categoryId;

        if (categoryRow) {
          categoryId = categoryRow.id;

          if (!categoryRow.is_active) {
            await conn.execute(
              'UPDATE categories SET is_active = 1 WHERE id = ?',
              [categoryId]
            );
          }
        } else {
          const [result] = await conn.execute(
            'INSERT INTO categories(name, default_gst) VALUES (?, ?)',
            [category, gst]
          );

          categoryId = result.insertId;
        }

        const [[existing]] = await conn.execute(
          'SELECT id FROM products WHERE sku = ?',
          [sku]
        );

        if (existing) {
          // Existing stock is intentionally NOT updated.
          await conn.execute(`
            UPDATE products SET
              name = ?,
              barcode = ?,
              category_id = ?,
              brand = ?,
              unit = ?,
              purchase_price = ?,
              selling_price = ?,
              mrp = ?,
              gst_rate = ?,
              reorder_level = ?,
              expiry_date = ?,
              is_active = 1
            WHERE id = ?
          `, [
            name, barcode, categoryId, brand, unit,
            pp, sp, mrp, gst, reorder, expiry,
            existing.id
          ]);

          updated++;
        } else {
          const q = Math.round(quantity * 1000) / 1000;
          const rl = Math.round(reorder * 1000) / 1000;

          const [result] = await conn.execute(`
            INSERT INTO products (
              sku, name, barcode, category_id, brand,
              unit, purchase_price, selling_price, mrp,
              gst_rate, quantity, reorder_level, expiry_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            sku, name, barcode, categoryId, brand,
            unit, pp, sp, mrp, gst, q, rl, expiry
          ]);

          if (q > 0) {
            await conn.execute(`
              INSERT INTO stock_movements (
                product_id, type, quantity,
                balance_after, note, created_by
              )
              VALUES (?, 'stock_in', ?, ?, 'Excel import', ?)
            `, [
              result.insertId,
              q,
              q,
              req.user.id
            ]);
          }

          added++;
        }

        await conn.execute('RELEASE SAVEPOINT import_row');

      } catch (e) {
        await conn.execute('ROLLBACK TO SAVEPOINT import_row');
        await conn.execute('RELEASE SAVEPOINT import_row');

        const message = e.code === 'ER_DUP_ENTRY'
          ? 'Duplicate SKU or barcode'
          : e.message;

        errors.push(`Row ${n}: ${message}`);
      }
    }

    await conn.commit();

  } catch (e) {
    await conn.rollback();
    throw e;

  } finally {
    conn.release();
  }

  audit(
    req,
    'import_products',
    'product',
    null,
    { added, updated, errors: errors.length }
  );

  res.json({
    success: true,
    added,
    updated,
    errorCount: errors.length,
    errors
  });
});
