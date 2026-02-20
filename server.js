const express = require('express'); 
const multer = require('multer'); 
const cors = require('cors'); 
const fs = require('fs'); 
const path = require('path'); 
const app = express(); 
const port = 5000; 

app.use(cors()); // อนุญาตให้ Frontend เรียกใช้งาน
app.use(express.static('uploads')); // ให้เข้าถึงไฟล์ที่อัปโหลด

// ตรวจสอบว่ามีโฟลเดอร์ uploads หรือไม่ ถ้าไม่มีให้สร้างใหม่
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// ตั้งค่าที่เก็บไฟล์อัปโหลด 
const storage = multer.diskStorage({ 
    destination: 'uploads/', 
    filename: (req, file, cb) => { 
        cb(null, file.originalname); 
    } 
}); 
const upload = multer({ storage }); 

// 1. หน้าแรก: ให้ส่งไฟล์ index.html ออกไปเมื่อเข้า http://localhost:5000
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. อัปโหลดไฟล์จาก Client -> Server
app.post('/upload', upload.single('file'), (req, res) => { 
    res.json({ message: 'File uploaded successfully', filename: req.file.filename }); 
}); 

// 3. แสดงรายการไฟล์ที่มีในเซิร์ฟเวอร์
app.get('/files', (req, res) => { 
    fs.readdir('uploads', (err, files) => { 
        if (err) return res.status(500).json({ error: 'Unable to list files' }); 
        res.json(files); 
    }); 
}); 

// 4. ให้ Client ดาวน์โหลดไฟล์จาก Server
app.get('/download/:filename', (req, res) => { 
    const filePath = path.join(__dirname, 'uploads', req.params.filename); 
    res.download(filePath); 
}); 

// 5. ลบไฟล์จาก Server (เพิ่มระบบยืนยันในฝั่ง Client)
app.delete('/delete/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: 'ลบไฟล์ไม่ได้' });
        res.json({ message: 'ลบไฟล์สำเร็จแล้ว' });
    });
});

// เริ่มเซิร์ฟเวอร์ 
app.listen(port, () => { 
    console.log(`Server running at http://localhost:${port}`); 
});
app.delete('/delete/:filename', (req, res) => {
    // decode ชื่อไฟล์เพื่อให้ Node.js หาไฟล์ภาษาไทยเจอในโฟลเดอร์
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', filename);

    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) return res.status(500).json({ error: 'ลบไฟล์ไม่ได้' });
            res.json({ message: 'ลบไฟล์สำเร็จแล้ว' });
        });
    } else {
        res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการลบในเซิร์ฟเวอร์' });
    }
});