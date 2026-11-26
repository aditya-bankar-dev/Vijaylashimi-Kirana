const router = require('express').Router();
const multer = require('multer'), path = require('path');
const { authenticate, authorize } = require('../middleware/auth');
const crud = require('../controllers/crud');
const auth = require('../controllers/authController'), prod = require('../controllers/productController');
const sales = require('../controllers/salesController'), inv = require('../controllers/inventoryController'), dash = require('../controllers/dashboardController');
const upload = multer({
  storage: multer.diskStorage({ destination: path.join(__dirname, '../../uploads'), filename: (r, f, cb) => cb(null, Date.now() + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (r, f, cb) => cb(null, /\.(jpe?g|png|webp)$/i.test(f.originalname))
});
const A = authorize('admin'), AM = authorize('admin', 'manager');

router.post('/auth/login', auth.login);
router.use(authenticate);
router.get('/auth/me', auth.me);
router.route('/users').get(A, auth.listUsers).post(A, auth.createUser);
router.put('/users/:id', A, auth.updateUser);

router.get('/dashboard', AM, dash.stats);

router.get('/products', prod.list); router.get('/products/alerts', prod.alerts); router.get('/products/barcode/:code', prod.byBarcode);
router.post('/products', AM, upload.single('image'), prod.create);
router.put('/products/:id', AM, upload.single('image'), prod.update);
router.delete('/products/:id', AM, prod.remove);

router.route('/sales').get(sales.list).post(sales.create);
router.get('/sales/:id', sales.get);

router.post('/inventory/move', AM, inv.move); router.get('/inventory/movements', AM, inv.movements); router.get('/inventory/valuation', AM, inv.valuation);

const mount = (p, c, w = AM) => { router.get(p, c.list); router.get(p + '/:id', c.get); router.post(p, w, c.create); router.put(p + '/:id', w, c.update); router.delete(p + '/:id', AM, c.remove); };
mount('/categories', crud({ table: 'categories', fields: ['name', 'default_gst'], required: ['name'], search: ['name'], soft: true, order: 'name' }));
mount('/suppliers', crud({ table: 'suppliers', fields: ['name', 'contact_person', 'phone', 'email', 'address', 'gstin'], required: ['name', 'phone'], search: ['name', 'phone'], soft: true }));
mount('/customers', crud({ table: 'customers', fields: ['name', 'mobile', 'email', 'address', 'discount_percent'], required: ['name', 'mobile'], search: ['name', 'mobile'] }), authorize('admin', 'manager', 'cashier'));
mount('/expenses', crud({ table: 'expenses', fields: ['category', 'description', 'amount', 'expense_date', 'created_by'], required: ['category', 'amount', 'expense_date'], order: 'expense_date DESC' }));
router.use(require('./extra'));
module.exports = router;
