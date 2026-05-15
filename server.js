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
        const { promptUtama, ratio, quality } = req.body;
        const foto1 = req.file;
        const API_KEY = process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "MAGNIFIC_API_KEY belum diset" });
        if (!foto1) return res.status(400).json({ status: "Error", pesan: "Foto wajib diunggah." });

        // ==========================================
        // TRIK VIP V2: Upload ke FreeImage.host (Anti-Blokir Server)
        // ==========================================
        const form = new FormData();
        // Kunci API publik resmi dari FreeImage
        form.append('key', '6d207e02198a847aa98d0a2a901485a5'); 
        form.append('action', 'upload');
        // Ubah foto jadi teks rahasia agar aman dikirim ke FreeImage
        form.append('source', foto1.buffer.toString('base64'));
        form.append('format', 'json');

        let publicImageUrl = '';
        try {
            const uploadRes = await axios.post('https://freeimage.host/api/1/upload', form, {
                headers: form.getHeaders()
            });
            // Tangkap Link Publiknya!
            publicImageUrl = uploadRes.data.image.url; 
        } catch (err) {
            return res.status(500).json({ status: "Error", pesan: "Gagal mendapat Link Publik: " + (err.response?.data?.error?.message || err.message) });
        }

        // ==========================================
        // FORMAT PAYLOAD (Kirim Link Asli ke Magnific)
        // ==========================================
        const payload = {
            prompt: promptUtama,
            webhook_url: "https://google.com",
            reference_images: [
                {
                    image: publicImageUrl, // URL ini sekarang pasti dijamin lolos!
                    text: "Reference style",
                    mime_type: foto1.mimetype
                }
            ],
            aspect_ratio: ratio || "1:1",
            resolution: quality || "2K"
        };

        const response = await axios.post(MAGNIFIC_URL, payload, {
            headers: { 
                'Content-Type': 'application/json',
                'x-magnific-api-key': API_KEY 
            }
        });

        const data = response.data.data || response.data;
        const taskId = data.task_id || data.id;
        
        res.json({ status: "PENDING", data: { task1: taskId } });

    } catch (error) {
        console.error("Error Magnific:", error.response?.data || error.message);
        const errorMsg = JSON.stringify(error.response?.data || error.message);
        res.status(500).json({ status: "Error", pesan: errorMsg });
    }
});

// ROUTE 2: CEK STATUS
app.get('/status', async (req, res) => {
    try {
        const { taskId } = req.query;
        const API_KEY = process.env.MAGNIFIC_API_KEY;

        const response = await axios.get(`${MAGNIFIC_URL}?task_id=${taskId}`, { 
            headers: { 'x-magnific-api-key': API_KEY } 
        });

        const data = response.data.data || response.data;
        const statusData = data.status;
        let imageUrl = null;

        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.generated && data.generated.length > 0) {
                imageUrl = data.generated[0].image || data.generated[0].url;
            } else if (data.image_url) {
                imageUrl = data.image_url;
            }
        }

        res.json({ status: statusData, image_url: imageUrl });

    } catch (error) {
        res.status(500).json({ status: "Error", pesan: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server nyala di port ${PORT}`));
