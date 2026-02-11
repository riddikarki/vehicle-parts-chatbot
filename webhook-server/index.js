// index.js
// Main webhook server for WhatsApp chatbot

const express = require('express');
const path = require('path');
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
// ADMIN API ROUTES
// ==========================================

// Simple admin auth middleware
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'satkam2026';

function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Get all config
app.get('/admin/config', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bot_config')
      .select('*')
      .order('id');
    
    if (error) throw error;
    res.json({ success: true, config: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a config value
app.put('/admin/config/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    const { data, error } = await supabase
      .from('bot_config')
      .update({ 
        config_value: value, 
        updated_at: new Date().toISOString(),
        updated_by: 'admin'
      })
      .eq('config_key', key)
      .select()
      .single();
    
    if (error) throw error;
    
    // Reload config cache
    await claudeOrchestrator.reloadConfig();
    
    res.json({ success: true, updated: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force reload config
app.post('/admin/reload-config', adminAuth, async (req, res) => {
  try {
    const config = await claudeOrchestrator.reloadConfig();
    res.json({ success: true, message: 'Config reloaded', keys: Object.keys(config) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Recent orders
app.get('/admin/orders', adminAuth, async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('order_date', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    res.json({ success: true, orders: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Recent conversations
app.get('/admin/conversations', adminAuth, async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const { data, error } = await supabase
      .from('conversation_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    res.json({ success: true, conversations: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bot stats
app.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { count: messagesCount } = await supabase
      .from('conversation_logs')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', today);
    
    const { count: sessionsCount } = await supabase
      .from('chatbot_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    
    const { count: ordersCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('order_date', today);
    
    res.json({
      success: true,
      stats: {
        messages_today: messagesCount || 0,
        active_sessions: sessionsCount || 0,
        orders_today: ordersCount || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve admin dashboard
app.use('/admin/dashboard', express.static(path.join(__dirname, 'admin')));

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
  console.log(`🚀 Admin API: http://localhost:${PORT}/admin/config?password=${ADMIN_PASSWORD}`);
  console.log(`🚀 Admin Dashboard: http://localhost:${PORT}/admin/dashboard`);
  console.log('🚀 ========================================');
  console.log('🚀 Status: Ready to receive messages!');
  console.log('🚀 Waiting for WhatsApp messages...\n');
});
