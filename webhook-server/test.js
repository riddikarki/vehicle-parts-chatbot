// test.js - Simulate WhatsApp message locally

const axios = require('axios');

async function testMessage() {
  try {
    console.log('📨 Sending test message...\n');
    
    const testPayload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "9779851069717", // Your business phone
              type: "text",
              text: {
                body: "Hello! I need brake pads for Toyota Corolla"
              }
            }]
          }
        }]
      }]
    };
    
    const response = await axios.post(
      'http://localhost:3000/whatsapp-webhook',
      testPayload,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('✅ Test message sent!');
    console.log('Response:', response.status);
    console.log('\n👀 Check your server console for processing logs...\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testMessage();