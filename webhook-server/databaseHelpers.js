// databaseHelpers.js
// Purpose: Simple database queries that Claude can use as tools

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ==========================================
// PRODUCT TOOLS
// ==========================================

/**
 * Search products by vehicle and/or category
 * @param {Object} params - Search parameters
 * @returns {Array} Matching products with prices
 */
async function searchProducts(params = {}) {
  try {
    const { vehicle_make, vehicle_model, category, product_code, keyword } = params;
    
    console.log('🔍 Searching products with:', params);
    
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true);
    
    // Filter by vehicle make
    if (vehicle_make) {
      query = query.ilike('vehicle_make', `%${vehicle_make}%`);
    }
    
    // Filter by vehicle model
    if (vehicle_model) {
      query = query.ilike('vehicle_model', `%${vehicle_model}%`);
    }
    
    // Filter by category
    if (category) {
      query = query.ilike('category', `%${category}%`);
    }
    
    // Filter by product code
    if (product_code) {
      query = query.eq('product_code', product_code);
    }
    
    // Keyword search (in name or description)
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,description.ilike.%${keyword}%`);
    }
    
    // Limit results
    query = query.limit(20);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    console.log(`✅ Found ${data.length} products`);
    return data || [];
    
  } catch (error) {
    console.error('❌ Error in searchProducts:', error);
    return [];
  }
}

/**
 * Calculate price with customer discount
 * @param {number} unitPrice - Original price
 * @param {number} discountPercentage - Customer's discount %
 * @returns {Object} Price breakdown
 */
function calculatePrice(unitPrice, discountPercentage = 0) {
  const discount = (unitPrice * discountPercentage) / 100;
  const finalPrice = unitPrice - discount;
  
  return {
    originalPrice: unitPrice,
    discount: discount,
    discountPercentage: discountPercentage,
    finalPrice: finalPrice
  };
}

// ==========================================
// WORKSHOP TOOLS
// ==========================================

/**
 * Search workshops by location
 * @param {Object} params - Search parameters
 * @returns {Array} Matching workshops
 */
async function searchWorkshops(params = {}) {
  try {
    const { city, district, zone, keyword } = params;
    
    console.log('🔍 Searching workshops with:', params);
    
    let query = supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true);
    
    // Filter by city
    if (city) {
      query = query.ilike('city', `%${city}%`);
    }
    
    // Filter by district
    if (district) {
      query = query.ilike('district', `%${district}%`);
    }
    
    // Filter by zone
    if (zone) {
      query = query.ilike('zone', `%${zone}%`);
    }
    
    // Keyword search
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,address.ilike.%${keyword}%,owner_name.ilike.%${keyword}%`);
    }
    
    // Limit results
    query = query.limit(10);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    console.log(`✅ Found ${data.length} workshops`);
    return data || [];
    
  } catch (error) {
    console.error('❌ Error in searchWorkshops:', error);
    return [];
  }
}

// ==========================================
// CART TOOLS
// ==========================================

/**
 * Add item to cart (saved in session context)
 * @param {Array} currentCart - Existing cart items
 * @param {string} productCode - Product to add
 * @param {number} quantity - Quantity
 * @returns {Array} Updated cart
 */
async function addToCart(currentCart = [], productCode, quantity = 1) {
  try {
    console.log(`🛒 Adding to cart: ${productCode} x${quantity}`);
    
    // Get product details
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('product_code', productCode)
      .single();
    
    if (error || !product) {
      throw new Error('Product not found');
    }
    
    // Check if product already in cart
    const existingIndex = currentCart.findIndex(item => item.product_code === productCode);
    
    if (existingIndex >= 0) {
      // Update quantity
      currentCart[existingIndex].quantity += quantity;
    } else {
      // Add new item
      currentCart.push({
        product_code: productCode,
        name: product.name,
        unit_price: product.unit_price,
        quantity: quantity
      });
    }
    
    console.log(`✅ Cart updated. Total items: ${currentCart.length}`);
    return currentCart;
    
  } catch (error) {
    console.error('❌ Error in addToCart:', error);
    throw error;
  }
}

/**
 * Calculate cart total with discount
 * @param {Array} cart - Cart items
 * @param {number} discountPercentage - Customer's discount %
 * @returns {Object} Cart summary
 */
function calculateCartTotal(cart = [], discountPercentage = 0) {
  let subtotal = 0;
  
  cart.forEach(item => {
    subtotal += item.unit_price * item.quantity;
  });
  
  const discount = (subtotal * discountPercentage) / 100;
  const total = subtotal - discount;
  
  return {
    itemCount: cart.length,
    subtotal: subtotal,
    discount: discount,
    discountPercentage: discountPercentage,
    total: total
  };
}

// ==========================================
// ORDER TOOLS
// ==========================================

/**
 * Create order from cart
 * @param {string} customerId - Customer code
 * @param {Array} cart - Cart items
 * @param {number} total - Order total
 * @returns {Object} Created order
 */
async function createOrder(customerId, cart, total) {
  try {
    console.log(`📦 Creating order for customer: ${customerId}`);
    
    // Generate order number
    const orderNumber = `ORD-${Date.now()}`;
    
    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        order_date: new Date().toISOString(),
        total_amount: total,
        status: 'pending',
        payment_status: 'pending'
      })
      .select()
      .single();
    
    if (orderError) throw orderError;
    
    // Create order items
    const orderItems = cart.map(item => ({
      order_id: order.id,
      product_code: item.product_code,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.unit_price * item.quantity
    }));
    
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);
    
    if (itemsError) throw itemsError;
    
    console.log(`✅ Order created: ${orderNumber}`);
    
    return {
      orderNumber: orderNumber,
      orderId: order.id,
      total: total,
      status: 'pending'
    };
    
  } catch (error) {
    console.error('❌ Error in createOrder:', error);
    throw error;
  }
}

/**
 * Get order status
 * @param {string} orderNumber - Order number
 * @returns {Object} Order details
 */
async function getOrderStatus(orderNumber) {
  try {
    console.log(`📋 Getting order status: ${orderNumber}`);
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (name)
        )
      `)
      .eq('order_number', orderNumber)
      .single();
    
    if (error) throw error;
    
    return data;
    
  } catch (error) {
    console.error('❌ Error in getOrderStatus:', error);
    return null;
  }
}

/**
 * Get customer's recent orders
 * @param {string} customerId - Customer code
 * @param {number} limit - Number of orders
 * @returns {Array} Recent orders
 */
async function getCustomerOrders(customerId, limit = 5) {
  try {
    console.log(`📋 Getting orders for customer: ${customerId}`);
    
    const { data, error } = await supabase
      .from('orders')
      .select('order_number, order_date, total_amount, status')
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    return data || [];
    
  } catch (error) {
    console.error('❌ Error in getCustomerOrders:', error);
    return [];
  }
}

// ==========================================
// EXPORT ALL TOOLS
// ==========================================

module.exports = {
  // Products
  searchProducts,
  calculatePrice,
  
  // Workshops
  searchWorkshops,
  
  // Cart
  addToCart,
  calculateCartTotal,
  
  // Orders
  createOrder,
  getOrderStatus,
  getCustomerOrders
};