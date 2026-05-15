const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

// Endpoint resmi Magnific / Freepik untuk AI Image
const MAGNIFIC_URL = 'https://api.magnific.com/v1/ai/text-to-image';

app.post('/generate', upload.single('foto1'), async (req, res) => {
    try {
        const { promptUtama } = req.body;
        const foto1 = req.file;
        const API_KEY = process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "MAGNIFIC_API_KEY belum diset" });
        if (!foto1) return res.status(400).json({ status: "Error", pesan: "Foto wajib diunggah." });

        // PERBAIKAN: Ubah foto menjadi Base64 (Format teks rahasia yang diminta Magnific)
        const base64Image = foto1.buffer.toString('base64');
        const imageFormat = `data:${foto1.mimetype};base64,${base64Image}`;

        // PERBAIKAN: Bungkus payload menjadi JSON murni
        const payload = {
            prompt: promptUtama,
            image: imageFormat
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 
                'Content-Type': 'application/json',
                'x-magnific-api-key': API_KEY 
            }
        });

        // Tangkap respon dari Magnific
        const data = response.data;
        const taskId = data.task_id || (data.data && data.data[0].task_id);

        // Jika Magnific API langsung memberikan hasil gambar (tanpa antre)
        if (!taskId && data.data && data.data[0].url) {
            return res.json({ status: "COMPLETED", image_url: data.data[0].url });
        } else if (!taskId && data.data && data.data[0].base64) {
            return res.json({ status: "COMPLETED", image_url: `data:image/jpeg;base64,${data.data[0].base64}` });
        }

        res.json({ status: "PENDING", data: { task1: taskId || 'unknown' } });

    } catch (error) {
        console.error(error.response?.data || error.message);
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: errorMsg });
    }
});

// ROUTE 2: CEK STATUS (Jika masuk antrean)
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
