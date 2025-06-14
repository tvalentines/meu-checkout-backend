// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { DOMParser } = require('xmldom');

// Inicializa o servidor
const app = express(); // ✅ Aqui é onde estava o problema: falta do 'app'

// Middlewares
app.use(cors());
app.use(express.json());

// Rota simples pra teste
app.post('/api/pix', async (req, res) => {
    const { amount, description, reference } = req.body;

    // Validação mais robusta
    let parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || typeof parsedAmount !== 'number') {
        console.error("Valor recebido:", amount);
        return res.status(400).json({ error: "Campo 'amount' inválido" });
    }

    parsedAmount = parseFloat(parsedAmount.toFixed(2)); // Garantir 2 casas decimais

    try {
        const data = new URLSearchParams({
            email: process.env.PAGSEGURO_EMAIL,
            token: process.env.PAGSEGURO_TOKEN,
            payment_method_id: 'pix',
            item_description_1: description || 'Magic Germinator',
            item_quantity_1: '1',
            item_amount_1: parsedAmount.toFixed(2),
            reference: reference || `pedido_${Date.now()}`
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