const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
exports.stats = asyncHandler(async (req, res) => {
  const q = async (sql) => (await db.query(sql))[0];
  const [[today]] = await db.query("SELECT COALESCE(SUM(grand_total),0) v FROM sales WHERE status='completed' AND DATE(created_at)=CURDATE()");
  const [[rev]] = await db.query("SELECT COALESCE(SUM(grand_total),0) v, COALESCE(SUM(gst_amount),0) gst FROM sales WHERE status='completed'");
  const [[cogs]] = await db.query("SELECT COALESCE(SUM(si.quantity*si.purchase_price),0) v FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='completed'");
  const [[pur]] = await db.query("SELECT COALESCE(SUM(total),0) v FROM purchases WHERE status='confirmed'");
  const [[exp]] = await db.query('SELECT COALESCE(SUM(amount),0) v FROM expenses');
  const [[cnt]] = await db.query('SELECT (SELECT COUNT(*) FROM products WHERE is_active=1) products, (SELECT COUNT(*) FROM customers) customers, (SELECT COUNT(*) FROM products WHERE is_active=1 AND quantity<=reorder_level) lowStock, (SELECT COUNT(*) FROM products WHERE is_active=1 AND expiry_date<CURDATE()) expired');
  const daily = await q("SELECT DATE(created_at) d, SUM(grand_total) total FROM sales WHERE status='completed' AND created_at>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) GROUP BY d ORDER BY d");
  const weekly = await q("SELECT YEARWEEK(created_at,1) w, MIN(DATE(created_at)) start, SUM(grand_total) total FROM sales WHERE status='completed' AND created_at>=DATE_SUB(CURDATE(),INTERVAL 12 WEEK) GROUP BY w ORDER BY w");
  const monthly = await q("SELECT DATE_FORMAT(created_at,'%Y-%m') m, SUM(grand_total) total FROM sales WHERE status='completed' AND created_at>=DATE_SUB(CURDATE(),INTERVAL 12 MONTH) GROUP BY m ORDER BY m");
  const top = await q("SELECT p.name, SUM(si.quantity) qty, SUM(si.line_total) revenue FROM sale_items si JOIN products p ON p.id=si.product_id JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' GROUP BY p.id ORDER BY qty DESC LIMIT 5");
  res.json({ success: true, data: {
    todaySales: today.v, totalRevenue: rev.v, totalPurchases: pur.v, totalExpenses: exp.v,
    estimatedProfit: Math.round((rev.v - rev.gst - cogs.v - exp.v) * 100) / 100,
    ...cnt, charts: { daily, weekly, monthly, topProducts: top } } });
});
