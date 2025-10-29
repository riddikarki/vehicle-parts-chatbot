// webhook-server/index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

// Initialize connections
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
});

console.log('🔌 Initializing connections...');
console.log('✅ Supabase:', process.env.SUPABASE_URL ? 'Connected' : '❌ Missing');
console.log('✅ Claude:', process.env.CLAUDE_API_KEY ? 'Connected' : '❌ Missing');
console.log('✅ WhatsApp:', process.env.WHATSAPP_API_KEY ? 'Connected' : '❌ Missing');

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        connections: {
            supabase: process.env.SUPABASE_URL ? '✅' : '❌',
            claude: process.env.CLAUDE_API_KEY ? '✅' : '❌',
            whatsapp: process.env.WHATSAPP_API_KEY ? '✅' : '❌'
        }
    });
});

// ==========================================
// WHATSAPP WEBHOOK ENDPOINT
// ==========================================
app.post('/whatsapp-webhook', async (req, res) => {
    try {
        console.log('📨 Received webhook:', JSON.stringify(req.body, null, 2));
        
        // Extract message data
        const { from, text, timestamp } = req.body;
        
        if (!from || !text) {
            console.log('⚠️  Invalid webhook data');
            return res.status(400).json({ error: 'Missing from or text' });
        }
        
        console.log(`💬 Message from ${from}: "${text}"`);
        
        // Process message
        const response = await handleMessage(from, text);
        
        console.log(`✅ Response: "${response}"`);
        
        // Send response back to WhatsApp
        await sendWhatsAppMessage(from, response);
        
        res.status(200).json({ success: true });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// HANDLE MESSAGE LOGIC
// ==========================================
async function handleMessage(phone, message) {
    console.log(`🔍 Looking up customer: ${phone}`);
    
    // Get customer from Supabase
    const { data: customer, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .single();
    
    if (error || !customer) {
        console.log('⚠️  Customer not found');
        return "Welcome! I don't recognize your number. Please contact us to register.";
    }
    
    console.log(`✅ Found customer: ${customer.name} (${customer.customer_grade})`);
    
    // Ask Claude to respond
    const claudeResponse = await askClaude(customer, message);
    
    return claudeResponse;
}

// ==========================================
// ASK CLAUDE AI
// ==========================================
async function askClaude(customer, message) {
    console.log('🤖 Asking Claude...');
    
    const prompt = `
You are a helpful vehicle parts sales assistant.

CUSTOMER CONTEXT:
- Name: ${customer.name}
- Customer Code: ${customer.customer_code}
- Grade: ${customer.customer_grade}
- Discount: ${customer.base_discount_percentage}%
- Balance: Rs. ${customer.balance_lcy}

USER MESSAGE: "${message}"

Instructions:
1. Be friendly and professional
2. Mention their discount percentage if relevant
3. If they're asking for products, acknowledge and say you'll search
4. Keep responses concise (2-3 sentences)
5. Use their name naturally

Respond in a natural, conversational way.
`;

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [{
            role: 'user',
            content: prompt
        }]
    });
    
    const reply = response.content[0].text;
    console.log('✅ Claude responded');
    
    return reply;
}

// ==========================================
// SEND MESSAGE TO WHATSAPP
// ==========================================
// Replace the sendWhatsAppMessage function in your index.js with this version:

async function sendWhatsAppMessage(to, message) {
    console.log(`\n========================================`);
    console.log(`📤 SENDING TO WHATSAPP`);
    console.log(`========================================`);
    console.log(`To: ${to}`);
    console.log(`Message: "${message}"`);
    
    // Clean phone number
    const cleanPhone = to.replace(/^\+/, '').replace(/\s/g, '');
    console.log(`Cleaned phone: ${cleanPhone}`);
    
    // Check environment variables
    console.log(`\nEnvironment Check:`);
    console.log(`API URL: ${process.env.WHATSAPP_API_URL}`);
    console.log(`API Key exists: ${process.env.WHATSAPP_API_KEY ? 'YES' : 'NO'}`);
    console.log(`API Key length: ${process.env.WHATSAPP_API_KEY?.length || 0}`);
    console.log(`API Key first 20 chars: ${process.env.WHATSAPP_API_KEY?.substring(0, 20)}...`);
    
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: {
            preview_url: false,
            body: message
        }
    };
    
    console.log(`\nPayload:`);
    console.log(JSON.stringify(payload, null, 2));
    
    try {
        console.log(`\n🚀 Making API call to Meta...`);
        
        const response = await axios.post(
            process.env.WHATSAPP_API_URL,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ SUCCESS!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        console.log(`========================================\n`);
        return response.data;
        
    } catch (error) {
        console.error('\n❌ WHATSAPP API ERROR:');
        console.error(`========================================`);
        console.error('Status:', error.response?.status);
        console.error('Status Text:', error.response?.statusText);
        console.error('Error Data:', JSON.stringify(error.response?.data, null, 2));
        console.error('Request URL:', process.env.WHATSAPP_API_URL);
        console.error('Request Headers:', {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY?.substring(0, 20)}...`,
            'Content-Type': 'application/json'
        });
        console.error('Request Body:', JSON.stringify(payload, null, 2));
        console.error(`========================================\n`);
        throw error;
    }
}

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║   🚀 WEBHOOK SERVER RUNNING           ║
╚═══════════════════════════════════════╝

Port: ${PORT}
Environment: ${process.env.NODE_ENV}

Endpoints:
- Health Check: http://localhost:${PORT}/health
- WhatsApp Webhook: http://localhost:${PORT}/whatsapp-webhook

Connections:
- Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}
- Claude API: ${process.env.CLAUDE_API_KEY ? '✅' : '❌'}
- WhatsApp API: ${process.env.WHATSAPP_API_KEY ? '✅' : '❌'}

Ready to receive messages! 📨
`);
});