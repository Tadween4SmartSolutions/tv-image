const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for bulk uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        // Prevent collisions: timestamp + sanitized original name
        const safeName = `${Date.now()}-${Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^a-z0-9.\-_]/gi, '_')}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { 
        fileSize: 100 * 1024 * 1024, // 100MB per file
        files: 50                     // Max 50 files per bulk upload
    },
    fileFilter: (req, file, cb) => {
        const allowed = /\.(jpe?g|png|gif|webp|svg)$/i;
        if (allowed.test(path.extname(file.originalname))) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, GIF, WEBP, SVG allowed'));
        }
    }
});

// Middleware for larger request bodies (bulk uploads)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Serve static files & uploads
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

// 📤 Bulk upload endpoint
app.post('/upload', upload.array('images'), (req, res) => {
    if (!req.files?.length) {
        return res.status(400).json({ error: 'No valid image files uploaded' });
    }
    
    const uploaded = req.files.map(f => ({
        originalName: f.originalname,
        savedName: f.filename,
        size: f.size,
        mimetype: f.mimetype
    }));
    
    console.log(`✅ Uploaded ${uploaded.length} file(s):`, uploaded.map(f => f.originalName));
    res.json({ 
        success: true, 
        count: uploaded.length,
        files: uploaded 
    });
});

// 📥 List all images endpoint
app.get('/api/images', (req, res) => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) {
            console.error('❌ Failed to read uploads folder:', err);
            return res.status(500).json({ error: 'Failed to read images folder' });
        }
        
        const images = files
            .filter(f => /\.(jpe?g|png|gif|webp|svg)$/i.test(f))
            .map(f => {
                const stats = fs.statSync(path.join(UPLOAD_DIR, f));
                // Extract original name by removing timestamp prefix
                const originalName = f.replace(/^\d+-/, '').replace(/[^a-z0-9.\-_]/gi, '_');
                return {
                    name: f,                    // Actual filename on disk
                    originalName: originalName, // Display name
                    size: stats.size,
                    type: `image/${path.extname(f).slice(1)}`,
                    date: stats.birthtime.toISOString(),
                    url: `/uploads/${encodeURIComponent(f)}`
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first
        
        res.json(images);
    });
});

// 🗑️ Delete single image endpoint
app.delete('/api/images/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    
    // Security: prevent path traversal
    if (path.dirname(filePath) !== UPLOAD_DIR) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error('❌ Delete failed:', err);
            return res.status(404).json({ error: 'File not found' });
        }
        console.log(`🗑️ Deleted: ${filename}`);
        res.json({ success: true, deleted: filename });
    });
});

// 🗑️ Delete all images endpoint (optional - use with caution)
app.delete('/api/images', (req, res) => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to list files' });
        
        const imageFiles = files.filter(f => /\.(jpe?g|png|gif|webp|svg)$/i.test(f));
        if (imageFiles.length === 0) return res.json({ success: true, deleted: 0 });
        
        let deleted = 0;
        imageFiles.forEach(file => {
            fs.unlink(path.join(UPLOAD_DIR, file), () => {
                deleted++;
                if (deleted === imageFiles.length) {
                    console.log(`🗑️ Cleared ${deleted} images`);
                    res.json({ success: true, deleted });
                }
            });
        });
    });
});

// Health check endpoint for Sliplane
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Start server - bind to 0.0.0.0 for container/cloud access
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📺 TV Image Uploader running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${UPLOAD_DIR}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});