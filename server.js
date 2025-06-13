require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { DOMParser } = require('xmldom');

const app = express();

app.use(cors());
app.use(express.json());

// Rota para gerar PIX
app.post('/api/pix', async (req, res) => {
    const { amount, description, reference } = req.body;

    try {
        const data = new URLSearchParams({
            email: process.env.PAGSEGURO_EMAIL,
            token: process.env.PAGSEGURO_TOKEN,
            payment_method_id: 'pix',
            item_description_1: description,
            item_quantity_1: '1',
            item_amount_1: amount.toFixed(2),
            reference
        });

        const url = 'https://ws.pagseguro.uol.com.br/v2/transactions'; 

        const response = await axios.post(url, data.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const parser = new DOMParser();
        const xml = parser.parseFromString(response.data, 'text/xml');

        const qrCode = xml.querySelector('qrCode')?.textContent || null;
        const copyPaste = xml.querySelector('copyAndPaste')?.textContent || null;

        if (!qrCode || !copyPaste) {
            return res.status(500).json({ error: 'Falha ao gerar PIX' });
        }

        res.json({
            success: true,
            qr_code: qrCode,
            copy_paste: copyPaste
        });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: 'Erro ao gerar PIX' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});