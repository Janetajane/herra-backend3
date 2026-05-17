const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data'); // Wajib dipanggil lagi untuk FreeImage

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

const MAGNIFIC_URL = 'https://api.magnific.com/v1/ai/gemini-2-5-flash-image-preview';

// FUNGSI KURIR FREEIMAGE KITA KEMBALIKAN
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
        const { promptUtama, apiKey } = req.body;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "API Key belum diisi!" });
        if (!req.files || !req.files['foto1']) return res.status(400).json({ status: "Error", pesan: "Foto utama wajib diunggah." });

        const referenceImages = [];

        // MENGGUNAKAN LINK PENDEK AGAR TIDAK DIBLOKIR SATPAM MAGNIFIC
        if (req.files['foto1']) {
            const url = await uploadKeFreeImage(req.files['foto1'][0].buffer);
            referenceImages.push(url);
        }
        if (req.files['foto2']) {
            const url = await uploadKeFreeImage(req.files['foto2'][0].buffer);
            referenceImages.push(url);
        }
        if (req.files['foto3']) {
            const url = await uploadKeFreeImage(req.files['foto3'][0].buffer);
            referenceImages.push(url);
        }

        const payload = {
            prompt: promptUtama,
            reference_images: referenceImages,
            webhook_url: "https://google.com" 
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': API_KEY }
        });

        let responseData = response.data.data || response.data;
        if (Array.isArray(responseData)) responseData = responseData[0];

        res.json({ status: "PENDING", data: { task1: responseData.task_id || responseData.id } });

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
            response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        } catch(err) {
            response = await axios.get(`https://api.magnific.com/v1/ai/tasks/${taskId}`, { headers: { 'x-magnific-api-key': API_KEY } });
        }

        let data = response.data.data || response.data;
        if (Array.isArray(data)) data = data[0];

        let statusData = data.status || data.state;
        if (!statusData) statusData = "RAW: " + JSON.stringify(response.data).substring(0, 50);
        
        let imageUrl = null;
        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.generated && data.generated.length > 0) {
                imageUrl = data.generated[0].image || data.generated[0].url || data.generated[0].base64 || data.generated[0];
            } else {
                imageUrl = data.image_url || data.url || data.output || data.result || data.image || data.base64;
            }

            if (imageUrl && typeof imageUrl === 'string' && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
                imageUrl = `data:image/jpeg;base64,${imageUrl}`;
            }
        }

        res.json({ status: statusData, image_url: imageUrl, raw_data: data });
    } catch (error) { 
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) }); 
    }
});

app.listen(process.env.PORT || 3000, '0.0.0.0');
