const express = require('express'); 
const multer = require('multer'); 
const cors = require('cors'); 
const fs = require('fs'); 
const path = require('path'); 
const app = express(); 
const http = 5000; 

app.use(cors()); 
app.use(express.static('uploads')); 
app.use(express.json()); 

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({ 
    destination: 'uploads/', 
    filename: (req, file, cb) => { 
        const user = req.body.username || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${user}-${uniqueSuffix}-${file.originalname}`); 
    } 
}); 
const upload = multer({ storage }); 

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
    const filePath = path.join(__dirname, 'uploads', req.params.filename); 
    res.download(filePath); 
}); 

app.delete('/delete/:filename', (req, res) => {
    const currentUser = req.query.user;
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', filename);

    if (fs.existsSync(filePath)) {
        if (currentUser !== 'admin' && !filename.startsWith(`${currentUser}-`)) {
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

app.delete('/deleteUser/:username', (req, res) => {
    const currentUser = req.query.user;
    const targetUser = req.params.username;

    // 1. ตรวจสอบสิทธิ์ (เฉพาะ Admin เท่านั้นที่ลบ User อื่นได้)
    if (currentUser !== 'admin') {
        return res.status(403).json({ error: 'Only admin can delete users' });
    }

    // 💡 ข้อแนะนำ: หากในอนาคตคุณมีระบบ Database (เช่น MySQL, MongoDB) 
    // คุณควรเขียนคำสั่งลบข้อมูล User ออกจาก Database ที่บริเวณนี้
    // เช่น: db.query('DELETE FROM users WHERE username = ?', [targetUser]);

    // 2. ดำเนินการลบไฟล์ทั้งหมดของ User นี้ที่อยู่ในโฟลเดอร์ uploads
    fs.readdir('uploads', (err, files) => {
        if (err) return res.status(500).json({ error: 'Unable to read directory' });

        // กรองหาไฟล์ที่เป็นของ User นี้ (ต้องมี '-' ต่อท้ายเพื่อป้องกันการลบ user ที่ชื่อคล้ายกัน)
        const userFiles = files.filter(file => file.startsWith(`${targetUser}-`));
        
        // ถ้า User นี้ไม่มีไฟล์เลย ก็ถือว่าลบสำเร็จแล้ว (ถ้ามี DB คือลบจาก DB ไปแล้ว)
        if (userFiles.length === 0) {
            return res.json({ 
                message: `ลบผู้ใช้ ${targetUser} สำเร็จ (ไม่พบไฟล์ที่เกี่ยวข้องในระบบ)`, 
                deletedCount: 0 
            });
        }

        let deletedCount = 0;
        let errors = [];

        userFiles.forEach((file) => {
            const filePath = path.join(__dirname, 'uploads', file);
            
            fs.unlink(filePath, (err) => {
                if (err) {
                    errors.push(file);
                } else {
                    deletedCount++;
                }

                // รอจนกว่าจะวนลูปจัดการไฟล์ครบทุกตัว จึงส่ง Response กลับไป
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

app.listen(5000, () => { 
    console.log('Server is running on port 5000'); 
});