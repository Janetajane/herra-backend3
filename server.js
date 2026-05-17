const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

const MAGNIFIC_URL = 'https://api.magnific.com/v1/ai/gemini-2-5-flash-image-preview';

app.post('/generate', upload.fields([{ name: 'foto1' }, { name: 'foto2' }, { name: 'foto3' }]), async (req, res) => {
    try {
        const { promptUtama, apiKey } = req.body;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "API Key belum diisi!" });
        if (!req.files || !req.files['foto1']) return res.status(400).json({ status: "Error", pesan: "Foto utama wajib diunggah." });

        const referenceImages = [];

        if (req.files['foto1']) referenceImages.push(req.files['foto1'][0].buffer.toString('base64'));
        if (req.files['foto2']) referenceImages.push(req.files['foto2'][0].buffer.toString('base64'));
        if (req.files['foto3']) referenceImages.push(req.files['foto3'][0].buffer.toString('base64'));

        const payload = {
            prompt: promptUtama,
            reference_images: referenceImages,
            webhook_url: "https://google.com" 
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': API_KEY }
        });

        const data = response.data.data || response.data;
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
        
        let response;
        try {
            // Coba jalur utama Magnific
            response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        } catch(err) {
            // Jika jalur utama ditolak (405/404), coba jalur alternatif khusus Task
            response = await axios.get(`https://api.magnific.com/v1/ai/tasks/${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        }

        const data = response.data.data || response.data;
        let statusData = data.status || data.state;
        
        // ==========================================
        // ALAT PENYADAP AKTIF: Jika status disembunyikan Magnific, 
        // kita paksa tampilkan 50 huruf pertama dari jawaban aslinya!
        // ==========================================
        if (!statusData) {
            statusData = "RAW: " + JSON.stringify(response.data).substring(0, 50);
        }
        
        let imageUrl = null;
        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.generated && data.generated.length > 0) {
                imageUrl = data.generated[0].image || data.generated[0].url || data.generated[0];
                if (typeof imageUrl === 'string' && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
                    imageUrl = `data:image/jpeg;base64,${imageUrl}`;
                }
            } else if (data.image_url) {
                imageUrl = data.image_url;
            }
        }

        res.json({ status: statusData, image_url: imageUrl });
    } catch (error) { 
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) }); 
    }
});

app.listen(process.env.PORT || 3000, '0.0.0.0');
