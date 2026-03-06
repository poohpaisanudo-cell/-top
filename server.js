const express = require('express'); 
const multer = require('multer'); 
const cors = require('cors'); 
const fs = require('fs'); 
const path = require('path');
const os = require('os'); 
const app = express(); 

const PORT = 5000; 

app.use(cors()); 
app.use(express.json()); 

// 🔐 ฐานข้อมูลจำลองสำหรับระบบ Login (Username : Password)
const usersDB = {
    'user1': 'pass1',
    'user2': 'pass2',
    'admin': 'admin123'
};

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}
const myIP = getLocalIP();

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({ 
    destination: 'uploads/', 
    filename: (req, file, cb) => { 
        const user = req.body.username || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, `${user}-${uniqueSuffix}-${originalName}`); 
    } 
}); 
const upload = multer({ storage }); 

// 🎯 API สำหรับ Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // ตรวจสอบว่ามี username นี้ และรหัสผ่านตรงกันหรือไม่
    if (usersDB[username] && usersDB[username] === password) {
        res.json({ message: 'Login successful', username: username });
    } else {
        res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/upload', upload.single('file'), (req, res) => { 
    res.json({ message: 'File uploaded successfully', filename: req.file.filename }); 
}); 

app.get('/files', (req, res) => { 
    const currentUser = req.query.user; 
    fs.readdir('uploads', (err, files) => { 
        if (err) return res.status(500).json({ error: 'Unable to list files' }); 
        let displayFiles = files;
        if (currentUser !== 'admin') {
            displayFiles = files.filter(file => file.startsWith(`${currentUser}-`));
        }
        res.json(displayFiles); 
    }); 
}); 

app.get('/download/:filename', (req, res) => { 
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', safeFilename); 
    if (fs.existsSync(filePath)) {
        res.download(filePath); 
    } else {
        res.status(404).json({ error: 'ไม่พบไฟล์' });
    }
}); 

app.delete('/delete/:filename', (req, res) => {
    const currentUser = req.query.user;
    const safeFilename = path.basename(decodeURIComponent(req.params.filename));
    const filePath = path.join(__dirname, 'uploads', safeFilename);

    if (fs.existsSync(filePath)) {
        if (currentUser !== 'admin' && !safeFilename.startsWith(`${currentUser}-`)) {
            return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ลบไฟล์ของผู้ใช้อื่น' });
        }
        fs.unlink(filePath, (err) => {
            if (err) return res.status(500).json({ error: 'ลบไฟล์ไม่ได้' });
            res.json({ message: 'ลบไฟล์สำเร็จแล้ว' });
        });
    } else {
        res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการลบ' });
    }
});

app.delete('/deleteUserFiles/:username', (req, res) => {
    const currentUser = req.query.user;
    const targetUser = req.params.username;

    if (currentUser !== 'admin') {
        return res.status(403).json({ error: 'Only admin can delete users' });
    }

    fs.readdir('uploads', (err, files) => {
        if (err) return res.status(500).json({ error: 'Unable to read directory' });

        const userFiles = files.filter(file => file.startsWith(`${targetUser}-`));
        if (userFiles.length === 0) {
            return res.json({ message: `ลบผู้ใช้ ${targetUser} สำเร็จ (ไม่พบไฟล์ที่เกี่ยวข้องในระบบ)`, deletedCount: 0 });
        }

        let deletedCount = 0;
        let errors = [];

        userFiles.forEach((file) => {
            const filePath = path.join(__dirname, 'uploads', file);
            fs.unlink(filePath, (err) => {
                if (err) errors.push(file);
                else deletedCount++;

                if (deletedCount + errors.length === userFiles.length) {
                    res.json({ 
                        message: `ลบผู้ใช้ ${targetUser} และไฟล์ที่เกี่ยวข้องสำเร็จแล้ว`, 
                        deletedCount: deletedCount,
                        failedCount: errors.length
                    });
                }
            });
        });
    });
});

app.listen(PORT, '0.0.0.0', () => { 
    console.log(`\n🚀 เริ่มต้นระบบ Cloud Drive Lite สำเร็จ!`); 
    console.log(`--------------------------------------------------`);
    console.log(`💻 Local:   http://localhost:${PORT}`); 
    console.log(`🌐 Network: http://${myIP}:${PORT}`); 
    console.log(`--------------------------------------------------\n`);
    console.log(`[รหัสผ่านสำหรับทดสอบ] user1:pass1 | user2:pass2 | admin:admin123`);
});