require('dotenv').config();
const express = require('express'), cors = require('cors'), helmet = require('helmet'), path = require('path'), fs = require('fs');
const { notFound, errorHandler } = require('./middleware/error');
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET missing in .env'); process.exit(1); }
fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
const app = express();
app.use(helmet({ contentSecurityPolicy: false }), cors(), express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api', require('./routes'));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api', notFound);
app.use(errorHandler);
require('./services/backup').schedule();
app.listen(process.env.PORT || 5000, () => console.log(`Server running on port ${process.env.PORT || 5000}`));
