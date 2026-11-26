const ExcelJS = require('exceljs'), PDFDocument = require('pdfkit');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/helpers');
const S = "s.status='completed'";
const REPORTS = {
  sales: (f, t, q) => {
    const g = { daily: 'DATE(s.created_at)', weekly: "DATE_FORMAT(s.created_at,'%x-W%v')", monthly: "DATE_FORMAT(s.created_at,'%Y-%m')", annual: 'YEAR(s.created_at)' }[q.period || 'daily'];
    if (!g) throw new AppError('period must be daily, weekly, monthly or annual');
    return { title: `${q.period || 'daily'} sales`, cols: ['period', 'bills', 'subtotal', 'discount', 'gst', 'total'],
      sql: `SELECT ${g} period, COUNT(*) bills, SUM(subtotal) subtotal, SUM(discount_amount) discount, SUM(gst_amount) gst, SUM(grand_total) total FROM sales s WHERE ${S} AND DATE(s.created_at) BETWEEN ? AND ? GROUP BY period ORDER BY period`, v: [f, t] };
  },
  'profit-loss': (f, t) => ({ title: 'Profit and loss', cols: ['item', 'amount'], v: [f, t, f, t, f, t, f, t],
    sql: `SELECT 'Revenue (excl. GST)' item, COALESCE(SUM(grand_total-gst_amount),0) amount FROM sales s WHERE ${S} AND DATE(created_at) BETWEEN ? AND ?
      UNION ALL SELECT 'Cost of goods sold', COALESCE(SUM(si.quantity*si.purchase_price),0) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${S} AND DATE(s.created_at) BETWEEN ? AND ?
      UNION ALL SELECT 'Expenses', COALESCE(SUM(amount),0) FROM expenses WHERE expense_date BETWEEN ? AND ?
      UNION ALL SELECT 'Purchases (confirmed)', COALESCE(SUM(total),0) FROM purchases WHERE status='confirmed' AND purchase_date BETWEEN ? AND ?`,
    post: r => { const [rev, cogs, exp] = r.map(x => Number(x.amount)); r.push({ item: 'Net profit (Revenue - COGS - Expenses)', amount: Math.round((rev - cogs - exp) * 100) / 100 }); return r; } }),
  'product-sales': (f, t) => ({ title: 'Product-wise sales', cols: ['product', 'quantity', 'revenue', 'profit'], v: [f, t],
    sql: `SELECT p.name product, SUM(si.quantity) quantity, SUM(si.line_total) revenue, SUM(si.line_total-si.gst_amount-si.quantity*si.purchase_price) profit FROM sale_items si JOIN products p ON p.id=si.product_id JOIN sales s ON s.id=si.sale_id WHERE ${S} AND DATE(s.created_at) BETWEEN ? AND ? GROUP BY p.id ORDER BY revenue DESC` }),
  'category-sales': (f, t) => ({ title: 'Category-wise sales', cols: ['category', 'quantity', 'revenue'], v: [f, t],
    sql: `SELECT c.name category, SUM(si.quantity) quantity, SUM(si.line_total) revenue FROM sale_items si JOIN products p ON p.id=si.product_id JOIN categories c ON c.id=p.category_id JOIN sales s ON s.id=si.sale_id WHERE ${S} AND DATE(s.created_at) BETWEEN ? AND ? GROUP BY c.id ORDER BY revenue DESC` }),
  gst: (f, t) => ({ title: 'GST report', cols: ['type', 'gst_rate', 'taxable_value', 'gst_amount'], v: [f, t, f, t],
    sql: `SELECT 'Output (sales)' type, si.gst_rate, SUM(si.line_total-si.gst_amount) taxable_value, SUM(si.gst_amount) gst_amount FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${S} AND DATE(s.created_at) BETWEEN ? AND ? GROUP BY si.gst_rate
      UNION ALL SELECT 'Input (purchases)', pi.gst_rate, SUM(pi.line_total-pi.gst_amount), SUM(pi.gst_amount) FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id WHERE p.status='confirmed' AND p.purchase_date BETWEEN ? AND ? GROUP BY pi.gst_rate` }),
  purchases: (f, t) => ({ title: 'Purchase report', cols: ['purchase_no', 'supplier', 'date', 'total', 'paid', 'payment_status'], v: [f, t],
    sql: `SELECT p.purchase_no, s.name supplier, p.purchase_date date, p.total, p.paid_amount paid, p.payment_status FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.status='confirmed' AND p.purchase_date BETWEEN ? AND ? ORDER BY p.purchase_date` }),
  inventory: () => ({ title: 'Inventory report', cols: ['product', 'category', 'quantity', 'unit', 'cost_value', 'retail_value', 'expiry_date'], v: [],
    sql: `SELECT p.name product, c.name category, p.quantity, p.unit, ROUND(p.quantity*p.purchase_price,2) cost_value, ROUND(p.quantity*p.selling_price,2) retail_value, p.expiry_date FROM products p JOIN categories c ON c.id=p.category_id WHERE p.is_active=1 ORDER BY p.name` }),
  expenses: (f, t) => ({ title: 'Expense report', cols: ['category', 'description', 'amount', 'expense_date'], v: [f, t],
    sql: `SELECT category, description, amount, expense_date FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date` })
};

exports.run = asyncHandler(async (req, res) => {
  const def = REPORTS[req.params.type];
  if (!def) throw new AppError('Unknown report type', 404);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const r = def(from, to, req.query);
  let [rows] = await db.query(r.sql, r.v);
  if (r.post) rows = r.post(rows);
  const title = `${r.title} (${from} to ${to})`, fmt = req.query.format;
  if (fmt === 'xlsx') {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(r.title.slice(0, 30));
    ws.columns = r.cols.map(c => ({ header: c.replace(/_/g, ' ').toUpperCase(), key: c, width: 22 }));
    ws.getRow(1).font = { bold: true }; rows.forEach(x => ws.addRow(x));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.xlsx"`);
    return wb.xlsx.write(res).then(() => res.end());
  }
  if (fmt === 'pdf') {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: r.cols.length > 5 ? 'landscape' : 'portrait' });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.pdf"`);
    doc.pipe(res); doc.fontSize(15).text(title).moveDown();
    const w = (doc.page.width - 72) / r.cols.length, row = (vals, bold) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      vals.forEach((v, i) => doc.text(String(v ?? '').slice(0, 28), 36 + i * w, y, { width: w - 4 }));
      doc.y = y + 16;
    };
    row(r.cols.map(c => c.replace(/_/g, ' ').toUpperCase()), true);
    rows.forEach(x => row(r.cols.map(c => x[c] instanceof Date ? x[c].toISOString().slice(0, 10) : x[c])));
    return doc.end();
  }
  res.json({ success: true, title, columns: r.cols, data: rows });
});
