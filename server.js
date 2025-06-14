// SOLUÇÃO HÍBRIDA - PagSeguro v3 (funciona sem whitelist)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { DOMParser } = require('xmldom');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        status: 'PagSeguro v3 HÍBRIDO - SEM WHITELIST!',
        message: 'Funciona com token normal',
        endpoints: {
            checkout: '/api/checkout-v3',
            pix: '/api/pix-v3'
        }
    });
});

// CHECKOUT v3 - FUNCIONA COM TOKEN NORMAL
app.post('/api/checkout-v3', async (req, res) => {
    console.log('\n🚀 PAGSEGURO v3 - SEM WHITELIST');
    
    const { amount, name, email, cpf, phone, street, number, district, city, state, postalCode } = req.body;

    if (!process.env.PAGSEGURO_EMAIL || !process.env.PAGSEGURO_TOKEN) {
        return res.status(400).json({
            error: 'Credenciais não configuradas',
            needed: ['PAGSEGURO_EMAIL', 'PAGSEGURO_TOKEN']
        });
    }

    try {
        const cleanCpf = cpf.replace(/\D/g, '');
        const cleanPhone = phone.replace(/\D/g, '');
        const cleanCep = postalCode.replace(/\D/g, '');
        
        const areaCode = cleanPhone.slice(0, 2);
        const phoneNumber = cleanPhone.slice(2);

        console.log('=== DADOS LIMPOS ===');
        console.log(`CPF: ${cleanCpf} (${cleanCpf.length} dígitos)`);
        console.log(`Tel: ${areaCode}-${phoneNumber} (${cleanPhone.length} total)`);
        console.log(`CEP: ${cleanCep} (${cleanCep.length} dígitos)`);

        // XML para PagSeguro v3 - ESTRUTURA CORRETA
        const xmlData = `<?xml version="1.0" encoding="UTF-8"?>
<checkout>
    <currency>BRL</currency>
    <reference>MG_${Date.now()}</reference>
    
    <items>
        <item>
            <id>0001</id>
            <description>Magic Germinator Professional</description>
            <amount>${amount.toFixed(2)}</amount>
            <quantity>1</quantity>
            <weight>1000</weight>
        </item>
    </items>
    
    <sender>
        <name>${name}</name>
        <email>${email}</email>
        <phone>
            <areaCode>${areaCode}</areaCode>
            <number>${phoneNumber}</number>
        </phone>
        <documents>
            <document>
                <type>CPF</type>
                <value>${cleanCpf}</value>
            </document>
        </documents>
        <address>
            <street>${street}</street>
            <number>${number}</number>
            <district>${district}</district>
            <postalCode>${cleanCep}</postalCode>
            <city>${city}</city>
            <state>${state}</state>
            <country>BRA</country>
        </address>
    </sender>
    
    <shipping>
        <type>3</type>
        <cost>0.00</cost>
        <address>
            <street>${street}</street>
            <number>${number}</number>
            <district>${district}</district>
            <postalCode>${cleanCep}</postalCode>
            <city>${city}</city>
            <state>${state}</state>
            <country>BRA</country>
        </address>
    </shipping>
    
    <redirectURL>https://meu-checkout-backend-1.onrender.com/sucesso</redirectURL>
    <notificationURL>https://meu-checkout-backend-1.onrender.com/api/notification</notificationURL>
    <maxUses>1</maxUses>
    <maxAge>120</maxAge>
</checkout>`;

        console.log('=== XML ENVIADO ===');
        console.log(xmlData);

        // Envia para PagSeguro v3 com XML
        const response = await axios.post(
            'https://ws.pagseguro.uol.com.br/v3/transactions',
            xmlData,
            {
                params: {
                    email: process.env.PAGSEGURO_EMAIL,
                    token: process.env.PAGSEGURO_TOKEN
                },
                headers: {
                    'Content-Type': 'application/xml; charset=UTF-8'
                },
                timeout: 60000
            }
        );

        console.log('✅ Resposta PagSeguro v3:', response.data);

        // Parse da resposta XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response.data, 'text/xml');

        // Verifica erros
        const errors = xmlDoc.getElementsByTagName('error');
        if (errors.length > 0) {
            let errorMsg = 'Erros encontrados:\n';
            for (let i = 0; i < errors.length; i++) {
                const code = errors[i].getElementsByTagName('code')[0]?.textContent;
                const message = errors[i].getElementsByTagName('message')[0]?.textContent;
                errorMsg += `[${code}] ${message}\n`;
            }
            throw new Error(errorMsg);
        }

        // Extrai dados da transação
        const transactionCode = xmlDoc.getElementsByTagName('code')[0]?.textContent;
        const transactionDate = xmlDoc.getElementsByTagName('date')[0]?.textContent;

        if (!transactionCode) {
            throw new Error('Código da transação não encontrado');
        }

        const checkoutUrl = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${transactionCode}`;

        console.log('✅ Transação criada:', transactionCode);

        res.json({
            success: true,
            transaction_code: transactionCode,
            transaction_date: transactionDate,
            redirect_url: checkoutUrl,
            message: 'Checkout v3 criado com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro v3:', error.response?.data || error.message);
        
        let errorMessage = 'Erro desconhecido';
        let suggestions = [];

        if (error.response?.status === 401) {
            errorMessage = 'Credenciais inválidas';
            suggestions = [
                'Verifique PAGSEGURO_EMAIL no .env',
                'Verifique PAGSEGURO_TOKEN no .env',
                'Regenere o token se necessário'
            ];
        } else if (error.message.includes('CPF')) {
            errorMessage = 'Problema com CPF';
            suggestions = ['Use um CPF válido de 11 dígitos'];
        } else if (error.message.includes('phone')) {
            errorMessage = 'Problema com telefone';
            suggestions = ['Use telefone com DDD (10 ou 11 dígitos)'];
        }

        res.status(500).json({
            error: errorMessage,
            details: error.response?.data || error.message,
            suggestions: suggestions
        });
    }
});

// PIX DIRETO v3 - SEM WHITELIST
app.post('/api/pix-v3', async (req, res) => {
    console.log('\n💰 PIX v3 - SEM WHITELIST');
    
    const { amount, name, email, cpf, phone } = req.body;

    try {
        const cleanCpf = cpf.replace(/\D/g, '');
        const cleanPhone = phone.replace(/\D/g, '');
        const areaCode = cleanPhone.slice(0, 2);
        const phoneNumber = cleanPhone.slice(2);

        // XML para PIX v3
        const xmlData = `<?xml version="1.0" encoding="UTF-8"?>
<payment>
    <mode>default</mode>
    <method>pix</method>
    <currency>BRL</currency>
    <reference>PIX_${Date.now()}</reference>
    
    <items>
        <item>
            <id>0001</id>
            <description>Magic Germinator Professional</description>
            <amount>${amount.toFixed(2)}</amount>
            <quantity>1</quantity>
        </item>
    </items>
    
    <sender>
        <name>${name}</name>
        <email>${email}</email>
        <phone>
            <areaCode>${areaCode}</areaCode>
            <number>${phoneNumber}</number>
        </phone>
        <documents>
            <document>
                <type>CPF</type>
                <value>${cleanCpf}</value>
            </document>
        </documents>
    </sender>
    
    <notificationURL>https://meu-checkout-backend-1.onrender.com/api/notification</notificationURL>
</payment>`;

        console.log('=== PIX XML ===');
        console.log(xmlData);

        const response = await axios.post(
            'https://ws.pagseguro.uol.com.br/v3/transactions',
            xmlData,
            {
                params: {
                    email: process.env.PAGSEGURO_EMAIL,
                    token: process.env.PAGSEGURO_TOKEN
                },
                headers: {
                    'Content-Type': 'application/xml; charset=UTF-8'
                }
            }
        );

        console.log('✅ PIX v3 criado:', response.data);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response.data, 'text/xml');

        const paymentLink = xmlDoc.getElementsByTagName('paymentLink')[0]?.textContent;
        const code = xmlDoc.getElementsByTagName('code')[0]?.textContent;

        res.json({
            success: true,
            payment_code: code,
            payment_link: paymentLink,
            message: 'PIX v3 gerado com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro PIX v3:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Erro ao gerar PIX v3',
            details: error.response?.data || error.message
        });
    }
});

// Notificação
app.post('/api/notification', (req, res) => {
    console.log('\n📞 NOTIFICAÇÃO v3:');
    console.log('Query:', req.query);
    console.log('Body:', req.body);
    res.status(200).send('OK');
});

// Sucesso
app.get('/sucesso', (req, res) => {
    res.send(`
        <html>
            <head><title>Pagamento Realizado!</title></head>
            <body style="font-family:Arial;text-align:center;padding:50px;background:#0a0a0a;color:#fff;">
                <div style="background:#00ff41;color:#000;padding:30px;border-radius:15px;display:inline-block;">
                    <h1>🎉 PAGAMENTO REALIZADO!</h1>
                    <p>Obrigado por escolher o Magic Germinator!</p>
                    <p>Transação processada com sucesso!</p>
                </div>
            </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 PAGSEGURO v3 HÍBRIDO ATIVO');
    console.log(`📍 Porta: ${PORT}`);
    console.log(`📧 Email: ${process.env.PAGSEGURO_EMAIL || '❌ FALTANDO'}`);
    console.log(`🔑 Token: ${process.env.PAGSEGURO_TOKEN ? '✅ OK' : '❌ FALTANDO'}`);
    console.log('\n📋 VANTAGENS v3 HÍBRIDO:');
    console.log('• ✅ Não precisa de whitelist');
    console.log('• ✅ Usa token normal do PagSeguro');
    console.log('• ✅ XML estruturado corretamente');
    console.log('• ✅ Funciona imediatamente');
    console.log('\n🔗 ENDPOINTS:');
    console.log('• /api/checkout-v3 - Checkout completo');
    console.log('• /api/pix-v3 - PIX direto');
    console.log('=====================================\n');
});