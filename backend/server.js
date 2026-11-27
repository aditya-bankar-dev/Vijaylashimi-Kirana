
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { notFound, errorHandler } = require('./middleware/error');

// 1. Check JWT_SECRET
if (!process.env.JWT_SECRET) {
    console.error('ERROR: JWT_SECRET is missing');
    process.exit(1);
}

// 2. Create uploads folder
const uploadPath = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

// 3. Initialize Express
const app = express();

// 4. Middleware
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors());

app.use(express.json({
    limit: '1mb'
}));

app.use(express.urlencoded({
    extended: true
}));

// 5. Static uploads
app.use('/uploads', express.static(uploadPath));

// 6. API Routes
app.use('/api', require('./routes'));

// 7. Frontend Static Files
const frontendPath = path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));

// 8. API Not Found
app.use('/api', notFound);

// 9. Error Handler
app.use(errorHandler);

// 10. Start Server
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Vijaylashimi Kirana is ready!');
});

// 11. Handle Server Errors
server.on('error', (error) => {
    console.error('Server Error:', error);
});

// 12. Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('Server shutting down...');

    server.close(() => {
        console.log('Server closed successfully');
        process.exit(0);
    });
});