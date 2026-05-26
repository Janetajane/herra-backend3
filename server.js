const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs'); 
const path = require('path'); 
const crypto = require('crypto'); 

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const RAILWAY_URL = 'https://herra-backend3-production.up.railway.app'; 
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// =======================================================
// PINTU KHUSUS GOOGLE GEMINI 3.1 FLASH IMAGE PREVIEW
// =======================================================
app.post('/gemini-generate', upload.fields([{name:'foto1'}, {name:'foto2'}, {name:'foto3'}, {name:'foto4'}, {name:'foto5'}]), async (req, res) => {
    try {
        const { apiKey, prompt, ratio, resolution, useSearch } = req.body;
        if (!apiKey) return res.status(400).json({ status: "Error", pesan: "API Key Gemini kosong!" });

        // 1. Siapkan Muatan Prompt Teks
        let partsData = [{ text: prompt }];

        // 2. Suntikkan 1 sampai 5 Gambar (Sesuai script Python Abang)
        for (let i = 1; i <= 5; i++) {
            if (req.files && req.files[`foto${i}`]) {
                const file = req.files[`foto${i}`][0];
                partsData.push({
                    inlineData: {
                        mimeType: file.mimetype,
                        data: file.buffer.toString('base64')
                    }
                });
            }
        }

        // 3. Konfigurasi Standar Gemini 3.1
        let payload = {
            contents: [{ role: "user", parts: partsData }],
            generationConfig: {
                // Sesuai config=types.GenerateContentConfig()
                responseModalities: ["TEXT", "IMAGE"]
            }
        };

        // Karena responseFormat image di REST API belum stabil secara skema untuk semua project, 
        // kita paksa perintah rasio & resolusi masuk ke otak sistemnya lewat instruksi teks rahasia
        partsData[0].text += `\n[SYSTEM DIRECTIVE: Output image must be strictly in ${ratio} aspect ratio and at ${resolution} resolution.]`;

        // 4. Tambahkan Radar Google Search kalau mode-nya diaktifkan
        if (useSearch === 'true') {
            payload.tools = [{ google_search: {} }];
        }

        // 5. Tembak ke Server Pusat Google
        const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`;
        
        const response = await axios.post(GEMINI_ENDPOINT, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // 6. Tangkap Hasil Text dan Gambar Base64-nya
        let finalImageBase64 = null;
        let finalText = "";
        
        const outputParts = response.data.candidates[0].content.parts;
        
        outputParts.forEach(part => {
            if (part.text) finalText += part.text + "\n";
            if (part.inlineData && part.inlineData.data) {
                finalImageBase64 = part.inlineData.data;
            }
        });

        if (!finalImageBase64) {
            return res.json({ status: "SUCCESS", textResult: finalText, imageUrl: "" });
        }

        // 7. Simpan Gambar ke Gudang Railway
        const namaFile = `gemini_${crypto.randomBytes(8).toString('hex')}.jpg`;
        fs.writeFileSync(path.join(uploadDir, namaFile), Buffer.from(finalImageBase64, 'base64'));
        const publicUrl = `${RAILWAY_URL}/uploads/${namaFile}`;

        res.json({ status: "SUCCESS", textResult: finalText.trim(), imageUrl: publicUrl });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ status: "Error", pesan: JSON.stringify(error.response?.data?.error?.message || error.message) });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Mesin HERRA x GEMINI 3.1 Aktif di port ${PORT}`));
