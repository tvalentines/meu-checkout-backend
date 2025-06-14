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

// Função para validar CPF (básica)
function isValidCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    
    // Verifica sequências inválidas
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    
    return true; // Validação básica para teste
}

// Rota para gerar checkout PagSeguro - VERSÃO CORRIGIDA
app.post('/api/pix', async (req, res) => {
    console.log('\n=== NOVA REQUISIÇÃO DE CHECKOUT ===');
    console.log('Dados recebidos:', req.body);

    const { amount, description, reference, name, email, cpf, phone, street, number, district, city, state, postalCode } = req.body;

    // Validações básicas mais rigorosas
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Valor deve ser um número positivo" });
    }

    if (!name || name.length < 2) {
        return res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres" });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "E-mail inválido" });
    }

    // Limpa e valida CPF
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : '';
    if (!cleanCpf || !isValidCPF(cleanCpf)) {
        return res.status(400).json({ error: "CPF inválido" });
    }

    // Limpa e valida telefone
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 11) {
        return res.status(400).json({ error: "Telefone deve ter 10 ou 11 dígitos" });
    }

    // Valida endereço
    if (!street || !number || !district || !city || !state) {
        return res.status(400).json({ error: "Todos os campos de endereço são obrigatórios" });
    }

    // Limpa e valida CEP
    const cleanCep = postalCode ? postalCode.replace(/\D/g, '') : '';
    if (!cleanCep || cleanCep.length !== 8) {
        return res.status(400).json({ error: "CEP deve ter 8 dígitos" });
    }

    // Valida estado
    const validStates = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
    if (!validStates.includes(state.toUpperCase())) {
        return res.status(400).json({ error: "Estado inválido" });
    }

    try {
        // Processa telefone (DDD + número)
        let areaCode, phoneNumber;
        if (cleanPhone.length === 11) {
            areaCode = cleanPhone.slice(0, 2);
            phoneNumber = cleanPhone.slice(2);
        } else {
            areaCode = cleanPhone.slice(0, 2);
            phoneNumber = cleanPhone.slice(2);
        }

        console.log('\n=== DADOS PROCESSADOS ===');
        console.log(`Nome: ${name}`);
        console.log(`Email: ${email}`);
        console.log(`CPF: ${cleanCpf}`);
        console.log(`DDD: ${areaCode} | Telefone: ${phoneNumber}`);
        console.log(`Endereço: ${street}, ${number} - ${district}`);
        console.log(`Cidade: ${city}/${state}`);
        console.log(`CEP: ${cleanCep}`);
        console.log(`Valor: R$ ${amount.toFixed(2)}`);

        // Monta os dados EXATAMENTE como o PagSeguro espera
        const postData = new URLSearchParams();
        
        // Credenciais - OBRIGATÓRIO
        postData.append('email', process.env.PAGSEGURO_EMAIL);
        postData.append('token', process.env.PAGSEGURO_TOKEN);
        
        // Configuração - OBRIGATÓRIO
        postData.append('currency', 'BRL');
        
        // Item - OBRIGATÓRIO (numeração começa em 1)
        postData.append('itemId1', '0001');
        postData.append('itemDescription1', description || 'Magic Germinator Professional');
        postData.append('itemAmount1', amount.toFixed(2));
        postData.append('itemQuantity1', '1');
        postData.append('itemWeight1', '1000'); // Peso em gramas
        
        // Referência - OPCIONAL mas recomendado
        postData.append('reference', reference || `MG${Date.now()}`);
        
        // Comprador - OBRIGATÓRIO
        postData.append('senderName', name);
        postData.append('senderEmail', email);
        postData.append('senderCPF', cleanCpf);
        postData.append('senderAreaCode', areaCode);
        postData.append('senderPhone', phoneNumber);
        
        // Frete - OBRIGATÓRIO
        postData.append('shippingType', '3'); // Tipo não especificado
        postData.append('shippingCost', '0.00');
        
        // Endereço de entrega - OBRIGATÓRIO
        postData.append('shippingAddressRequired', 'true');
        postData.append('shippingAddressStreet', street);
        postData.append('shippingAddressNumber', number);
        postData.append('shippingAddressComplement', ''); // Vazio mas necessário
        postData.append('shippingAddressDistrict', district);
        postData.append('shippingAddressPostalCode', cleanCep);
        postData.append('shippingAddressCity', city);
        postData.append('shippingAddressState', state.toUpperCase());
        postData.append('shippingAddressCountry', 'BRA');
        
        // URLs de retorno - OPCIONAL mas recomendado
        postData.append('redirectURL', 'https://meu-checkout-backend-1.onrender.com/sucesso');
        postData.append('notificationURL', 'https://meu-checkout-backend-1.onrender.com/api/notification');
        
        // Configurações extras - OPCIONAL
        postData.append('maxUses', '1');
        postData.append('maxAge', '120');

        console.log('\n=== PAYLOAD COMPLETO ===');
        console.log(postData.toString());

        // Determina URL baseada no ambiente - SEMPRE PRODUÇÃO AGORA
        const apiUrl = 'https://ws.pagseguro.uol.com.br/v2/checkout';

        console.log(`\n=== ENVIANDO PARA PRODUÇÃO: ${apiUrl} ===`);

        // Faz a requisição
        const response = await axios.post(apiUrl, postData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=ISO-8859-1',
                'Accept': 'application/vnd.pagseguro.com.br.v1+xml;charset=ISO-8859-1'
            },
            timeout: 60000, // 60 segundos
            validateStatus: function (status) {
                return status < 500; // Resolve para qualquer status < 500
            }
        });

        console.log('\n=== RESPOSTA DO PAGSEGURO ===');
        console.log('Status:', response.status);
        console.log('Headers:', response.headers);
        console.log('Data:', response.data);

        // Se o status não for 200, trata como erro
        if (response.status !== 200) {
            throw new Error(`PagSeguro retornou status ${response.status}: ${response.data}`);
        }

        // Parse da resposta XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response.data, 'text/xml');

        // Verifica se há erros no XML
        const errors = xmlDoc.getElementsByTagName('error');
        if (errors.length > 0) {
            let errorMessage = 'Erros do PagSeguro:\n';
            for (let i = 0; i < errors.length; i++) {
                const code = errors[i].getElementsByTagName('code')[0]?.textContent || 'N/A';
                const message = errors[i].getElementsByTagName('message')[0]?.textContent || 'N/A';
                errorMessage += `• [${code}] ${message}\n`;
            }
            console.error('\n=== ERROS DO PAGSEGURO ===');
            console.error(errorMessage);
            
            return res.status(400).json({
                error: 'Dados rejeitados pelo PagSeguro',
                details: errorMessage,
                raw_response: response.data
            });
        }

        // Extrai o código do checkout
        const codeElement = xmlDoc.getElementsByTagName('code')[0];
        if (!codeElement || !codeElement.textContent) {
            throw new Error('Código do checkout não encontrado na resposta');
        }

        const checkoutCode = codeElement.textContent;
        const dateElement = xmlDoc.getElementsByTagName('date')[0];
        const checkoutDate = dateElement ? dateElement.textContent : null;

        console.log('\n=== CHECKOUT CRIADO ===');
        console.log('Código:', checkoutCode);
        console.log('Data:', checkoutDate);

        // Monta URL de redirecionamento - SEMPRE PRODUÇÃO
        const redirectBaseUrl = 'https://pagseguro.uol.com.br/v2/checkout/payment.html';
            
        const redirectUrl = `${redirectBaseUrl}?code=${checkoutCode}`;

        console.log('URL de redirecionamento:', redirectUrl);

        // Retorna sucesso
        res.json({
            success: true,
            checkout_code: checkoutCode,
            checkout_date: checkoutDate,
            redirect_url: redirectUrl,
            environment: 'PRODUÇÃO - TRANSAÇÕES REAIS'
        });

    } catch (error) {
        console.error('\n=== ERRO CRÍTICO ===');
        console.error('Tipo:', error.constructor.name);
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        
        if (error.response) {
            console.error('Status da resposta:', error.response.status);
            console.error('Headers da resposta:', error.response.headers);
            console.error('Dados da resposta:', error.response.data);
        }

        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message,
            details: error.response?.data || 'Sem detalhes adicionais'
        });
    }
});

// Rota de sucesso
app.get('/sucesso', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Pagamento Realizado</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        background: #0a0a0a; 
                        color: #fff; 
                        text-align: center; 
                        padding: 50px;
                    }
                    .success { 
                        background: #00ff41; 
                        color: #000; 
                        padding: 20px; 
                        border-radius: 10px; 
                        display: inline-block;
                    }
                </style>
            </head>
            <body>
                <div class="success">
                    <h1>🎉 Pagamento Realizado!</h1>
                    <p>Obrigado por escolher o Magic Germinator!</p>
                    <p>Você receberá um e-mail de confirmação em breve.</p>
                </div>
            </body>
        </html>
    `);
});

// Rota para notificações
app.post('/api/notification', (req, res) => {
    console.log('\n=== NOTIFICAÇÃO RECEBIDA ===');
    console.log('Headers:', req.headers);
    console.log('Query params:', req.query);
    console.log('Body:', req.body);
    
    res.status(200).send('OK');
});

// Middleware de erro global
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
    });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 SERVIDOR MAGIC GERMINATOR - PRODUÇÃO ATIVA');
    console.log(`📍 Porta: ${PORT}`);
    console.log(`📧 Email PagSeguro: ${process.env.PAGSEGURO_EMAIL || '❌ NÃO CONFIGURADO'}`);
    console.log(`🔑 Token configurado: ${process.env.PAGSEGURO_TOKEN ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`🌍 Ambiente: PRODUÇÃO - TRANSAÇÕES REAIS`);
    console.log(`🔗 URL de teste: http://localhost:${PORT}`);
    console.log('\n🔴 ATENÇÃO - MODO PRODUÇÃO:');
    console.log('1. Use credenciais REAIS do PagSeguro');
    console.log('2. Transações serão COBRADAS de verdade');
    console.log('3. Use dados REAIS dos clientes');
    console.log('4. Monitore os logs para acompanhar vendas');
    console.log('=====================================\n');
});