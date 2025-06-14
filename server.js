require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { DOMParser } = require('xmldom');

// Inicializa o servidor
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rota de teste
app.get('/', (req, res) => {
    res.json({ status: 'Servidor online!' });
});

// Rota para gerar PIX
app.post('/api/pix', async (req, res) => {
    const { amount, description, reference, name, email, cpf, phone, street, number, district, city, state, postalCode } = req.body;

    // Validação inicial
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Campo 'amount' deve ser um número positivo" });
    }

    if (!name || !email || !cpf || !phone) {
        return res.status(400).json({ error: "Campos obrigatórios: name, email, cpf, phone" });
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
        return res.status(400).json({ error: "CPF deve ter 11 dígitos" });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
        return res.status(400).json({ error: "Telefone deve ter pelo menos 10 dígitos" });
    }

    try {
        // Extrai DDD e número do telefone
        const areaCode = cleanPhone.slice(0, 2);
        const phoneNumber = cleanPhone.slice(2);

        const data = new URLSearchParams({
            email: process.env.PAGSEGURO_EMAIL,
            token: process.env.PAGSEGURO_TOKEN,

            // Dados do item
            itemId1: '0001',
            itemDescription1: description || 'Magic Germinator',
            itemAmount1: amount.toFixed(2),
            itemQuantity1: '1',
            itemWeight1: '1000', // peso em gramas

            // Referência do pedido
            reference: reference || `pedido_${Date.now()}`,

            // Dados do comprador
            senderName: name,
            senderEmail: email,
            senderCPF: cleanCpf,
            senderAreaCode: areaCode,
            senderPhone: phoneNumber,

            // Endereço de entrega
            shippingAddressRequired: 'true',
            shippingAddressStreet: street || 'Rua Principal',
            shippingAddressNumber: number || '123',
            shippingAddressDistrict: district || 'Centro',
            shippingAddressCity: city || 'São Paulo',
            shippingAddressState: state || 'SP',
            shippingAddressPostalCode: (postalCode || '01310000').replace(/\D/g, ''),
            shippingAddressCountry: 'BRA',

            // Tipo de frete
            shippingType: '1',
            shippingCost: '0.00',

            // Moeda
            currency: 'BRL',

            // Timeout da sessão
            timeout: '30'
        });

        console.log('Dados enviados para PagSeguro:', data.toString());

        const url = 'https://ws.pagseguro.uol.com.br/v2/checkout'; 

        const axiosResponse = await axios.post(url, data.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=ISO-8859-1'
            }
        });

        console.log('Resposta do PagSeguro:', axiosResponse.data);

        const parser = new DOMParser();
        const xml = parser.parseFromString(axiosResponse.data, 'text/xml');

        // Busca o código do checkout
        const checkoutCode = xml.getElementsByTagName('code')[0]?.textContent;

        if (!checkoutCode) {
            console.error("Código do checkout não encontrado");
            return res.status(500).json({ 
                error: "Falha ao gerar checkout", 
                raw_response: axiosResponse.data 
            });
        }

        // URL de redirecionamento para o PagSeguro
        const redirectUrl = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${checkoutCode}`;

        res.json({
            success: true,
            checkout_code: checkoutCode,
            redirect_url: redirectUrl,
            message: "Checkout criado com sucesso"
        });

    } catch (error) {
        console.error("Erro completo:", error.message);
        console.error("Resposta bruta do PagSeguro:", error.response?.data);

        res.status(500).json({
            error: "Erro ao gerar checkout",
            details: error.message,
            raw_response: error.response?.data
        });
    }
});

// Nova rota específica para PIX direto (alternativa)
app.post('/api/pix-direct', async (req, res) => {
    const { amount, description, reference, name, email, cpf, phone } = req.body;

    try {
        // Para PIX direto, você precisa usar a API de Pagamentos Transparentes
        // que requer configuração adicional no PagSeguro
        
        const data = new URLSearchParams({
            email: process.env.PAGSEGURO_EMAIL,
            token: process.env.PAGSEGURO_TOKEN,
            
            paymentMode: 'default',
            paymentMethod: 'pix',
            
            itemId1: '0001',
            itemDescription1: description || 'Magic Germinator',
            itemAmount1: amount.toFixed(2),
            itemQuantity1: '1',
            
            reference: reference || `pedido_${Date.now()}`,
            
            senderName: name,
            senderEmail: email,
            senderCPF: cpf.replace(/\D/g, ''),
            senderAreaCode: phone.replace(/\D/g, '').slice(0, 2),
            senderPhone: phone.replace(/\D/g, '').slice(2),
            
            currency: 'BRL'
        });

        const response = await axios.post(
            'https://ws.pagseguro.uol.com.br/v2/transactions',
            data.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=ISO-8859-1'
                }
            }
        );

        res.json({
            success: true,
            data: response.data
        });

    } catch (error) {
        console.error("Erro PIX direto:", error.response?.data);
        res.status(500).json({
            error: "Erro ao gerar PIX direto",
            details: error.response?.data
        });
    }
});

// Servidor escutando
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});