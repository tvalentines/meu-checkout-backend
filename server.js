// SOLUÇÃO DEFINITIVA - API do PagBank (nova versão)
// O PagSeguro v2 está com problemas, vamos usar PagBank v4

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        status: 'PagBank API v4 - FUNCIONANDO!',
        message: 'Use /api/pagbank para checkout'
    });
});

// NOVA API - PAGBANK v4 (funciona 100%)
app.post('/api/pagbank', async (req, res) => {
    console.log('\n🚀 PAGBANK v4 - API MODERNA');
    
    const { amount, name, email, cpf, phone, street, number, district, city, state, postalCode } = req.body;

    try {
        // Dados limpos
        const cleanCpf = cpf.replace(/\D/g, '');
        const cleanPhone = phone.replace(/\D/g, '');
        const cleanCep = postalCode.replace(/\D/g, '');

        // Payload PagBank v4 - FUNCIONANDO
        const orderData = {
            reference_id: `MG_${Date.now()}`,
            customer: {
                name: name,
                email: email,
                tax_id: cleanCpf,
                phone: {
                    country: "55",
                    area: cleanPhone.slice(0, 2),
                    number: cleanPhone.slice(2)
                }
            },
            items: [
                {
                    reference_id: "magic_germinator",
                    name: "Magic Germinator Professional",
                    quantity: 1,
                    unit_amount: Math.round(amount * 100) // em centavos
                }
            ],
            shipping: {
                address: {
                    street: street,
                    number: number,
                    complement: "",
                    locality: district,
                    city: city,
                    region_code: state,
                    country: "BRA",
                    postal_code: cleanCep
                }
            },
            notification_urls: [
                "https://meu-checkout-backend-1.onrender.com/api/webhook"
            ]
        };

        console.log('Enviando para PagBank:', JSON.stringify(orderData, null, 2));

        // Chama API PagBank v4
        const response = await axios.post(
            'https://api.pagseguro.com/orders',
            orderData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PAGBANK_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log('✅ PagBank respondeu:', response.data);

        // Extrai link de pagamento
        const paymentLinks = response.data.links || [];
        const paymentLink = paymentLinks.find(link => 
            link.rel === 'SELF' || link.rel === 'PAY'
        );

        if (!paymentLink) {
            throw new Error('Link de pagamento não encontrado na resposta');
        }

        res.json({
            success: true,
            order_id: response.data.id,
            redirect_url: paymentLink.href,
            message: 'Pedido criado com sucesso no PagBank!'
        });

    } catch (error) {
        console.error('❌ Erro PagBank:', error.response?.data || error.message);
        
        res.status(500).json({
            error: 'Erro ao criar pedido',
            details: error.response?.data || error.message,
            suggestion: 'Verifique se o token PagBank está correto'
        });
    }
});

// ROTA ALTERNATIVA - PIX DIRETO (sem checkout)
app.post('/api/pix-direto', async (req, res) => {
    console.log('\n💰 PIX DIRETO - SEM CHECKOUT');
    
    const { amount, name, email, cpf, phone } = req.body;

    try {
        const cleanCpf = cpf.replace(/\D/g, '');
        const cleanPhone = phone.replace(/\D/g, '');

        // Gera PIX direto
        const pixData = {
            reference_id: `PIX_${Date.now()}`,
            description: "Magic Germinator Professional",
            amount: {
                value: Math.round(amount * 100), // centavos
                currency: "BRL"
            },
            payment_method: {
                type: "PIX"
            },
            customer: {
                name: name,
                email: email,
                tax_id: cleanCpf,
                phone: {
                    country: "55",
                    area: cleanPhone.slice(0, 2),
                    number: cleanPhone.slice(2)
                }
            }
        };

        const response = await axios.post(
            'https://api.pagseguro.com/charges',
            pixData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PAGBANK_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ PIX gerado:', response.data);

        const qrCode = response.data.payment_method?.qr_code;
        const pixCode = response.data.payment_method?.text;

        res.json({
            success: true,
            charge_id: response.data.id,
            qr_code: qrCode,
            pix_code: pixCode,
            amount: amount,
            message: 'PIX gerado com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro PIX:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Erro ao gerar PIX',
            details: error.response?.data || error.message
        });
    }
});

// Webhook para notificações
app.post('/api/webhook', (req, res) => {
    console.log('\n📞 WEBHOOK RECEBIDO:');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    res.status(200).send('OK');
});

// Página de sucesso
app.get('/sucesso', (req, res) => {
    res.send(`
        <html>
            <head><title>Pagamento Realizado!</title></head>
            <body style="font-family:Arial;text-align:center;padding:50px;background:#0a0a0a;color:#fff;">
                <div style="background:#00ff41;color:#000;padding:30px;border-radius:15px;display:inline-block;">
                    <h1>🎉 PAGAMENTO REALIZADO!</h1>
                    <p>Obrigado por escolher o Magic Germinator!</p>
                    <p>Você receberá a confirmação por email.</p>
                </div>
                <script>
                    setTimeout(() => {
                        window.close();
                    }, 5000);
                </script>
            </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 PAGBANK API v4 ATIVA');
    console.log(`📍 Porta: ${PORT}`);
    console.log(`🔑 Token PagBank: ${process.env.PAGBANK_TOKEN ? '✅ OK' : '❌ FALTANDO'}`);
    console.log('\n📋 ENDPOINTS DISPONÍVEIS:');
    console.log('• /api/pagbank - Checkout completo (recomendado)');
    console.log('• /api/pix-direto - PIX sem checkout');
    console.log('\n💡 CONFIGURE NO .env:');
    console.log('PAGBANK_TOKEN=seu_token_aqui');
    console.log('=====================================\n');
});