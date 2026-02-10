// claudeOrchestrator.js
// Purpose: The AI brain that orchestrates conversations using Claude API
// UPDATED: Now loads system prompt from bot_config table (no redeploy needed to change behavior)

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const {
  searchProducts,
  calculatePrice,
  searchWorkshops,
  addToCart,
  calculateCartTotal,
  createOrder,
  getOrderStatus,
  getCustomerOrders
} = require('./databaseHelpers');

require('dotenv').config();

// Initialize Claude
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Initialize Supabase (for loading config)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ==========================================
// CONFIG CACHE (avoid DB call every message)
// ==========================================

let configCache = {};
let configLastLoaded = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // Reload config every 5 minutes

/**
 * Load all bot_config from Supabase (with caching)
 * @returns {Object} Key-value config object
 */
async function loadConfig() {
  const now = Date.now();
  
  // Return cache if still fresh
  if (Object.keys(configCache).length > 0 && (now - configLastLoaded) < CONFIG_CACHE_TTL) {
    return configCache;
  }
  
  try {
    console.log('⚙️ Loading bot config from database...');
    
    const { data, error } = await supabase
      .from('bot_config')
      .select('config_key, config_value, config_type');
    
    if (error) throw error;
    
    // Build config object
    const config = {};
    data.forEach(row => {
      let value = row.config_value;
      
      // Parse based on type
      if (row.config_type === 'number') value = Number(value);
      else if (row.config_type === 'boolean') value = value === 'true';
      else if (row.config_type === 'json') {
        try { value = JSON.parse(value); } catch(e) { /* keep as string */ }
      }
      
      config[row.config_key] = value;
    });
    
    configCache = config;
    configLastLoaded = now;
    
    console.log(`✅ Loaded ${data.length} config settings`);
    return config;
    
  } catch (error) {
    console.error('❌ Error loading config:', error);
    // Return cache even if stale, or empty object
    return configCache;
  }
}

/**
 * Force reload config (call this from admin API after saving changes)
 */
async function reloadConfig() {
  configLastLoaded = 0;
  return await loadConfig();
}

// ==========================================
// CLAUDE TOOL DEFINITIONS
// ==========================================

const tools = [
  {
    name: "search_products",
    description: "Search for vehicle parts/products. Can search by vehicle make/model, category (brake, engine, filter, etc), product code, or keyword. Returns list of products with prices. ALWAYS use this before discussing any products.",
    input_schema: {
      type: "object",
      properties: {
        vehicle_make: {
          type: "string",
          description: "Vehicle make/brand (e.g., Toyota, Honda, Hyundai)"
        },
        vehicle_model: {
          type: "string",
          description: "Vehicle model (e.g., Corolla, Civic, i20)"
        },
        category: {
          type: "string",
          description: "Product category (e.g., brake, engine, filter, suspension)"
        },
        product_code: {
          type: "string",
          description: "Specific product code if known"
        },
        keyword: {
          type: "string",
          description: "General keyword to search in product name/description"
        }
      }
    }
  },
  {
    name: "search_workshops",
    description: "Find vehicle repair workshops/garages by location. Returns workshop details including owner contact information.",
    input_schema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name (e.g., Kathmandu, Pokhara, Lalitpur)"
        },
        district: {
          type: "string",
          description: "District name"
        },
        zone: {
          type: "string",
          description: "Zone name"
        },
        keyword: {
          type: "string",
          description: "Search in workshop name or owner name"
        }
      }
    }
  },
  {
    name: "add_to_cart",
    description: "Add a product to the customer's shopping cart. MUST use this tool when customer wants to buy/add any product. Requires product_code and quantity.",
    input_schema: {
      type: "object",
      properties: {
        product_code: {
          type: "string",
          description: "The product code to add (e.g., BRK-TOY-COR-F001)"
        },
        quantity: {
          type: "number",
          description: "Quantity to add (default: 1)"
        }
      },
      required: ["product_code"]
    }
  },
  {
    name: "view_cart",
    description: "View the current shopping cart contents and total amount.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "place_order",
    description: "Place/confirm the order with items currently in cart. MUST use this tool immediately when customer says checkout, confirm, place order, done ordering, or similar. Do NOT ask for extra confirmation — just place it.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "check_order_status",
    description: "Check the status of an existing order by order number.",
    input_schema: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description: "The order number (e.g., ORD-1234567890)"
        }
      },
      required: ["order_number"]
    }
  },
  {
    name: "get_my_orders",
    description: "Get customer's recent order history.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent orders to retrieve (default: 5)"
        }
      }
    }
  }
];

// ==========================================
// PROCESS TOOL CALLS
// ==========================================

async function processToolCall(toolName, toolInput, session) {
  console.log(`🔧 Processing tool: ${toolName}`);
  
  try {
    switch (toolName) {
      case "search_products": {
        const products = await searchProducts(toolInput);
        
        // Apply customer discount to prices
        const productsWithDiscount = products.map(product => {
          const pricing = calculatePrice(
            product.unit_price, 
            session.customer?.base_discount_percentage || 0
          );
          return {
            ...product,
            original_price: pricing.originalPrice,
            discount: pricing.discount,
            final_price: pricing.finalPrice
          };
        });
        
        return {
          success: true,
          count: productsWithDiscount.length,
          products: productsWithDiscount
        };
      }
      
      case "search_workshops": {
        const workshops = await searchWorkshops(toolInput);
        return {
          success: true,
          count: workshops.length,
          workshops: workshops
        };
      }
      
      case "add_to_cart": {
        const currentCart = session.context.cart || [];
        const updatedCart = await addToCart(
          currentCart,
          toolInput.product_code,
          toolInput.quantity || 1
        );
        
        // Update session context
        session.context.cart = updatedCart;
        
        const cartSummary = calculateCartTotal(
          updatedCart,
          session.customer?.base_discount_percentage || 0
        );
        
        return {
          success: true,
          cart: updatedCart,
          summary: cartSummary
        };
      }
      
      case "view_cart": {
        const cart = session.context.cart || [];
        const summary = calculateCartTotal(
          cart,
          session.customer?.base_discount_percentage || 0
        );
        
        return {
          success: true,
          cart: cart,
          summary: summary
        };
      }
      
      case "place_order": {
        const orderCart = session.context.cart || [];
        
        if (orderCart.length === 0) {
          return {
            success: false,
            message: "Cart is empty. Cannot place order."
          };
        }
        
        if (!session.customer) {
          const config = await loadConfig();
          return {
            success: false,
            message: config.registration_message || "Please register first by calling +977 985-1069717."
          };
        }
        
        const orderSummary = calculateCartTotal(
          orderCart,
          session.customer.base_discount_percentage || 0
        );
        
        const order = await createOrder(
          session.customer.customer_code,
          orderCart,
          orderSummary.total
        );
        
        // Clear cart after order
        session.context.cart = [];
        
        return {
          success: true,
          order: order
        };
      }
      
      case "check_order_status": {
        const orderStatus = await getOrderStatus(toolInput.order_number);
        return {
          success: orderStatus !== null,
          order: orderStatus
        };
      }
      
      case "get_my_orders": {
        if (!session.customer) {
          return {
            success: false,
            message: "Customer not found."
          };
        }
        
        const orders = await getCustomerOrders(
          session.customer.customer_code,
          toolInput.limit || 5
        );
        
        return {
          success: true,
          orders: orders
        };
      }
      
      default:
        return {
          success: false,
          message: `Unknown tool: ${toolName}`
        };
    }
  } catch (error) {
    console.error(`❌ Error in tool ${toolName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// BUILD SYSTEM PROMPT (from database config)
// ==========================================

async function buildSystemPrompt(session, conversationHistory) {
  const customer = session.customer;
  const context = session.context;
  
  // Load config from database
  const config = await loadConfig();
  
  // Start with company info from config
  let prompt = (config.prompt_company_info || 'You are a vehicle parts assistant.') + '\n\n';

  // Add customer info if known
  if (customer) {
    prompt += `CUSTOMER INFO:
- Name: ${customer.name}
- Customer Code: ${customer.customer_code}
- City: ${customer.city || 'N/A'}
- Phone: ${customer.phone}
- Customer Grade: ${customer.customer_grade} (${customer.base_discount_percentage}% discount)
- Credit Limit: Rs. ${customer.credit_limit?.toLocaleString() || 'N/A'}
- Balance: Rs. ${customer.balance_lcy?.toLocaleString() || '0'}
- STATUS: ✅ REGISTERED CUSTOMER — Can place orders directly through chat

`;
  } else if (session.isNewCustomer) {
    prompt += `CUSTOMER INFO:
- New/Unknown customer (NOT in our database)
- Phone: ${session.phoneNumber}
- STATUS: ❌ UNREGISTERED — Cannot place orders
- They CAN browse products and search workshops
- If they try to order → "${config.registration_message || 'Please call +977 985-1069717 to register.'}"

`;
  }

  // Add cart info if exists
  if (context.cart && context.cart.length > 0) {
    const cartSummary = calculateCartTotal(
      context.cart,
      customer?.base_discount_percentage || 0
    );
    prompt += `CURRENT CART:
- Items: ${cartSummary.itemCount}
- Subtotal: Rs. ${cartSummary.subtotal.toLocaleString()}
- Discount: Rs. ${cartSummary.discount.toLocaleString()} (${cartSummary.discountPercentage}%)
- Total: Rs. ${cartSummary.total.toLocaleString()}
⚠️ Customer has items in cart — if they say "checkout"/"order"/"confirm"/"done" → USE place_order tool IMMEDIATELY!

`;
  }

  // Add conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    const maxHistory = config.max_history_messages || 10;
    prompt += `RECENT CONVERSATION:\n`;
    conversationHistory.slice(-maxHistory).forEach(msg => {
      const role = msg.message_type === 'user' ? 'Customer' : 'You';
      prompt += `${role}: ${msg.message_text}\n`;
    });
    prompt += `\n`;
  }

  // Add personality from config
  prompt += (config.prompt_personality || '') + '\n\n';
  
  // Add flow rules from config
  prompt += (config.prompt_flow_rules || '') + '\n\n';
  
  // Add restrictions from config
  prompt += (config.prompt_restrictions || '') + '\n\n';

  // Add available tools reminder
  prompt += `AVAILABLE TOOLS — USE THEM:
- search_products → When customer asks about any product
- search_workshops → When customer asks about workshops/garages
- add_to_cart → When customer wants to buy/add a product
- view_cart → When customer wants to see their cart
- place_order → When customer says checkout/confirm/order/done
- check_order_status → When customer asks about an order
- get_my_orders → When customer asks about past orders

⚠️ CRITICAL: You MUST use tools for cart and order operations. Do NOT simulate them with text responses.

Now respond to the customer's message naturally and helpfully.`;

  return prompt;
}

// ==========================================
// MAIN ORCHESTRATOR FUNCTION
// ==========================================

async function handleConversation(userMessage, session, conversationHistory = []) {
  try {
    console.log('🤖 Claude processing message...');
    
    // Build system prompt with context (now loads from DB)
    const systemPrompt = await buildSystemPrompt(session, conversationHistory);
    
    // First Claude API call
    let messages = [
      {
        role: "user",
        content: userMessage
      }
    ];
    
    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      tools: tools,
      messages: messages
    });
    
    console.log('📝 Claude response received, stop_reason:', response.stop_reason);
    
    // Handle tool calls if needed (loop until done)
    while (response.stop_reason === 'tool_use') {
      // Extract tool calls
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      
      console.log(`🔧 Claude wants to use ${toolUseBlocks.length} tool(s)`);
      
      // Process each tool call
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const result = await processToolCall(
          toolUse.name,
          toolUse.input,
          session
        );
        
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result)
        });
      }
      
      // Add assistant message and tool results to conversation
      messages.push({
        role: "assistant",
        content: response.content
      });
      
      messages.push({
        role: "user",
        content: toolResults
      });
      
      // Continue conversation with tool results
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        tools: tools,
        messages: messages
      });
      
      console.log('📝 Claude response after tool use, stop_reason:', response.stop_reason);
    }
    
    // Extract final text response
    const textBlocks = response.content.filter(block => block.type === 'text');
    const finalResponse = textBlocks.map(block => block.text).join('\n\n');
    
    console.log('✅ Final response ready');
    
    return {
      response: finalResponse,
      updatedContext: session.context
    };
    
  } catch (error) {
    console.error('❌ Error in handleConversation:', error);
    
    // Load error message from config (or use fallback)
    let errorMsg = "Sorry, I encountered an error. Please try again or contact us at +977 985-1069717.";
    try {
      const config = await loadConfig();
      errorMsg = config.error_message || errorMsg;
    } catch(e) { /* use fallback */ }
    
    return {
      response: errorMsg,
      updatedContext: session.context
    };
  }
}

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  handleConversation,
  reloadConfig,  // Export so admin API can trigger config refresh
  loadConfig     // Export for other modules that might need config
};