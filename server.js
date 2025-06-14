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
app.get('/', (req, res) => {
    res.json({ status: 'Servidor funcionando!' });
});

// Rota para gerar PIX
app.post('/api/pix', async (req, res) => {
    const { amount, description, reference, name, email, cpf, phone, street, number, district, city, state, postalCode } = req.body;

    // Validação do amount
    if (typeof amount !== 'number' || isNaN(amount)) {
        return res.status(400).json({ error: "Campo 'amount' inválido" });
    }

    try {
        const data = new URLSearchParams({
            email: process.env.PAGSEGURO_EMAIL,
            token: process.env.PAGSEGURO_TOKEN,

            payment_method_id: 'pix',
            item_description_1: description || 'Magic Germinator',
            item_quantity_1: '1',
            item_amount_1: amount.toFixed(2),
            reference: reference || `pedido_${Date.now()}`,

            // Dados do comprador
            sender_name: name || 'João da Silva',
            sender_email: email || 'comprador@example.com',
            sender_cpf: cpf || '12345678900',
            sender_area_code: phone?.slice(0, 2) || '11',
            sender_phone: phone?.slice(2) || '999999999',

            // Endereço de entrega (sempre requerido)
            shippingAddressRequired: 'true',
            shippingAddressStreet: street || 'Rua Principal',
            shippingAddressNumber: number || '123',
            shippingAddressDistrict: district || 'Centro',
            shippingAddressCity: city || 'São Paulo',
            shippingAddressState: state || 'SP',
            shippingAddressPostalCode: postalCode || '01310000',
            shippingAddressCountry: 'BRA',

            currency: 'BRL'
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
            console.error("QR Code ou CopyPaste ausentes");
            return res.status(500).json({ error: "Falha ao gerar PIX", raw_response: axiosResponse.data });
        }

        res.json({
            success: true,
            qr_code: qrCode,
            copy_paste: copyPaste
        });

    } catch (error) {
        console.error("Erro completo:", error.message);
        console.error("Resposta bruta do PagSeguro:", error.response?.data);

        res.status(500).json({
            error: "Erro ao gerar PIX",
            raw_response: error.response?.data
        });
    }
});

// Porta do servidor
const PORT = process.env.PORT || 3000;

// ✅ Servidor escutando
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});