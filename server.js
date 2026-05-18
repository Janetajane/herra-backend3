const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data'); 
const sharp = require('sharp'); 

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

// Alamat server Railway Abang di Singapura
const RAILWAY_URL = 'https://herra-backend3-production.up.railway.app'; 

// Database mini untuk menyimpan memori tugas sementara
const databaseHasil = {};

/**
 * KURIR PEMBANTU 1:
 * Mengubah file gambar mentah menjadi string Base64 murni berformat JPEG steril (90% Quality)
 * Sangat wajib untuk fitur: Image Upscaler & Flux 2 Pro
 */
async function konversiKeBase64Steril(buffer) {
    return await sharp(buffer)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toBuffer()
        .then(buf => buf.toString('base64'));
}

/**
 * KURIR PEMBANTU 2:
 * Mengunggah file gambar ke FreeImage host untuk mendapatkan URL publik internet
 * Sangat wajib untuk fitur: Nano Banana Pro (UGC)
 */
async function uploadKeFreeImage(buffer) {
    const bufferBersih = await sharp(buffer).toFormat('jpeg').jpeg({ quality: 95 }).toBuffer();
    const form = new FormData();
    form.append('key', '6d207e02198a847aa98d0a2a901485a5');
    form.append('action', 'upload');
    form.append('source', bufferBersih.toString('base64'));
    form.append('format', 'json');
    const uploadRes = await axios.post('https://freeimage.host/api/1/upload', form, { headers: form.getHeaders() });
    return uploadRes.data.image.url;
}

// ==========================================
// PINTU UTAMA: PROSES GENERATE IMAGE
// ==========================================
app.post('/generate', upload.fields([{ name: 'foto1' }, { name: 'foto2' }, { name: 'foto3' }]), async (req, res) => {
    try {
        const { promptUtama, ratio, quality, apiKey, fitur } = req.body;
        const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;

        if (!API_KEY) return res.status(500).json({ status: "Error", pesan: "API Key belum diisi!" });
        if (!req.files || !req.files['foto1']) return res.status(400).json({ status: "Error", pesan: "Berkas gambar utama (Foto 1) wajib diunggah." });

        let TARGET_URL = '';
        let payload = {};

        if (fitur === 'upscale') {
            // ===================================================
            // JALUR 1: AI IMAGE UPSCALER (STRUKTUR BASE64 MURNI)
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
            // JALUR 2: FLUX 2 PRO PREMIUM (STRUKTUR BASE64 INDEPENDENT)
            // ===================================================
            TARGET_URL = 'https://api.magnific.com/v1/ai/text-to-image/flux-2-pro';
            
            // Konversi Foto 1 (Wajah) ke Base64 murni string
            const base64Foto1 = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            
            payload = {
                prompt: promptUtama,
                prompt_upsampling: false,
                input_image: base64Foto1, 
                webhook_url: `${RAILWAY_URL}/webhook`
            };

            // Jika user upload Foto 2 (Sepatu/Baju), masukkan ke input_image_2
            if (req.files['foto2']) {
                payload.input_image_2 = await konversiKeBase64Steril(req.files['foto2'][0].buffer);
            }
            // Jika user upload Foto 3, masukkan ke input_image_3
            if (req.files['foto3']) {
                payload.input_image_3 = await konversiKeBase64Steril(req.files['foto3'][0].buffer);
            }

            // Setel Ukuran Dimensi Piksel Angka Wajib Sesuai Aturan Flux 2 Pro
            if (ratio === "9:16") {
                payload.width = 768;
                payload.height = 1440; // Potrait Premium
            } else {
                payload.width = 1024;
                payload.height = 1024; // Square Premium
            }

        } else {
            // ===================================================
            // JALUR 3: NANO BANANA PRO (UGC AMAN - STRUKTUR URL ARRAY)
            // ===================================================
            TARGET_URL = 'https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro';
            
            const mainImageUrl = await uploadKeFreeImage(req.files['foto1'][0].buffer);
            const referenceImages = [];
            referenceImages.push({ image: mainImageUrl, text: "Reference 1", mime_type: "image/jpeg" });

            if (req.files['foto2']) {
                const url2 = await uploadKeFreeImage(req.files['foto2'][0].buffer);
                referenceImages.push({ image: url2, text: "Reference 2", mime_type: "image/jpeg" });
            }
            if (req.files['foto3']) {
                const url3 = await uploadKeFreeImage(req.files['foto3'][0].buffer);
                referenceImages.push({ image: url3, text: "Reference 3", mime_type: "image/jpeg" });
            }

            payload = {
                prompt: promptUtama,
                webhook_url: `${RAILWAY_URL}/webhook`, 
                reference_images: referenceImages,
                aspect_ratio: ratio || "1:1",
                resolution: quality || "2K"
            };
        }

        // Tembak data ke server pusat Magnific AI
        const response = await axios.post(TARGET_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': API_KEY }
        });

        let data = response.data.data || response.data;
        if (Array.isArray(data)) data = data[0];
        
        const taskId = data.task_id || data.id;
        
        // Catat di database lokal agar status get tahu jalur fitur mana yang dipakai
        databaseHasil[taskId] = { status: "PENDING", used_fitur: fitur };

        res.json({ status: "PENDING", data: { task1: taskId } });

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) });
    }
});

// ==========================================
// PINTU BELAKANG: WEBHOOK RECEIVER MAGNIFIC
// ==========================================
app.post('/webhook', (req, res) => {
    try {
        let data = req.body.data || req.body;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) {}
        }
        if (Array.isArray(data)) data = data[0];
        
        const taskId = data.task_id || data.id;
        if (taskId) {
            databaseHasil[taskId] = { ...databaseHasil[taskId], ...data }; 
        }
        res.status(200).send("OK");
    } catch(err) {
        res.status(500).send("Error");
    }
});

// ==========================================
// PINTU PENGECEKAN: STATUS DAN AMBIL GAMBAR
// ==========================================
app.get('/status', async (req, res) => {
    try {
        const { taskId, apiKey } = req.query;
        let data = databaseHasil[taskId];

        // Jika data belum lengkap, paksa tembak GET langsung ke server Magnific
        if (!data || data.status === "PENDING" || (data.status === "COMPLETED" && !data.image_url && !data.generated)) {
             const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;
             
             let CHECK_URL = '';
             if (data?.used_fitur === 'upscale') {
                 CHECK_URL = `https://api.magnific.com/v1/ai/image-upscaler/${taskId}`;
             } else if (data?.used_fitur === 'flux') {
                 CHECK_URL = `https://api.magnific.com/v1/ai/text-to-image/flux-2-pro/${taskId}`; // Jalur Path Parameter Sesuai Kitab Suci!
             } else {
                 CHECK_URL = `https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro?task_id=${taskId}`;
             }

             let response = await axios.get(CHECK_URL, { headers: {'x-magnific-api-key': API_KEY} });
             let magData = response.data.data || response.data;
             
             if (Array.isArray(magData)) magData = magData[0];
             if (magData) data = { ...data, ...magData }; 
        }

        let statusData = data?.status || data?.state || "PENDING";
        let imageUrl = null;
        
        // Logika Ekstraksi Link Gambar Hasil Akhir
        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.generated && data.generated.length > 0) {
                if (typeof data.generated[0] === 'string') {
                    imageUrl = data.generated[0]; // Ambil langsung string URL dari array "generated" milik Flux
                } else {
                    imageUrl = data.generated[0].image || data.generated[0].url;
                }
            } else if (data.image_url) {
                imageUrl = data.image_url; // Jalur cadangan milik Upscaler / Nano Banana
            }
        }

        res.json({ status: statusData, image_url: imageUrl, raw_data: data });
    } catch (error) { 
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) }); 
    }
});

// Jalankan Mesin Server Backend
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server HERRA AI aktif gagah di port ${PORT}`));
            
