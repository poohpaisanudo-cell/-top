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

const usersFile = path.join(__dirname, 'users.json');

// 🔐 ระบบฐานข้อมูล (เพิ่ม Role)
if (!fs.existsSync(usersFile)) {
    const initialUsers = [
        { username: 'admin', password: 'admin123', status: 'active', role: 'admin' }, // แอดมิน
        { username: 'user1', password: 'pass1', status: 'active', role: 'user' },   // ยูสเซอร์ปกติ
        { username: 'user2', password: 'pass2', status: 'active', role: 'user' }
    ];
    fs.writeFileSync(usersFile, JSON.stringify(initialUsers, null, 4));
}

// Helper: อ่าน/เขียนข้อมูล User
const getUsers = () => JSON.parse(fs.readFileSync(usersFile, 'utf8'));
const saveUsers = (users) => fs.writeFileSync(usersFile, JSON.stringify(users, null, 4));

// 🛡️ ฟังก์ชันเช็คสิทธิ์ว่าเป็น Admin หรือไม่
const isAdmin = (username) => {
    if (!username) return false;
    const users = getUsers();
    const user = users.find(u => u.username === username);
    return user && user.role === 'admin';
};

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
    }, 1000); 
};

// ----------------- MULTER -----------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); 
    },
    filename: (req, file, cb) => {
        let ext = path.extname(file.originalname);
        let baseName = path.basename(file.originalname, ext);
        const username = req.body.username || 'unknown'; 
        
        let newFilename = `${username}-${baseName}-${Date.now()}${ext}`;
        cb(null, newFilename);

        req.on('aborted', () => {
            const fullPath = path.join(uploadDir, newFilename); 
            console.log(`🚨 ตรวจพบการยกเลิกอัปโหลด! กำลังเริ่มกระบวนการทำลายไฟล์: ${newFilename}`);
            deleteFileWithRetry(fullPath);
        });
    },
});

const upload = multer({ storage }); 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ================= API ROUTES =================

// 🎯 API: สมัครสมาชิก
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    let users = getUsers();
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username นี้มีผู้ใช้งานแล้ว' });
    }
    
    // ตั้งค่าเริ่มต้นให้คนสมัครใหม่เป็น user ธรรมดา
    users.push({ username, password, status: 'active', role: 'user' }); 
    saveUsers(users);
    res.json({ message: 'สมัครสมาชิกสำเร็จ' });
});

// 🎯 API: Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    let users = getUsers();
    
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }
    
    if (user.status === 'blocked') {
        return res.status(403).json({ error: '❌ บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อ Admin' });
    }
    
    // 🌟 ส่ง Role กลับไปให้หน้าเว็บด้วย
    res.json({ username: user.username, role: user.role });
});

// 🎯 API: ดึงรายชื่อ User ทั้งหมด (เฉพาะ Admin)
app.get('/users', (req, res) => {
    // 🌟 เปลี่ยนมาเช็คด้วยฟังก์ชัน isAdmin แทนการเช็คชื่อ
    if (!isAdmin(req.query.user)) return res.status(403).json({ error: 'Unauthorized' });
    
    let users = getUsers();
    const userList = users.filter(u => u.username !== req.query.user).map(u => ({
        username: u.username,
        status: u.status === 'blocked' ? 'blocked' : 'active',
        role: u.role
    }));
    
    res.json(userList);
});

// 🎯 API: เปลี่ยนสถานะ Block / Unblock (เฉพาะ Admin)
app.put('/users/:targetUser/toggle-block', (req, res) => {
    if (!isAdmin(req.query.user)) return res.status(403).json({ error: 'Unauthorized' });
    
    const targetUser = req.params.targetUser;
    if (targetUser === req.query.user) return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสถานะตัวเองได้' });

    let users = getUsers();
    const userIndex = users.findIndex(u => u.username === targetUser);
    if (userIndex === -1) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
    
    const currentStatus = users[userIndex].status;
    users[userIndex].status = currentStatus === 'blocked' ? 'active' : 'blocked';
    
    saveUsers(users);
    res.json({ message: `เปลี่ยนสถานะ ${targetUser} เป็น ${users[userIndex].status === 'blocked' ? 'ระงับสิทธิ์ 🔴' : 'ปกติ 🟢'} สำเร็จ!` });
});

// 🎯 API: แบนผู้ใช้ถาวร (เฉพาะ Admin)
app.delete('/users/:username', async (req, res) => {
    if (!isAdmin(req.query.user)) return res.status(403).json({ error: 'Unauthorized' });
    
    const targetUser = req.params.username;
    if (targetUser === req.query.user) return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });

    let users = getUsers();
    const initialLength = users.length;
    users = users.filter(u => u.username !== targetUser);

    if (users.length === initialLength) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้ในระบบ' });

    saveUsers(users);

    try {
        const files = fs.readdirSync(uploadDir);
        const userFiles = files.filter(f => f.startsWith(`${targetUser}-`));
        await Promise.all(userFiles.map(f => fs.promises.unlink(path.join(uploadDir, f))));
        res.json({ message: `แบนบัญชี ${targetUser} และลบไฟล์ทั้งหมดเรียบร้อยแล้ว` });
    } catch (err) {
        res.status(500).json({ error: 'แบนผู้ใช้สำเร็จ แต่มีปัญหาในการลบไฟล์บางส่วน' });
    }
});

// 🎯 API: อัปโหลด
app.post('/upload', upload.single('file'), (req, res) => { 
    if (req.readableAborted || req.aborted) return; 
    if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์ หรือการอัปโหลดถูกยกเลิก' });
    res.json({ message: 'File uploaded successfully', filename: req.file.filename }); 
});

// 🎯 API: ดึงรายชื่อไฟล์
app.get('/files', (req, res) => { 
    const currentUser = req.query.user; 
    fs.readdir(uploadDir, (err, files) => { 
        if (err) return res.status(500).json({ error: 'Unable to list files' }); 
        
        let displayFiles = files;
        // 🌟 ถ้าไม่ใช่ Admin จะเห็นแค่ไฟล์ตัวเอง
        if (!isAdmin(currentUser)) {
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
        // 🌟 ถ้าไม่ใช่ Admin จะลบไฟล์คนอื่นไม่ได้
        if (!isAdmin(currentUser) && !safeFilename.startsWith(`${currentUser}-`)) {
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