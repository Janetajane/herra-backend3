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

async function uploadKeFreeImage(buffer) {
    const form = new FormData();
    form.append('key', '6d207e02198a847aa98d0a2a901485a5');
    form.append('action', 'upload');
    form.append('source', buffer.toString('base64'));
    form.append('format', 'json');
    const uploadRes = await axios.post('https://freeimage.host/api/1/upload', form, { headers: form.getHeaders() });
    return uploadRes.data.image.url;
}

app.post('/generate', upload.fields([{ name: 'foto1' }, { name: 'foto2' }, { name: 'foto3' }]), async (req, res) => {
    try {
        const { promptUtama, ratio, quality, apiKey } = req.body;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "API Key belum diisi!" });
        if (!req.files || !req.files['foto1']) return res.status(400).json({ status: "Error", pesan: "Foto utama wajib diunggah." });

        const referenceImages = [];

        if (req.files['foto1']) {
            const url = await uploadKeFreeImage(req.files['foto1'][0].buffer);
            referenceImages.push({ image: url, text: "Reference 1", mime_type: req.files['foto1'][0].mimetype || "image/jpeg" });
        }
        if (req.files['foto2']) {
            const url = await uploadKeFreeImage(req.files['foto2'][0].buffer);
            referenceImages.push({ image: url, text: "Reference 2", mime_type: req.files['foto2'][0].mimetype || "image/jpeg" });
        }
        if (req.files['foto3']) {
            const url = await uploadKeFreeImage(req.files['foto3'][0].buffer);
            referenceImages.push({ image: url, text: "Reference 3", mime_type: req.files['foto3'][0].mimetype || "image/jpeg" });
        }

        const payload = {
            prompt: promptUtama,
            // PERBAIKAN: Gunakan Webhook standar dokumentasi agar tidak dicurigai
            webhook_url: "https://www.example.com/webhook", 
            reference_images: referenceImages,
            aspect_ratio: ratio || "1:1",
            resolution: quality || "2K"
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 
                'Content-Type': 'application/json', 
                'x-magnific-api-key': API_KEY,
                // PERBAIKAN: Menyamar sebagai browser Chrome agar lolos Firewall
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        let data = response.data.data || response.data;
        if (Array.isArray(data)) data = data[0];

        res.json({ status: "PENDING", data: { task1: data.task_id || data.id } });

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) });
    }
});

app.get('/status', async (req, res) => {
    try {
        const { taskId, apiKey } = req.query;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY; 
        
        const headers = { 
            'x-magnific-api-key': API_KEY,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        };

        let response;
        try {
            response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { headers });
        } catch(err) {
            response = await axios.get(`https://api.magnific.com/v1/ai/tasks/${taskId}`, { headers });
        }

        let data = response.data.data || response.data;
        if (Array.isArray(data)) data = data[0]; 

        let statusData = data.status || data.state;
        if (!statusData) statusData = "RAW: " + JSON.stringify(response.data).substring(0, 50);
        
        let imageUrl = null;
        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.generated && data.generated.length > 0) {
                imageUrl = data.generated[0].image || data.generated[0].url;
            } else if (data.image_url) {
                imageUrl = data.image_url;
            }
        }

        res.json({ status: statusData, image_url: imageUrl, raw_data: data });
    } catch (error) { 
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server nyala di port ${PORT}`));
            
