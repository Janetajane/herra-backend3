const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const upload = multer();

// Izinkan web HP Anda mengakses server ini
app.use(cors());
app.use(express.json());

const MAGNIFIC_URL = 'https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro';

// ROUTE 1: MENGIRIM FOTO & PROMPT KE MAGNIFIC
app.post('/generate', upload.single('foto1'), async (req, res) => {
    try {
        const { promptUtama } = req.body;
        const foto1 = req.file;
        const API_KEY = process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "MAGNIFIC_API_KEY belum dipasang di Railway!" });
        if (!foto1) return res.status(400).json({ status: "Error", pesan: "Foto wajib diunggah." });

        const payload = new FormData();
        // Membungkus foto dari memori (RAM) langsung ke form
        payload.append('image', foto1.buffer, { filename: 'image.jpg', contentType: foto1.mimetype });
        payload.append('prompt', promptUtama);

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 
                ...payload.getHeaders(),
                'x-magnific-api-key': API_KEY 
            }
        });

        // Tangkap ID Antrean Magnific
        const taskId = response.data.task_id || (response.data.data && response.data.data[0].task_id);
        res.json({ status: "PENDING", data: { task1: taskId } });

    } catch (error) {
        console.error(error);
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: "Ditolak Magnific: " + JSON.stringify(errorMsg) });
    }
});

// ROUTE 2: CEK STATUS ANTREAN
app.get('/status', async (req, res) => {
    try {
        const { taskId } = req.query;
        const API_KEY = process.env.MAGNIFIC_API_KEY;

        let response;
        try {
            response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        } catch (err) {
            // Jika pakai slash (berbeda format)
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
