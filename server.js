const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const sharp = require('sharp'); 

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const RAILWAY_URL = 'https://herra-backend3-production.up.railway.app'; 
const databaseHasil = {};

/**
 * UTALITAS UTAMA: CONVERT TO BASE64
 * Mengubah buffer gambar mentah dari multipart/form-data HP menjadi string Base64 murni berformat JPEG steril.
 * Menghilangkan ketergantungan pada FreeImage host dan kebal terhadap blokir IP satpam luar.
 */
async function konversiKeBase64Steril(buffer) {
    return await sharp(buffer)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toBuffer()
        .then(buf => buf.toString('base64'));
}

// ==========================================
// PINTU UTAMA: GENERATE CONTENT MULTI-ROUTE
// ==========================================
app.post('/generate', upload.fields([{ name: 'foto1' }, { name: 'foto2' }, { name: 'foto3' }]), async (req, res) => {
    try {
        const { promptUtama, ratio, quality, apiKey, fitur } = req.body;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "API Key belum diisi!" });
        if (!req.files || !req.files['foto1']) return res.status(400).json({ status: "Error", pesan: "Berkas gambar utama wajib diunggah." });

        let TARGET_URL = '';
        let payload = {};

        if (fitur === 'upscale') {
            // ===================================================
            // LOKET 1: AI IMAGE UPSCALER (STRUKTUR BASE64 MURNI)
            // ===================================================
            TARGET_URL = 'https://api.magnific.com/v1/ai/image-upscaler';
            const base64Murni = await konversiKeBase64Steril(req.files['foto1'][0].buffer);

            payload = {
                image: base64Murni, 
                webhook_url: `${RAILWAY_URL}/webhook`,
                scale_factor: quality === '4K' ? "4x" : "2x", 
                optimized_for: "soft_portraits", 
                engine: "automatic" 
            };

        } else if (fitur === 'flux') {
            // ===================================================
            // LOKET 2: FLUX 2 PRO PREMIUM (STRUKTUR BASE64 INDEPENDENT)
            // ===================================================
            TARGET_URL = 'https://api.magnific.com/v1/ai/text-to-image/flux-2-pro';
            const base64Foto1 = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            
            payload = {
                prompt: promptUtama,
                prompt_upsampling: false,
                input_image: base64Foto1, 
                webhook_url: `${RAILWAY_URL}/webhook`
            };

            if (req.files['foto2']) {
                payload.input_image_2 = await konversiKeBase64Steril(req.files['foto2'][0].buffer);
            }
            if (req.files['foto3']) {
                payload.input_image_3 = await konversiKeBase64Steril(req.files['foto3'][0].buffer);
            }

            if (ratio === "9:16") {
                payload.width = 768;
                payload.height = 1440; 
            } else {
                payload.width = 1024;
                payload.height = 1024; 
            }

        } else if (fitur === 'ugc') {
            // =========================================================
            // LOKET 3: NANO BANANA PRO (UGC GANTI BAJU CEPAT BASE64 ARRAY)
            // =========================================================
            TARGET_URL = 'https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro';
            const base64Ugc1 = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            const referenceImages = [{ image: base64Ugc1, text: "Reference 1", mime_type: "image/jpeg" }];

            if (req.files['foto2']) {
                const base64Ugc2 = await konversiKeBase64Steril(req.files['foto2'][0].buffer);
                referenceImages.push({ image: base64Ugc2, text: "Reference 2", mime_type: "image/jpeg" });
            }
            if (req.files['foto3']) {
                const base64Ugc3 = await konversiKeBase64Steril(req.files['foto3'][0].buffer);
                referenceImages.push({ image: base64Ugc3, text: "Reference 3", mime_type: "image/jpeg" });
            }

            payload = { 
                prompt: promptUtama, 
                webhook_url: `${RAILWAY_URL}/webhook`, 
                reference_images: referenceImages, 
                aspect_ratio: ratio || "1:1", 
                resolution: quality || "2K" 
            };

        } else {
            // =========================================================
            // LOKET 4: GEMINI 2.5 FLASH IMAGE PREVIEW (BASE64 ARRAY STERIL) 🔥
            // =========================================================
            TARGET_URL = 'https://api.magnific.com/v1/ai/gemini-2-5-flash-image-preview';
            
            // Konversi seluruh berkas gambar langsung menjadi string Base64 steril tanpa perantara pihak ketiga
            const base64Gemini1 = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            const arrayGambarGemini = [base64Gemini1]; 

            if (req.files['foto2']) {
                const base64Gemini2 = await konversiKeBase64Steril(req.files['foto2'][0].buffer);
                arrayGambarGemini.push(base64Gemini2);
            }
            if (req.files['foto3']) {
                const base64Gemini3 = await konversiKeBase64Steril(req.files['foto3'][0].buffer);
                arrayGambarGemini.push(base64Gemini3);
            }

            payload = {
                prompt: promptUtama,
                reference_images: arrayGambarGemini, // Sesuai Dokumen Gambar 2922.jpg: Menerima array isi Base64 murni string
                webhook_url: `${RAILWAY_URL}/webhook`
            };
        }

        const response = await axios.post(TARGET_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': API_KEY }
        });

        let data = response.data.data || response.data;
        if (Array.isArray(data)) data = data[0];
        
        const taskId = data.task_id || data.id;
        databaseHasil[taskId] = { status: "PENDING", used_fitur: fitur };

        res.json({ status: "PENDING", data: { task1: taskId } });

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) });
    }
});

app.post('/webhook', (req, res) => {
    try {
        let data = req.body.data || req.body;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) {} }
        if (Array.isArray(data)) data = data[0];
        const taskId = data.task_id || data.id;
        if (taskId) databaseHasil[taskId] = { ...databaseHasil[taskId], ...data }; 
        res.status(200).send("OK");
    } catch(err) { res.status(500).send("Error"); }
});

app.get('/status', async (req, res) => {
    try {
        const { taskId, apiKey } = req.query;
        let data = databaseHasil[taskId];

        if (!data || data.status === "PENDING" || (data.status === "COMPLETED" && !data.image_url && !data.generated)) {
             const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;
             let CHECK_URL = '';
             if (data?.used_fitur === 'upscale') {
                 CHECK_URL = `https://api.magnific.com/v1/ai/image-upscaler/${taskId}`;
             } else if (data?.used_fitur === 'flux') {
                 CHECK_URL = `https://api.magnific.com/v1/ai/text-to-image/flux-2-pro/${taskId}`;
             } else if (data?.used_fitur === 'ugc') {
                 CHECK_URL = `https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro?task_id=${taskId}`;
             } else {
                 CHECK_URL = `https://api.magnific.com/v1/ai/gemini-2-5-flash-image-preview/${taskId}`;
             }

             let response = await axios.get(CHECK_URL, { headers: {'x-magnific-api-key': API_KEY} });
             let magData = response.data.data || response.data;
             if (Array.isArray(magData)) magData = magData[0];
             if (magData) data = { ...data, ...magData }; 
        }

        let statusData = data?.status || data?.state || "PENDING";
        let imageUrl = null;
        
        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.generated && data.generated.length > 0) {
                if (typeof data.generated[0] === 'string') {
                    imageUrl = data.generated[0]; // Ekstraksi link string dari array generated milik Gemini/Flux
                } else {
                    imageUrl = data.generated[0].image || data.generated[0].url;
                }
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
app.listen(PORT, '0.0.0.0', () => console.log(`Server HERRA AI aktif gagah di port ${PORT}`));
