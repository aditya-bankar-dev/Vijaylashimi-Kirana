const router = require('express').Router();
const { authorize } = require('../middleware/auth');
const { asyncHandler } = require('../utils/helpers');
const pur = require('../controllers/purchaseController'), rep = require('../controllers/reportController');
const inv = require('../controllers/invoiceController'), set = require('../controllers/settingsController'), backup = require('../services/backup');
const pex = require('../controllers/productExcelController'), memUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const A = authorize('admin'), AM = authorize('admin', 'manager');

router.route('/purchases').get(AM, pur.list).post(AM, pur.create);
router.get('/purchases/:id', AM, pur.get); router.post('/purchases/:id/confirm', AM, pur.confirm); router.post('/purchases/:id/cancel', AM, pur.cancel);
router.post('/supplier-payments', AM, pur.pay); router.get('/suppliers/:id/history', AM, pur.supplierHistory);
router.get('/products/export', AM, pex.export); router.post('/products/import', AM, memUpload.single('file'), pex.import);
router.get('/reports/:type', AM, rep.run);
router.get('/payments/upi-qr', inv.upiQr); router.get('/sales/:id/pdf', inv.pdf);
router.route('/settings').get(set.get).put(A, set.update);
router.post('/backup/run', A, asyncHandler(async (req, res) => res.json({ success: true, file: await backup.runBackup() })));
module.exports = router;
