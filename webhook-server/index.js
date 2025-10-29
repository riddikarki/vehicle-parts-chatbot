// index.js
// Main webhook server for WhatsApp chatbot

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const conversationManager = require('./conversationManager');
const claudeOrchestrator = require('./claudeOrchestrator');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Satkam Vehicle Parts Chatbot is running!',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// WHATSAPP WEBHOOK VERIFICATION
// ==========================================

app.get('/whatsapp-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = 'satkam_webhook_token_2025'; // You can change this

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// ==========================================
// WHATSAPP WEBHOOK - RECEIVE MESSAGES
// ==========================================

app.post('/whatsapp-webhook', async (req, res) => {
  try {
    console.log('📨 Received webhook:', JSON.stringify(req.body, null, 2));

    // Acknowledge receipt immediately
    res.sendStatus(200);

    // Check if this is a message event
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) {
      console.log('ℹ️ Not a message event, ignoring');
      return;
    }

    // Extract message details
    const message = value.messages[0];
    const from = message.from; // Customer's phone number
    const messageText = message.text?.body;
    const messageType = message.type;

    console.log(`📱 Message from: ${from}`);
    console.log(`💬 Message: ${messageText}`);
    console.log(`📋 Type: ${messageType}`);

    // Only process text messages for now
    if (messageType !== 'text') {
      console.log('ℹ️ Not a text message, ignoring');
      return;
    }

    // Process the message
    await handleMessage(from, messageText);

  } catch (error) {
    console.error('❌ Error in webhook:', error);
  }
});

// ==========================================
// MAIN MESSAGE HANDLER
// ==========================================

async function handleMessage(phoneNumber, messageText) {
  try {
    console.log(`\n🤖 Processing message from ${phoneNumber}: "${messageText}"`);
    
    // Step 1: Get or create conversation session
    console.log('📍 Step 1: Getting session...');
    const session = await conversationManager.getOrCreateSession(phoneNumber);
    console.log(`✅ Session ID: ${session.sessionId}`);
    
    if (session.customer) {
      console.log(`👤 Customer: ${session.customer.name} (${session.customer.customer_grade} - ${session.customer.base_discount_percentage}% discount)`);
    } else {
      console.log(`👤 New/Unknown customer`);
    }
    
    // Step 2: Get conversation history
    console.log('📍 Step 2: Getting conversation history...');
    const history = await conversationManager.getConversationHistory(session.sessionId, 10);
    console.log(`✅ Loaded ${history.length} previous messages`);
    
    // Step 3: Log incoming message
    console.log('📍 Step 3: Logging user message...');
await conversationManager.logMessage(
  session.sessionId,
  phoneNumber,
  session.customer?.id || null,
  'user',
  messageText
);
    
    // Step 4: Let Claude handle the conversation
    console.log('📍 Step 4: Asking Claude to respond...');
    const result = await claudeOrchestrator.handleConversation(
      messageText,
      session,
      history
    );
    
    console.log(`✅ Claude responded: "${result.response.substring(0, 100)}..."`);
    
    // Step 5: Save updated context (cart, etc.)
    console.log('📍 Step 5: Saving updated context...');
    await conversationManager.saveContext(session.sessionId, result.updatedContext);
    
    // Step 6: Log bot response
    console.log('📍 Step 6: Logging bot message...');
await conversationManager.logMessage(
  session.sessionId,
  phoneNumber,
  session.customer?.id || null,
  'bot',
  result.response
);
    
    // Step 7: Send response via WhatsApp
    console.log('📍 Step 7: Sending WhatsApp message...');
    await sendWhatsAppMessage(phoneNumber, result.response);
    
    console.log('✅ Message processed successfully!\n');
    
  } catch (error) {
    console.error('❌ Error in handleMessage:', error);
    
    // Send error message to user
    try {
      await sendWhatsAppMessage(
        phoneNumber,
        "Sorry, I encountered an error. Please try again or contact us at +977 985-1069717."
      );
    } catch (sendError) {
      console.error('❌ Failed to send error message:', sendError);
    }
  }
}

// ==========================================
// SEND WHATSAPP MESSAGE
// ==========================================

async function sendWhatsAppMessage(to, text) {
  try {
    const response = await axios.post(
      process.env.WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ WhatsApp message sent successfully');
    return response.data;
    
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀 ========================================');
  console.log('🚀 Satkam Vehicle Parts Chatbot Server');
  console.log('🚀 ========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/health`);
  console.log(`🚀 Webhook URL: http://localhost:${PORT}/whatsapp-webhook`);
  console.log('🚀 ========================================');
  console.log('🚀 Status: Ready to receive messages!');
  console.log('🚀 Waiting for WhatsApp messages...\n');
});