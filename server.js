const express = require('express'); 
const multer = require('multer'); 
const cors = require('cors'); 
const fs = require('fs'); 
const path = require('path'); 
const app = express(); 
const port = 5000; 

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

app.listen(port, () => { 
    console.log(`Server running at http://localhost:${port}`); 
});