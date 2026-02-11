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

  const VERIFY_TOKEN = 'satkam_webhook_token_2025';

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
    res.sendStatus(200);

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) {
      console.log('ℹ️ Not a message event, ignoring');
      return;
    }

    const message = value.messages[0];
    const from = message.from;
    const messageText = message.text?.body;
    const messageType = message.type;

    console.log(`📱 Message from: ${from}`);
    console.log(`💬 Message: ${messageText}`);
    console.log(`📋 Type: ${messageType}`);

    if (messageType !== 'text') {
      console.log('ℹ️ Not a text message, ignoring');
      return;
    }

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
    
    console.log('📍 Step 1: Getting session...');
    const session = await conversationManager.getOrCreateSession(phoneNumber);
    console.log(`✅ Session ID: ${session.sessionId}`);
    
    if (session.customer) {
      console.log(`👤 Customer: ${session.customer.name} (${session.customer.customer_grade} - ${session.customer.base_discount_percentage}% discount)`);
    } else {
      console.log(`👤 New/Unknown customer`);
    }
    
    console.log('📍 Step 2: Getting conversation history...');
    const history = await conversationManager.getConversationHistory(session.sessionId, 10);
    console.log(`✅ Loaded ${history.length} previous messages`);
    
    console.log('📍 Step 3: Logging user message...');
    await conversationManager.logMessage(
      session.sessionId, phoneNumber, session.customer?.id || null, 'user', messageText
    );
    
    console.log('📍 Step 4: Asking Claude to respond...');
    const result = await claudeOrchestrator.handleConversation(messageText, session, history);
    console.log(`✅ Claude responded: "${result.response.substring(0, 100)}..."`);
    
    console.log('📍 Step 5: Saving updated context...');
    await conversationManager.saveContext(session.sessionId, result.updatedContext);
    
    console.log('📍 Step 6: Logging bot message...');
    await conversationManager.logMessage(
      session.sessionId, phoneNumber, session.customer?.id || null, 'bot', result.response
    );
    
    console.log('📍 Step 7: Sending WhatsApp message...');
    await sendWhatsAppMessage(phoneNumber, result.response);
    
    console.log('✅ Message processed successfully!\n');
    
  } catch (error) {
    console.error('❌ Error in handleMessage:', error);
    try {
      await sendWhatsAppMessage(phoneNumber, "Sorry, I encountered an error. Please try again or contact us at +977 985-1069717.");
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
// ADMIN AUTH MIDDLEWARE
// ==========================================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'satkam2026';

function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ==========================================
// ADMIN - STATS
// ==========================================

app.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [messagesRes, sessionsRes, ordersRes, productsRes] = await Promise.all([
      supabase.from('conversation_logs').select('*', { count: 'exact', head: true }).gte('timestamp', today),
      supabase.from('chatbot_sessions').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('order_date', today),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true)
    ]);
    
    res.json({
      success: true,
      stats: {
        messages_today: messagesRes.count || 0,
        active_sessions: sessionsRes.count || 0,
        orders_today: ordersRes.count || 0,
        total_products: productsRes.count || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - ORDERS (with customer names)
// ==========================================

app.get('/admin/orders', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('order_date', { ascending: false })
      .limit(limit);
    
    if (error) throw error;

    // Get customer names
    const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
    let customerMap = {};
    
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, customer_code, name')
        .in('customer_code', customerIds);
      
      if (customers) {
        customers.forEach(c => {
          customerMap[c.customer_code] = c.name;
          customerMap[c.id] = c.name;
        });
      }

      const unmapped = customerIds.filter(id => !customerMap[id]);
      if (unmapped.length > 0) {
        const { data: customers2 } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', unmapped);
        
        if (customers2) {
          customers2.forEach(c => { customerMap[c.id] = c.name; });
        }
      }
    }

    const ordersWithNames = orders.map(o => ({
      ...o,
      customer_name: customerMap[o.customer_id] || o.customer_id || 'Unknown'
    }));
    
    res.json({ success: true, orders: ordersWithNames });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - CONVERSATIONS (with customer names)
// ==========================================

app.get('/admin/conversations', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    
    const { data: conversations, error } = await supabase
      .from('conversation_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;

    const phones = [...new Set(conversations.map(c => c.phone_number).filter(Boolean))];
    let phoneMap = {};
    
    if (phones.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('phone, name')
        .in('phone', phones);
      
      if (customers) {
        customers.forEach(c => { phoneMap[c.phone] = c.name; });
      }
    }

    const convsWithNames = conversations.map(c => ({
      ...c,
      customer_name: phoneMap[c.phone_number] || null
    }));
    
    res.json({ success: true, conversations: convsWithNames });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - BOT CONFIG
// ==========================================

app.get('/admin/config', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('bot_config').select('*').order('id');
    if (error) throw error;
    res.json({ success: true, config: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/admin/config/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    const { data, error } = await supabase
      .from('bot_config')
      .update({ config_value: value, updated_at: new Date().toISOString(), updated_by: 'admin' })
      .eq('config_key', key)
      .select()
      .single();
    
    if (error) throw error;
    if (claudeOrchestrator.reloadConfig) await claudeOrchestrator.reloadConfig();
    res.json({ success: true, updated: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/reload-config', adminAuth, async (req, res) => {
  try {
    if (claudeOrchestrator.reloadConfig) {
      const config = await claudeOrchestrator.reloadConfig();
      res.json({ success: true, message: 'Config reloaded', keys: Object.keys(config) });
    } else {
      res.json({ success: true, message: 'No config cache to reload' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - PRODUCTS (CRUD with all new fields)
// ==========================================

app.get('/admin/products', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    res.json({ success: true, products: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/products', adminAuth, async (req, res) => {
  try {
    const {
      product_code, name, category, description,
      vehicle_make, vehicle_model, unit_price, stock_quantity,
      brand, oem_number, supplier_name, min_order_quantity,
      weight, dimensions, expected_delivery_days,
      delivery_status_note, image_url
    } = req.body;
    
    if (!product_code || !name) {
      return res.status(400).json({ success: false, error: 'Product code and name are required' });
    }
    
    const { data, error } = await supabase
      .from('products')
      .insert({
        product_code, name, category, description,
        vehicle_make, vehicle_model,
        unit_price: unit_price || 0,
        stock_quantity: stock_quantity || 0,
        brand: brand || null,
        oem_number: oem_number || null,
        supplier_name: supplier_name || null,
        min_order_quantity: min_order_quantity || 1,
        weight: weight || null,
        dimensions: dimensions || null,
        expected_delivery_days: expected_delivery_days || null,
        delivery_status_note: delivery_status_note || null,
        image_url: image_url || null,
        is_active: true
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ success: true, product: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      product_code, name, category, description,
      vehicle_make, vehicle_model, unit_price, stock_quantity,
      brand, oem_number, supplier_name, min_order_quantity,
      weight, dimensions, expected_delivery_days,
      delivery_status_note, image_url
    } = req.body;
    
    const { data, error } = await supabase
      .from('products')
      .update({
        product_code, name, category, description,
        vehicle_make, vehicle_model,
        unit_price: unit_price || 0,
        stock_quantity: stock_quantity || 0,
        brand: brand || null,
        oem_number: oem_number || null,
        supplier_name: supplier_name || null,
        min_order_quantity: min_order_quantity || 1,
        weight: weight || null,
        dimensions: dimensions || null,
        expected_delivery_days: expected_delivery_days || null,
        delivery_status_note: delivery_status_note || null,
        image_url: image_url || null
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    res.json({ success: true, product: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id);
    
    if (error) throw error;
    res.json({ success: true, message: 'Product deleted' });
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
