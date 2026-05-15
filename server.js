const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

// PERBAIKAN 1: Pindah ke pintu yang BENAR untuk menerima Foto + Teks
const MAGNIFIC_URL = 'https://api.magnific.com/v1/ai/image-upscaler';

app.post('/generate', upload.single('foto1'), async (req, res) => {
    try {
        const { promptUtama } = req.body;
        const foto1 = req.file;
        const API_KEY = process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "MAGNIFIC_API_KEY belum diset" });
        if (!foto1) return res.status(400).json({ status: "Error", pesan: "Foto wajib diunggah." });

        // Ubah foto jadi teks rahasia (Base64)
        const base64Image = foto1.buffer.toString('base64');
        const imageFormat = `data:${foto1.mimetype};base64,${base64Image}`;

        // PERBAIKAN 2: Format paket yang 100% diminta oleh Magnific Upscaler
        const payload = {
            image: imageFormat,
            prompt: promptUtama,
            creativity: 8, // Nilai 1-10. Angka 8 membebaskan AI merombak foto jam tangan jadi ada wanita modelnya
            scale_factor: "2x" // Parameter wajib untuk pintu ini
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 
                'Content-Type': 'application/json',
                'x-magnific-api-key': API_KEY 
            }
        });

        const data = response.data;
        const taskId = data.task_id || (data.data && data.data[0].task_id) || data.id;

        res.json({ status: "PENDING", data: { task1: taskId } });

    } catch (error) {
        console.error("Error dari Magnific:", error.response?.data || error.message);
        // Menampilkan pesan error asli dari Magnific agar kita tahu persis letak salahnya
        const errorMsg = JSON.stringify(error.response?.data?.detail || error.response?.data || error.message);
        res.status(500).json({ status: "Error", pesan: errorMsg });
    }
});

// ROUTE 2: CEK STATUS
app.get('/status', async (req, res) => {
    try {
        const { taskId } = req.query;
        const API_KEY = process.env.MAGNIFIC_API_KEY;

        let response;
        try {
            response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        } catch (err) {
            if (err.response && err.response.status === 404) {
                 response = await axios.get(`${MAGNIFIC_URL}/${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
            } else {
                 throw err;
            }
        }

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "Error", pesan: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server nyala di port ${PORT}`));
