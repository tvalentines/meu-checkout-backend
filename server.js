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
    res.json({ 
        status: 'Servidor online!',
        timestamp: new Date().toISOString(),
        pagseguro_configured: !!(process.env.PAGSEGURO_EMAIL && process.env.PAGSEGURO_TOKEN)
    });
});

// Rota para gerar checkout PagSeguro - VERSÃO ULTRA SIMPLES
app.post('/api/pix', async (req, res) => {
    console.log('\n=== CHECKOUT ULTRA SIMPLES ===');
    console.log('Dados recebidos:', req.body);

    const { amount, description, reference, name, email, cpf, phone, street, number, district, city, state, postalCode } = req.body;

    // Validações básicas
    if (!process.env.PAGSEGURO_EMAIL || !process.env.PAGSEGURO_TOKEN) {
        return res.status(500).json({ 
            error: "Credenciais do PagSeguro não configuradas",
            details: "Configure PAGSEGURO_EMAIL e PAGSEGURO_TOKEN no .env"
        });
    }

    if (!amount || !name || !email || !cpf || !phone) {
        return res.status(400).json({ 
            error: "Dados obrigatórios faltando",
            required: ["amount", "name", "email", "cpf", "phone"]
        });
    }

    try {
        // Limpa dados
        const cleanCpf = cpf.replace(/\D/g, '');
        const cleanPhone = phone.replace(/\D/g, '');
        const cleanCep = postalCode ? postalCode.replace(/\D/g, '') : '01310100';

        // DDD e telefone
        const areaCode = cleanPhone.slice(0, 2);
        const phoneNumber = cleanPhone.slice(2);

        // Validação extra antes de enviar
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ 
                error: "CPF deve ter 11 dígitos", 
                received: cleanCpf,
                length: cleanCpf.length 
            });
        }

        if (cleanPhone.length < 10 || cleanPhone.length > 11) {
            return res.status(400).json({ 
                error: "Telefone deve ter 10 ou 11 dígitos", 
                received: cleanPhone,
                length: cleanPhone.length 
            });
        }

        if (cleanCep && cleanCep.length !== 8) {
            return res.status(400).json({ 
                error: "CEP deve ter 8 dígitos", 
                received: cleanCep,
                length: cleanCep.length 
            });
        }

        // Monta dados usando query string com TODOS os campos obrigatórios
        const params = new URLSearchParams({
            // Credenciais
            email: process.env.PAGSEGURO_EMAIL,
            token: process.env.PAGSEGURO_TOKEN,
            
            // Configuração básica
            currency: 'BRL',
            
            // Item - com peso obrigatório
            itemId1: '0001',
            itemDescription1: description || 'Magic Germinator',
            itemAmount1: parseFloat(amount).toFixed(2),
            itemQuantity1: '1',
            itemWeight1: '1000', // Peso obrigatório para shipping
            
            // Referência
            reference: reference || `MG${Date.now()}`,
            
            // Comprador - TODOS os campos obrigatórios
            senderName: name,
            senderEmail: email,
            senderCPF: cleanCpf,
            senderAreaCode: areaCode,
            senderPhone: phoneNumber,
            
            // Frete obrigatório
            shippingType: '3',
            shippingCost: '0.00',
            
            // URLs importantes
            redirectURL: 'https://meu-checkout-backend-1.onrender.com/sucesso',
            notificationURL: 'https://meu-checkout-backend-1.onrender.com/api/notification'
        });

        // Se tem endereço, adiciona TODOS os campos obrigatórios de endereço
        if (street && number && district && city && state) {
            // Endereço de entrega (obrigatório quando há shipping)
            params.append('shippingAddressStreet', street);
            params.append('shippingAddressNumber', number);
            params.append('shippingAddressDistrict', district);
            params.append('shippingAddressCity', city);
            params.append('shippingAddressState', state.toUpperCase());
            params.append('shippingAddressCountry', 'BRA');
            params.append('shippingAddressPostalCode', cleanCep);
            
            // ADICIONANDO: Endereço de cobrança (OBRIGATÓRIO para evitar erro)
            // O PagSeguro exige endereço de cobrança para checkout completo
            params.append('senderAddressStreet', street);
            params.append('senderAddressNumber', number);
            params.append('senderAddressDistrict', district);
            params.append('senderAddressCity', city);
            params.append('senderAddressState', state.toUpperCase());
            params.append('senderAddressCountry', 'BRA');
            params.append('senderAddressPostalCode', cleanCep);
        } else {
            // Se não tem endereço completo, usa endereço padrão
            console.log('⚠️  Endereço incompleto, usando endereço padrão...');
            
            // Endereço padrão que funciona
            const defaultAddress = {
                street: 'Av. Brig. Faria Lima',
                number: '1384',
                district: 'Jardim Paulistano',
                city: 'São Paulo',
                state: 'SP',
                postalCode: '01452002'
            };
            
            // Endereço de entrega
            params.append('shippingAddressStreet', defaultAddress.street);
            params.append('shippingAddressNumber', defaultAddress.number);
            params.append('shippingAddressDistrict', defaultAddress.district);
            params.append('shippingAddressCity', defaultAddress.city);
            params.append('shippingAddressState', defaultAddress.state);
            params.append('shippingAddressCountry', 'BRA');
            params.append('shippingAddressPostalCode', defaultAddress.postalCode);
            
            // Endereço de cobrança (mesmo endereço)
            params.append('senderAddressStreet', defaultAddress.street);
            params.append('senderAddressNumber', defaultAddress.number);
            params.append('senderAddressDistrict', defaultAddress.district);
            params.append('senderAddressCity', defaultAddress.city);
            params.append('senderAddressState', defaultAddress.state);
            params.append('senderAddressCountry', 'BRA');
            params.append('senderAddressPostalCode', defaultAddress.postalCode);
        }

        console.log('=== DADOS PROCESSADOS E VALIDADOS ===');
        console.log(`Nome: ${name}`);
        console.log(`Email: ${email}`);
        console.log(`CPF: ${cleanCpf} (${cleanCpf.length} dígitos)`);
        console.log(`DDD: ${areaCode} | Telefone: ${phoneNumber} (${cleanPhone.length} dígitos total)`);
        console.log(`CEP: ${cleanCep} (${cleanCep.length} dígitos)`);
        console.log(`Valor: R$ ${amount}`);
        console.log(`Endereço: ${street || 'Usando padrão'}, ${number || 'N/A'} - ${district || 'N/A'}`);
        console.log(`Cidade: ${city || 'São Paulo'}/${state || 'SP'}`);

        console.log('\n=== TENTATIVA 1: POST COMPLETO ===');
        
        try {
            // Primeira tentativa: POST mais básico possível
            const postResponse = await axios({
                method: 'POST',
                url: 'https://ws.pagseguro.uol.com.br/v2/checkout',
                data: params.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            });

            console.log('✅ POST funcionou! Status:', postResponse.status);
            return await processResponse(postResponse, res);

        } catch (postError) {
            console.log('❌ POST falhou:', postError.response?.status, postError.message);
            
            // Segunda tentativa: GET (alguns serviços antigos aceitam GET)
            console.log('\n=== TENTATIVA 2: GET COMO FALLBACK ===');
            
            try {
                const getResponse = await axios({
                    method: 'GET',
                    url: 'https://ws.pagseguro.uol.com.br/v2/checkout',
                    params: Object.fromEntries(params),
                    timeout: 30000
                });

                console.log('✅ GET funcionou! Status:', getResponse.status);
                return await processResponse(getResponse, res);

            } catch (getError) {
                console.log('❌ GET também falhou:', getError.response?.status);
                
                // Terceira tentativa: Endpoint de sessão (para debug)
                console.log('\n=== TENTATIVA 3: TESTE DE CREDENCIAIS ===');
                
                try {
                    const sessionResponse = await axios({
                        method: 'POST',
                        url: 'https://ws.pagseguro.uol.com.br/v2/sessions',
                        params: {
                            email: process.env.PAGSEGURO_EMAIL,
                            token: process.env.PAGSEGURO_TOKEN
                        },
                        timeout: 15000
                    });

                    console.log('✅ Credenciais OK! Status:', sessionResponse.status);
                    console.log('Sessão criada:', sessionResponse.data);
                    
                    // Se chegou aqui, credenciais estão OK mas checkout tem problema
                    throw new Error('Credenciais válidas mas checkout rejeitado. Possível problema de conta ou configuração.');

                } catch (sessionError) {
                    console.log('❌ Credenciais inválidas:', sessionError.response?.status);
                    throw new Error(`Credenciais inválidas: ${sessionError.response?.status} - ${sessionError.message}`);
                }
            }
        }

    } catch (error) {
        console.error('\n=== ERRO FINAL ===');
        console.error('Tipo:', error.constructor.name);
        console.error('Mensagem:', error.message);
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
            console.error('Data:', error.response.data?.substring(0, 500) + '...');
        }

        // Análise do erro
        let userMessage = 'Erro desconhecido';
        let suggestions = [];

        if (error.message.includes('406')) {
            userMessage = 'PagSeguro rejeitou a requisição (406)';
            suggestions = [
                'Verifique se as credenciais são de PRODUÇÃO',
                'Verifique se a conta PagSeguro está ativa',
                'Confirme se todos os dados estão corretos'
            ];
        } else if (error.message.includes('401')) {
            userMessage = 'Credenciais inválidas (401)';
            suggestions = [
                'Verifique email e token no arquivo .env',
                'Confirme se são credenciais de PRODUÇÃO',
                'Regenere o token se necessário'
            ];
        } else if (error.message.includes('timeout')) {
            userMessage = 'Timeout na comunicação com PagSeguro';
            suggestions = ['Tente novamente em alguns minutos'];
        }

        res.status(500).json({
            error: userMessage,
            suggestions: suggestions,
            technical_details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Função para processar resposta do PagSeguro
async function processResponse(response, res) {
    console.log('\n=== PROCESSANDO RESPOSTA ===');
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers['content-type']);
    console.log('Data:', response.data.substring(0, 200) + '...');

    if (response.status !== 200) {
        throw new Error(`PagSeguro retornou status ${response.status}`);
    }

    // Parse XML
    const parser = new DOMParser();
    const xml = parser.parseFromString(response.data, 'text/xml');

    // Verifica erros
    const errors = xml.getElementsByTagName('error');
    if (errors.length > 0) {
        let errorMsg = 'Erros do PagSeguro:\n';
        for (let i = 0; i < errors.length; i++) {
            const code = errors[i].getElementsByTagName('code')[0]?.textContent;
            const message = errors[i].getElementsByTagName('message')[0]?.textContent;
            errorMsg += `[${code}] ${message}\n`;
        }
        throw new Error(errorMsg);
    }

    // Extrai código
    const codeElement = xml.getElementsByTagName('code')[0];
    if (!codeElement) {
        throw new Error('Código do checkout não encontrado na resposta');
    }

    const checkoutCode = codeElement.textContent;
    const redirectUrl = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${checkoutCode}`;

    console.log('✅ Checkout criado:', checkoutCode);
    console.log('URL:', redirectUrl);

    return res.json({
        success: true,
        checkout_code: checkoutCode,
        redirect_url: redirectUrl,
        message: 'Checkout criado com sucesso!',
        timestamp: new Date().toISOString()
    });
}

// Rota de teste de credenciais
app.get('/test-credentials', async (req, res) => {
    try {
        const response = await axios.post('https://ws.pagseguro.uol.com.br/v2/sessions', null, {
            params: {
                email: process.env.PAGSEGURO_EMAIL,
                token: process.env.PAGSEGURO_TOKEN
            }
        });

        res.json({
            success: true,
            message: 'Credenciais válidas!',
            session_data: response.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data
        });
    }
});

// Rotas de sucesso e notificação
app.get('/sucesso', (req, res) => {
    res.send(`
        <html>
            <head><title>Pagamento Realizado</title></head>
            <body style="font-family:Arial;text-align:center;padding:50px;background:#0a0a0a;color:#fff;">
                <div style="background:#00ff41;color:#000;padding:20px;border-radius:10px;display:inline-block;">
                    <h1>🎉 Pagamento Realizado!</h1>
                    <p>Obrigado por escolher o Magic Germinator!</p>
                </div>
            </body>
        </html>
    `);
});

app.post('/api/notification', (req, res) => {
    console.log('\n=== NOTIFICAÇÃO RECEBIDA ===');
    console.log('Headers:', req.headers);
    console.log('Query:', req.query);
    console.log('Body:', req.body);
    res.status(200).send('OK');
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 MAGIC GERMINATOR - VERSÃO ULTRA SIMPLES');
    console.log(`📍 Porta: ${PORT}`);
    console.log(`📧 Email: ${process.env.PAGSEGURO_EMAIL || '❌ NÃO CONFIGURADO'}`);
    console.log(`🔑 Token: ${process.env.PAGSEGURO_TOKEN ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO'}`);
    console.log(`🔗 Teste: http://localhost:${PORT}/test-credentials`);
    console.log('\n📋 ESTRATÉGIA DE DEBUG:');
    console.log('1. Tenta POST padrão');
    console.log('2. Se falhar, tenta GET');
    console.log('3. Se falhar, testa credenciais');
    console.log('4. Reporta diagnóstico completo');
    console.log('=====================================\n');
});