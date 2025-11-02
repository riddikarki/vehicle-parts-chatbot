// conversationManager.js
// Purpose: Track customer conversations and remember context (FIXED FOR ACTUAL SCHEMA)

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ==========================================
// CONVERSATION STATE MANAGEMENT
// ==========================================

/**
 * Get existing session or create new one
 * @param {string} phoneNumber - Customer's WhatsApp number
 * @returns {Object} Session data with customer info
 */
async function getOrCreateSession(phoneNumber) {
  try {
    console.log(`📞 Getting session for: ${phoneNumber}`);
    
    // Step 1: Find customer by phone
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phoneNumber)
      .eq('is_active', true)
      .single();
    
    if (customerError && customerError.code !== 'PGRST116') {
      throw customerError;
    }
    
    // Step 2: Check for active session
    const { data: existingSession, error: sessionError } = await supabase
      .from('chatbot_sessions')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    
    if (sessionError && sessionError.code !== 'PGRST116') {
      throw sessionError;
    }
    
    // Step 3: Return existing or create new session
    if (existingSession) {
      console.log(`✅ Found existing session: ${existingSession.id}`);
      return {
        sessionId: existingSession.id,
        phoneNumber: phoneNumber,
        customer: customer,
        context: existingSession.context || {},
        isNewCustomer: !customer
      };
    }
    
    // Step 4: Create new session (FIXED - matches actual schema)
    const { data: newSession, error: createError } = await supabase
      .from('chatbot_sessions')
      .insert({
        phone_number: phoneNumber,
        customer_id: customer?.id || null,
        conversation_state: 'greeting',
        language: 'en',
        context: {},
        is_active: true
      })
      .select()
      .single();
    
    if (createError) throw createError;
    
    console.log(`✨ Created new session: ${newSession.id}`);
    
    return {
      sessionId: newSession.id,
      phoneNumber: phoneNumber,
      customer: customer,
      context: {},
      isNewCustomer: !customer
    };
    
  } catch (error) {
    console.error('❌ Error in getOrCreateSession:', error);
    throw error;
  }
}

/**
 * Save conversation context (what customer is doing)
 * @param {string} sessionId - Session UUID
 * @param {Object} context - Context data to save
 */
async function saveContext(sessionId, context) {
  try {
    console.log(`💾 Saving context for session: ${sessionId}`);
    
    const { error } = await supabase
      .from('chatbot_sessions')
      .update({ 
        context: context,
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);
    
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('❌ Error in saveContext:', error);
    throw error;
  }
}

/**
 * Log message to conversation history
 * @param {string} sessionId - Session UUID
 * @param {string} phoneNumber - Customer's phone
 * @param {string} customerId - Customer UUID (optional)
 * @param {string} messageType - 'user' or 'bot'
 * @param {string} message - Message content
 */
async function logMessage(sessionId, phoneNumber, customerId, messageType, message) {
  try {
    const { error } = await supabase
      .from('conversation_logs')
      .insert({
        session_id: sessionId,
        phone_number: phoneNumber,
        customer_id: customerId || null,
        message_type: messageType,
        message_text: message,
        language: 'en'
      });
    
    if (error) throw error;
    
    console.log(`📝 Logged ${messageType} message`);
    return true;
  } catch (error) {
    console.error('❌ Error in logMessage:', error);
    // Don't throw - logging failure shouldn't stop the conversation
    return false;
  }
}

/**
 * Get recent conversation history
 * @param {string} sessionId - Session UUID
 * @param {number} limit - Number of messages to retrieve
 * @returns {Array} Recent messages
 */
async function getConversationHistory(sessionId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('conversation_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    // Return in chronological order (oldest first)
    return data ? data.reverse() : [];
  } catch (error) {
    console.error('❌ Error in getConversationHistory:', error);
    return [];
  }
}

/**
 * End conversation session
 * @param {string} sessionId - Session UUID
 */
async function endSession(sessionId) {
  try {
    console.log(`👋 Ending session: ${sessionId}`);
    
    const { error } = await supabase
      .from('chatbot_sessions')
      .update({ 
        is_active: false,
        session_end: new Date().toISOString()
      })
      .eq('id', sessionId);
    
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('❌ Error in endSession:', error);
    throw error;
  }
}

// Export functions
module.exports = {
  getOrCreateSession,
  saveContext,
  logMessage,
  getConversationHistory,
  endSession
};