require('dotenv').config();
const express = require('express'); // Importa o express
const cors = require('cors');
const axios = require('axios');
const { DOMParser } = require('xmldom');

const app = express(); // AQUI ESTÁ O QUE FALTAVA!
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Sua rota /api/pix
app.post('/api/pix', async (req, res) => {
    const { amount, description, reference } = req.body;

    // Validação dos campos
    if (typeof amount !== 'number' || isNaN(amount)) {
        return res.status(400).json({ error: "Campo 'amount' é obrigatório e deve ser um número válido." });
    }

    if (!description || typeof description !== 'string') {
        return res.status(400).json({ error: "Campo 'description' é obrigatório" });
    }

    if (!reference || typeof reference !== 'string') {
        return res.status(400).json({ error: "Campo 'reference' é obrigatório" });
    }

    try {
        const data = new URLSearchParams({
            email: process.env.PAGSEGURO_EMAIL,
            token: process.env.PAGSEGURO_TOKEN,
            payment_method_id: 'pix',
            item_description_1: description,
            item_quantity_1: '1',
            item_amount_1: amount.toFixed(2), // Agora é seguro usar toFixed
            reference
        });

        const url = 'https://ws.pagseguro.uol.com.br/v2/transactions'; 

        const axiosResponse = await axios.post(url, data.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const parser = new DOMParser();
        const xml = parser.parseFromString(axiosResponse.data, 'text/xml');

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
        console.error("Erro na API do PagSeguro:", error.message);
        res.status(500).json({ error: 'Erro ao gerar PIX' });
    }
});