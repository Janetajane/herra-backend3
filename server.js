const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

// PERUBAHAN: Pindah jalur ke Model Gemini 2.5 Flash
const MAGNIFIC_URL = 'https://api.magnific.com/v1/ai/gemini-2-5-flash-image-preview';

app.post('/generate', upload.fields([{ name: 'foto1' }, { name: 'foto2' }, { name: 'foto3' }]), async (req, res) => {
    try {
        // Catatan: Rasio & Resolusi tidak kita kirim karena model ini belum mendukung parameter tersebut di dokumentasi
        const { promptUtama, apiKey } = req.body;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "API Key belum diisi!" });
        if (!req.files || !req.files['foto1']) return res.status(400).json({ status: "Error", pesan: "Foto utama wajib diunggah." });

        const referenceImages = [];

        // KABAR BAIK: Model ini mendukung Base64 langsung! 
        // Kita buang FreeImage agar server 10x lipat lebih cepat dan anti-blokir!
        if (req.files['foto1']) referenceImages.push(req.files['foto1'][0].buffer.toString('base64'));
        if (req.files['foto2']) referenceImages.push(req.files['foto2'][0].buffer.toString('base64'));
        if (req.files['foto3']) referenceImages.push(req.files['foto3'][0].buffer.toString('base64'));

        // Format payload PERSIS seperti dokumentasi curl Abang
        const payload = {
            prompt: promptUtama,
            reference_images: referenceImages,
            webhook_url: "https://google.com" // Dummy URL
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': API_KEY }
        });

        const data = response.data.data || response.data;
        res.json({ status: "PENDING", data: { task1: data.task_id || data.id } });

    } catch (error) {
        console.error("Error Magnific:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) });
    }
});

app.get('/status', async (req, res) => {
    try {
        const { taskId, apiKey } = req.query;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY; 
        
        const response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        const data = response.data.data || response.data;
        const statusData = data.status;
        
        let imageUrl = null;
        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.generated && data.generated.length > 0) {
                // Menangkap hasil baik berupa URL maupun Base64 murni dari Gemini
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
