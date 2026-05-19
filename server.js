const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const sharp = require('sharp'); 
const fs = require('fs'); 
const path = require('path'); 
const uuid = require('uuid').v4; 

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const RAILWAY_URL = 'https://herra-backend3-production.up.railway.app'; 
const databaseHasil = {};

// Buat folder gudang uploads otomatis di Railway jika belum ada
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Buka akses internet folder uploads pribadi
app.use('/uploads', express.static(uploadDir));

// Kurir Pembantu 1: Base64 steril (Untuk Flux/Gemini/Upscaler/Sutradara)
async function konversiKeBase64Steril(buffer) {
    return await sharp(buffer).toFormat('jpeg').jpeg({ quality: 90 }).toBuffer().then(buf => buf.toString('base64'));
}

// Kurir Pembantu 2: Simpan Gudang Internal (Khusus Nano Banana Pro)
async function simpanKeGudangPribadi(buffer) {
    const bufferBersih = await sharp(buffer).toFormat('jpeg').jpeg({ quality: 95 }).toBuffer();
    const namaFile = `${uuid()}.jpg`;
    const jalurLengkap = path.join(uploadDir, namaFile);
    fs.writeFileSync(jalurLengkap, bufferBersih);
    return `${RAILWAY_URL}/uploads/${namaFile}`;
}

// Penghapus File di Gudang biar gak menumpuk di Railway
function hapusFileGudang(urlLengkap) {
    try {
        if (!urlLengkap || !urlLengkap.includes('/uploads/')) return;
        const namaFile = urlLengkap.split('/uploads/')[1];
        const jalurFisik = path.join(uploadDir, namaFile);
        if (fs.existsSync(jalurFisik)) {
            fs.unlinkSync(jalurFisik); 
        }
    } catch (e) {
        console.error("Gagal hapus file gudang:", e);
    }
}

// ==========================================
// PINTU UTAMA: GENERATE CONTENT MULTI-ROUTE
// ==========================================
app.post('/generate', upload.fields([{ name: 'foto1' }, { name: 'foto2' }, { name: 'foto3' }]), async (req, res) => {
    
    let urlsToCleanup = [];

    try {
        const { promptUtama, ratio, quality, apiKey, geminiKey, fitur, scene, gender } = req.body;
        const MAGNIFIC_KEY = apiKey || process.env.MAGNIFIC_API_KEY;
        const GEMINI_KEY = geminiKey || process.env.GEMINI_API_KEY;

        if (!req.files || !req.files['foto1']) return res.status(400).json({ status: "Error", pesan: "Berkas gambar utama wajib diunggah." });

        // =========================================================================
        // LOKET SUTRADARA: AI AUTO SCRIPT (FIX TERBARU 100% TEMBUS) 🔥 🎬
        // =========================================================================
        if (fitur === 'sutradara') {
            if (!GEMINI_KEY) return res.status(500).json({ status: "Error", pesan: "API Key Gemini belum diisi di kotak atas!" });
            
            // Konversi gambar produk menjadi Base64 steril untuk mata dewa Gemini
            const base64FotoSutradara = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            
            const instruksiSutradara = `Kamu adalah Sutradara & Copywriter Affiliate profesional. Saya memberikan sebuah gambar produk jualan.
Tugasmu: Buatkan naskah video promosi sebanyak ${scene || 3} scene secara terperinci.
Konteks tambahan dari saya: ${promptUtama || "Tidak ada, tolong buatkan sekreatif mungkin agar viral."}

Format Output Wajib (Pisahkan Per Scene dengan Jelas):
🎬 **SCENE [NOMOR]**
🎥 **Prompt Visual Video (Wajib Bahasa Inggris yang sangat detail agar bisa di-copy ke AI Video Generator seperti Luma/Runway):** [Tulis prompt gerakan kameranya dengan lengkap]
🎙️ **Voice Over / Naskah (Bahasa Indonesia bergaya ${gender || 'Wanita'} gaul, ekspresif, persuasif, jualan harian):** [Tulis kata-kata yang diucapkan narator]
`;

            const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`;
            
            const payloadGemini = {
                contents: [{
                    parts: [
                        { text: instruksiSutradara },
                        { inlineData: { mimeType: "image/jpeg", data: base64FotoSutradara } }
                    ]
                }]
            };

            const resGemini = await axios.post(urlGemini, payloadGemini, { headers: { 'Content-Type': 'application/json' } });
            
            if (!resGemini.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error("Respons dari Google Gemini kosong atau tidak valid.");
            }

            const teksHasilScript = resGemini.data.candidates[0].content.parts[0].text;
            const fakeTaskId = "SUTRADARA-" + Date.now().toString();
            
            // Simpan ke database memori lokal
            databaseHasil[fakeTaskId] = { status: "COMPLETED", image_url: teksHasilScript, used_fitur: 'sutradara' };

            return res.json({ status: "PENDING", data: { task1: fakeTaskId } });
        }

        // =========================================================================
        // JALUR FITUR PENGOLAHAN GAMBAR (MAGNIFIC AI)
        // =========================================================================
        if (!MAGNIFIC_KEY) return res.status(500).json({ status: "Error", pesan: "API Key Magnific belum diisi!" });
        
        let TARGET_URL = '';
        let payload = {};

        if (fitur === 'upscale') {
            TARGET_URL = 'https://api.magnific.com/v1/ai/image-upscaler';
            const base64Murni = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            payload = { image: base64Murni, webhook_url: `${RAILWAY_URL}/webhook`, scale_factor: quality === '4K' ? "4x" : "2x", optimized_for: "soft_portraits", engine: "automatic" };
        } else if (fitur === 'scan') {
            TARGET_URL = 'https://api.magnific.com/v1/ai/image-to-prompt';
            const base64MurniScan = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            payload = { image: base64MurniScan, webhook_url: `${RAILWAY_URL}/webhook` };
        } else if (fitur === 'flux') {
            TARGET_URL = 'https://api.magnific.com/v1/ai/text-to-image/flux-2-pro';
            const base64Foto1 = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            payload = { prompt: promptUtama, prompt_upsampling: false, input_image: base64Foto1, webhook_url: `${RAILWAY_URL}/webhook` };
            if (req.files['foto2']) payload.input_image_2 = await konversiKeBase64Steril(req.files['foto2'][0].buffer);
            if (req.files['foto3']) payload.input_image_3 = await konversiKeBase64Steril(req.files['foto3'][0].buffer);
            if (ratio === "9:16") { payload.width = 768; payload.height = 1440; } else { payload.width = 1024; payload.height = 1024; }
        } else if (fitur === 'ugc') {
            TARGET_URL = 'https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro';
            const mainImageUrl = await simpanKeGudangPribadi(req.files['foto1'][0].buffer);
            urlsToCleanup.push(mainImageUrl); 

            const referenceImages = [{ image: mainImageUrl, text: "Reference 1", mime_type: "image/jpeg" }];
            if (req.files['foto2']) {
                const url2 = await simpanKeGudangPribadi(req.files['foto2'][0].buffer);
                referenceImages.push({ image: url2, text: "Reference 2", mime_type: "image/jpeg" });
                urlsToCleanup.push(url2);
            }
            if (req.files['foto3']) {
                const url3 = await simpanKeGudangPribadi(req.files['foto3'][0].buffer);
                referenceImages.push({ image: url3, text: "Reference 3", mime_type: "image/jpeg" });
                urlsToCleanup.push(url3);
            }
            payload = { prompt: promptUtama, webhook_url: `${RAILWAY_URL}/webhook`, reference_images: referenceImages, aspect_ratio: ratio || "1:1", resolution: quality || "2K" };
        } else {
            TARGET_URL = 'https://api.magnific.com/v1/ai/gemini-2-5-flash-image-preview';
            const base64Gemini1 = await konversiKeBase64Steril(req.files['foto1'][0].buffer);
            const arrayGambarGemini = [base64Gemini1]; 
            if (req.files['foto2']) { const base64Gemini2 = await konversiKeBase64Steril(req.files['foto2'][0].buffer); arrayGambarGemini.push(base64Gemini2); }
            if (req.files['foto3']) { const base64Gemini3 = await konversiKeBase64Steril(req.files['foto3'][0].buffer); arrayGambarGemini.push(base64Gemini3); }
            payload = { prompt: promptUtama, reference_images: arrayGambarGemini, webhook_url: `${RAILWAY_URL}/webhook` };
        }

        const response = await axios.post(TARGET_URL, payload, { headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': MAGNIFIC_KEY } });
        let data = response.data.data || response.data;
        if (Array.isArray(data)) data = data[0];
        
        const taskId = data.task_id || data.id;
        databaseHasil[taskId] = { status: "PENDING", used_fitur: fitur, cleanupUrls: urlsToCleanup };

        res.json({ status: "PENDING", data: { task1: taskId } });

    } catch (error) {
        urlsToCleanup.forEach(url => hapusFileGudang(url));
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

        if (data && data.used_fitur === 'sutradara') {
            return res.json({ status: data.status, image_url: data.image_url, raw_data: data });
        }

        if (!data || data.status === "PENDING" || (data.status === "COMPLETED" && !data.image_url && !data.generated)) {
             const API_KEY = apiKey || process.env.MAGNIFIC_API_KEY;
             let CHECK_URL = '';
             if (data?.used_fitur === 'upscale') CHECK_URL = `https://api.magnific.com/v1/ai/image-upscaler/${taskId}`;
             else if (data?.used_fitur === 'flux') CHECK_URL = `https://api.magnific.com/v1/ai/text-to-image/flux-2-pro/${taskId}`;
             else if (data?.used_fitur === 'ugc') CHECK_URL = `https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro?task_id=${taskId}`;
             else if (data?.used_fitur === 'scan') CHECK_URL = `https://api.magnific.com/v1/ai/image-to-prompt/${taskId}`;
             else CHECK_URL = `https://api.magnific.com/v1/ai/gemini-2-5-flash-image-preview/${taskId}`;

             let response = await axios.get(CHECK_URL, { headers: {'x-magnific-api-key': API_KEY} });
             let magData = response.data.data || response.data;
             if (Array.isArray(magData)) magData = magData[0];
             if (magData) data = { ...data, ...magData }; 
        }

        let statusData = data?.status || data?.state || "PENDING";
        let imageUrl = null;
        
        if (statusData === 'COMPLETED' || statusData === 'SUCCESS') {
            if (data.cleanupUrls && data.cleanupUrls.length > 0) {
                data.cleanupUrls.forEach(url => hapusFileGudang(url));
                data.cleanupUrls = []; 
            }

            if (data.generated && data.generated.length > 0) {
                if (typeof data.generated[0] === 'string') imageUrl = data.generated[0];
                else imageUrl = data.generated[0].image || data.generated[0].url;
            } else if (data.image_url) imageUrl = data.image_url;
        }

        res.json({ status: statusData, image_url: imageUrl, raw_data: data });
    } catch (error) { 
        const errorMsg = error.response?.data?.message || error.response?.data || error.message;
        res.status(500).json({ status: "Error", pesan: JSON.stringify(errorMsg) }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server HERRA AI aktif gagah di port ${PORT}`));
