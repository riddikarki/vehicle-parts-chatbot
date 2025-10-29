// claudeOrchestrator.js
// Purpose: The AI brain that orchestrates conversations using Claude API

const Anthropic = require('@anthropic-ai/sdk');
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

// ==========================================
// CLAUDE TOOL DEFINITIONS
// ==========================================

const tools = [
  {
    name: "search_products",
    description: "Search for vehicle parts/products. Can search by vehicle make/model, category (brake, engine, filter, etc), product code, or keyword. Returns list of products with prices.",
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
    description: "Add a product to the customer's shopping cart. Requires product_code and quantity.",
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
    description: "Place/confirm the order with items currently in cart. Use this when customer confirms they want to checkout.",
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
      case "search_products":
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
      
      case "search_workshops":
        const workshops = await searchWorkshops(toolInput);
        return {
          success: true,
          count: workshops.length,
          workshops: workshops
        };
      
      case "add_to_cart":
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
      
      case "view_cart":
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
      
      case "place_order":
        const orderCart = session.context.cart || [];
        
        if (orderCart.length === 0) {
          return {
            success: false,
            message: "Cart is empty. Cannot place order."
          };
        }
        
        if (!session.customer) {
          return {
            success: false,
            message: "Customer not found. Cannot place order."
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
      
      case "check_order_status":
        const orderStatus = await getOrderStatus(toolInput.order_number);
        return {
          success: orderStatus !== null,
          order: orderStatus
        };
      
      case "get_my_orders":
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
// BUILD SYSTEM PROMPT
// ==========================================

function buildSystemPrompt(session, conversationHistory) {
  const customer = session.customer;
  const context = session.context;
  
  let prompt = `You are a helpful AI assistant for Satkam, a vehicle parts distributor in Nepal.

BUSINESS INFO:
- Company: Satkam Vehicle Parts
- Phone: +977 985-1069717
- We sell: Brake pads, engine parts, filters, suspension parts, etc.
- We serve: Retailers, workshops, mechanics across Nepal

`;

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

`;
  } else if (session.isNewCustomer) {
    prompt += `CUSTOMER INFO:
- New/Unknown customer (not in our database)
- Phone: ${session.phoneNumber}
- Note: They can still browse products and workshops, but cannot place orders until registered.

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

`;
  }

  // Add conversation context
  if (conversationHistory && conversationHistory.length > 0) {
    prompt += `RECENT CONVERSATION:\n`;
    conversationHistory.forEach(msg => {
      prompt += `${msg.sender === 'user' ? 'Customer' : 'You'}: ${msg.message}\n`;
    });
    prompt += `\n`;
  }

  // Add instructions
  prompt += `YOUR ROLE:
1. Be friendly, helpful, and professional
2. Help customers find products for their vehicles
3. Show prices with their discount automatically applied
4. Help them add items to cart and place orders
5. Find nearby workshops when requested
6. Answer questions about orders and products
7. Speak naturally - use both English and simple Nepali terms when appropriate

IMPORTANT RULES:
- Always apply customer discount when showing prices
- Format prices clearly: "Rs. 2,500" (use commas for thousands)
- When listing products, keep it concise but informative
- If customer asks about payment/delivery, explain we'll arrange after order confirmation
- If new customer wants to order, politely explain they need to register first
- Use emojis sparingly for friendliness 😊

AVAILABLE TOOLS:
You have access to tools to search products, find workshops, manage cart, and place orders. Use them when needed!

Now respond to the customer's message naturally and helpfully.`;

  return prompt;
}

// ==========================================
// MAIN ORCHESTRATOR FUNCTION
// ==========================================

async function handleConversation(userMessage, session, conversationHistory = []) {
  try {
    console.log('🤖 Claude processing message...');
    
    // Build system prompt with context
    const systemPrompt = buildSystemPrompt(session, conversationHistory);
    
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
    
    // Handle tool calls if needed
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
    
    // Friendly error message
    return {
      response: "Sorry, I encountered an error. Please try again or contact us at +977 985-1069717.",
      updatedContext: session.context
    };
  }
}

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  handleConversation
};