const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

const MAGNIFIC_URL = 'https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro';

app.post('/generate', upload.single('foto1'), async (req, res) => {
    try {
        const { promptUtama, ratio, quality, apiKey } = req.body;
        const foto1 = req.file;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "API Key belum diisi!" });
        if (!foto1) return res.status(400).json({ status: "Error", pesan: "Foto belum diunggah." });

        const form = new FormData();
        form.append('key', '6d207e02198a847aa98d0a2a901485a5');
        form.append('action', 'upload');
        form.append('source', foto1.buffer.toString('base64'));
        form.append('format', 'json');

        const uploadRes = await axios.post('https://freeimage.host/api/1/upload', form, { headers: form.getHeaders() });
        const publicImageUrl = uploadRes.data.image.url;

        const payload = {
            prompt: promptUtama,
            reference_images: [{ image: publicImageUrl, text: "Reference style", mime_type: foto1.mimetype }],
            aspect_ratio: ratio || "1:1",
            resolution: quality || "2K"
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': API_KEY }
        });

        const data = response.data.data || response.data;
        res.json({ status: "PENDING", data: { task1: data.task_id || data.id } });

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: errorMsg });
    }
});

app.get('/status', async (req, res) => {
    try {
        // PERBAIKAN: Menangkap API Key untuk cek status
        const { taskId, apiKey } = req.query;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY; 
        
        const response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        const data = response.data.data || response.data;
        
        res.json({ status: data.status, image_url: data.generated?.[0]?.image || data.image_url });
    } catch (error) { 
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: errorMsg }); 
    }
});

app.listen(process.env.PORT || 3000, '0.0.0.0');
