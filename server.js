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

// 🔐 ระบบฐานข้อมูลจำลอง (อ่าน/เขียน ลงไฟล์ users.json)
const usersFile = path.join(__dirname, 'users.json');
let usersDB = {};

// ถ้ายังไม่มีไฟล์ users.json ให้สร้างขึ้นมาใหม่พร้อมไอดีเริ่มต้น
if (fs.existsSync(usersFile)) {
    usersDB = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
} else {
    usersDB = { 'user1': 'pass1', 'user2': 'pass2', 'admin': 'admin123' };
    fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
}

// ฟังก์ชันบันทึกข้อมูล User ลงไฟล์
function saveUsers() {
    fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}
const myIP = getLocalIP();

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// 🛠️ ฟังก์ชันไม้ตาย: พยายามลบไฟล์ซ้ำๆ จนกว่า Windows จะยอมปลดล็อค
const deleteFileWithRetry = (filePath, retries = 5) => {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) {
                    // ถ้าไฟล์ยังติดล็อค (EBUSY/EPERM) และยังเหลือโควต้าให้ลองใหม่
                    if ((err.code === 'EBUSY' || err.code === 'EPERM') && retries > 0) {
                        console.log(`⏳ ไฟล์ยังถูกล็อคอยู่... จะพยายามลบใหม่ (เหลืออีก ${retries} ครั้ง)`);
                        deleteFileWithRetry(filePath, retries - 1);
                    } else {
                        console.log(`⚠️ ยอมแพ้ ลบไฟล์ขยะไม่สำเร็จ: ${err.message}`);
                    }
                } else {
                    console.log(`🗑️ ลบไฟล์ขยะสำเร็จเรียบร้อย!`);
                }
            });
        }
    }, 1000); // หน่วงเวลา 1 วินาทีต่อการลอง 1 ครั้ง
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); 
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname); 
        const baseName = path.basename(file.originalname, ext); 
        const username = req.body.username || 'unknown'; 
        
        const newFilename = `${username}-${baseName}-${Date.now()}${ext}`;
        cb(null, newFilename);

        // ✅ ดักจับการยกเลิกที่นี่ที่เดียว
        req.on('aborted', () => {
            const fullPath = path.join(uploadDir, newFilename); 
            console.log(`🚨 ตรวจพบการยกเลิกอัปโหลด! กำลังเริ่มกระบวนการทำลายไฟล์: ${newFilename}`);
            deleteFileWithRetry(fullPath);
        });
    },
});

const upload = multer({ storage }); 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// 🎯 API: Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (usersDB[username] && usersDB[username] === password) {
        res.json({ message: 'Login successful', username: username });
    } else {
        res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง (หรือบัญชีนี้ถูกแบน)' });
    }
});

// 🎯 API: ดึงรายชื่อ User ทั้งหมด (เฉพาะ Admin)
app.get('/users', (req, res) => {
    if (req.query.user !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const userList = Object.keys(usersDB).filter(u => u !== 'admin');
    res.json(userList);
});

// 🎯 API: แบน/ลบผู้ใช้ และลบไฟล์ทั้งหมด (เฉพาะ Admin)
app.delete('/users/:username', async (req, res) => {
    if (req.query.user !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const targetUser = req.params.username;
    if (targetUser === 'admin') return res.status(400).json({ error: 'ไม่สามารถลบ Admin ได้' });
    if (!usersDB[targetUser]) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้ในระบบ' });

    delete usersDB[targetUser];
    saveUsers();

    try {
        const files = fs.readdirSync(uploadDir);
        const userFiles = files.filter(f => f.startsWith(`${targetUser}-`));
        await Promise.all(userFiles.map(f => fs.promises.unlink(path.join(uploadDir, f))));
        res.json({ message: `แบนผู้ใช้ ${targetUser} และลบไฟล์ทั้งหมดเรียบร้อยแล้ว` });
    } catch (err) {
        res.status(500).json({ error: 'แบนผู้ใช้สำเร็จ แต่มีปัญหาในการลบไฟล์บางส่วน' });
    }
});

// 🎯 API: ลงทะเบียนผู้ใช้ใหม่
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (usersDB[username]) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    usersDB[username] = password;
    saveUsers();
    res.json({ message: 'User registered successfully' });
});

// 🎯 API: อัปโหลด (เขียนใหม่ให้คลีน ไม่ซ้ำซ้อน)
app.post('/upload', upload.single('file'), (req, res) => { 
    // ถ้าลูกค้ากดยกเลิกไประหว่างทาง ให้หยุดทำงานทันที
    if (req.readableAborted || req.aborted) return; 

    // ป้องกัน Server พัง กรณีไฟล์โหลดไม่เข้า
    if (!req.file) {
        return res.status(400).json({ error: 'ไม่พบไฟล์ หรือการอัปโหลดถูกยกเลิก' });
    }

    // กรณีโหลดเสร็จสมบูรณ์ร้อยเปอร์เซ็นต์
    res.json({ message: 'File uploaded successfully', filename: req.file.filename }); 
});

// 🎯 API: ดึงรายชื่อไฟล์
app.get('/files', (req, res) => { 
    const currentUser = req.query.user; 
    fs.readdir(uploadDir, (err, files) => { 
        if (err) return res.status(500).json({ error: 'Unable to list files' }); 
        let displayFiles = files;
        if (currentUser !== 'admin') {
            displayFiles = files.filter(file => file.startsWith(`${currentUser}-`));
        }
        res.json(displayFiles); 
    }); 
}); 

// 🎯 API: ดาวน์โหลดและลบไฟล์รายตัว
app.get('/download/:filename', (req, res) => { 
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(uploadDir, safeFilename); 
    if (fs.existsSync(filePath)) res.download(filePath); 
    else res.status(404).json({ error: 'ไม่พบไฟล์' });
}); 

app.delete('/delete/:filename', (req, res) => {
    const currentUser = req.query.user;
    const safeFilename = path.basename(decodeURIComponent(req.params.filename));
    const filePath = path.join(uploadDir, safeFilename);

    if (fs.existsSync(filePath)) {
        if (currentUser !== 'admin' && !safeFilename.startsWith(`${currentUser}-`)) {
            return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ลบไฟล์ของผู้ใช้อื่น' });
        }
        fs.unlink(filePath, (err) => {
            if (err) return res.status(500).json({ error: 'ลบไฟล์ไม่ได้' });
            res.json({ message: 'ลบไฟล์สำเร็จ' });
        });
    } else {
        res.status(404).json({ error: 'ไม่พบไฟล์' });
    }
});

app.listen(PORT, '0.0.0.0', () => { 
    console.log(`\n🚀 เริ่มต้นระบบ Cloud Drive Lite สำเร็จ!`); 
    console.log(`💻 Local:   http://localhost:${PORT}`); 
    console.log(`🌐 Network: http://${myIP}:${PORT}`); 
});