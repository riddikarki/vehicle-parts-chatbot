// =====================================================
// ORDERS CONTROLLER
// File: api/controllers/orderController.js
// Purpose: Handle order-related API endpoints
// =====================================================

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate unique order number
 * Format: ORD-YYYYMMDD-XXXX (e.g., ORD-20251019-0001)
 */
async function generateOrderNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  
  // Get count of orders today
  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today.toISOString().slice(0, 10)}T00:00:00`)
    .lt('created_at', `${today.toISOString().slice(0, 10)}T23:59:59`);

  if (error) throw error;

  const sequence = String((count || 0) + 1).padStart(4, '0');
  return `ORD-${dateStr}-${sequence}`;
}

/**
 * Calculate order totals with discounts
 * @param {Array} items - Array of { product_id, quantity, unit_price }
 * @param {number} discountPercentage - Customer discount percentage
 * @returns {Object} { subtotal, discount_amount, tax_amount, total_amount }
 */
function calculateOrderTotals(items, discountPercentage = 0) {
  const subtotal = items.reduce((sum, item) => {
    return sum + (item.quantity * item.unit_price);
  }, 0);

  const discount_amount = (subtotal * discountPercentage) / 100;
  const tax_amount = 0; // No tax for now, can be added later
  const total_amount = subtotal - discount_amount + tax_amount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount_amount: Math.round(discount_amount * 100) / 100,
    tax_amount: Math.round(tax_amount * 100) / 100,
    total_amount: Math.round(total_amount * 100) / 100
  };
}

// =====================================================
// CONTROLLER FUNCTIONS
// =====================================================

/**
 * Create new order
 * POST /api/orders
 * Body: {
 *   customer_id: uuid,
 *   items: [{ product_id, quantity }],
 *   notes: string (optional)
 * }
 */
exports.createOrder = async (req, res) => {
  try {
    const { customer_id, items, notes } = req.body;

    // Validate required fields
    if (!customer_id || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'customer_id and items are required'
      });
    }

    // Get customer details to calculate discount
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('customer_code, name, customer_grade, base_discount_percentage, custom_discount_percentage, use_custom_discount')
      .eq('id', customer_id)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Determine discount percentage
    const discountPercentage = customer.use_custom_discount 
      ? customer.custom_discount_percentage 
      : customer.base_discount_percentage;

    // Fetch product details for all items
    const productIds = items.map(item => item.product_id);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, product_code, name, unit_price, stock_quantity')
      .in('id', productIds);

    if (productsError) throw productsError;

    // Validate stock availability and prepare order items
    const orderItems = [];
    let insufficientStock = [];

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product not found: ${item.product_id}`
        });
      }

      if (product.stock_quantity < item.quantity) {
        insufficientStock.push({
          product_code: product.product_code,
          product_name: product.name,
          requested: item.quantity,
          available: product.stock_quantity
        });
      }

      const itemDiscountAmount = (product.unit_price * item.quantity * discountPercentage) / 100;
      const lineTotal = (product.unit_price * item.quantity) - itemDiscountAmount;

      orderItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: product.unit_price,
        discount_percentage: discountPercentage,
        discount_amount: Math.round(itemDiscountAmount * 100) / 100,
        line_total: Math.round(lineTotal * 100) / 100
      });
    }

    // Check for insufficient stock
    if (insufficientStock.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock for some items',
        insufficient_stock: insufficientStock
      });
    }

    // Calculate order totals
    const totals = calculateOrderTotals(
      orderItems.map(item => ({
        quantity: item.quantity,
        unit_price: item.unit_price
      })),
      discountPercentage
    );

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        order_number: orderNumber,
        customer_id: customer_id,
        status: 'pending',
        subtotal: totals.subtotal,
        discount_percentage: discountPercentage,
        discount_amount: totals.discount_amount,
        tax_amount: totals.tax_amount,
        total_amount: totals.total_amount,
        payment_status: 'unpaid',
        payment_terms: customer.payment_terms || 'COD',
        notes: notes || null
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    const orderItemsWithOrderId = orderItems.map(item => ({
      ...item,
      order_id: order.id
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsWithOrderId);

    if (itemsError) throw itemsError;

    // Update product stock quantities
    for (const item of orderItems) {
      const { error: stockError } = await supabase
        .from('products')
        .update({
          stock_quantity: supabase.sql`stock_quantity - ${item.quantity}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.product_id);

      if (stockError) throw stockError;
    }

    // Update customer statistics
    const { error: customerUpdateError } = await supabase
      .from('customers')
      .update({
        total_orders: supabase.sql`total_orders + 1`,
        lifetime_value: supabase.sql`lifetime_value + ${totals.total_amount}`,
        last_order_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', customer_id);

    if (customerUpdateError) throw customerUpdateError;

    // Fetch complete order with items
    const { data: completeOrder } = await supabase
      .from('orders')
      .select(`
        *,
        customers (customer_code, name, phone),
        order_items (
          *,
          products (product_code, name)
        )
      `)
      .eq('id', order.id)
      .single();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: completeOrder
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      message: error.message
    });
  }
};

/**
 * Get order by ID
 * GET /api/orders/:id
 */
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customers (
          id,
          customer_code,
          name,
          phone,
          city,
          customer_grade
        ),
        order_items (
          id,
          quantity,
          unit_price,
          discount_percentage,
          discount_amount,
          line_total,
          products (
            id,
            product_code,
            name,
            description,
            category,
            brand
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
      message: error.message
    });
  }
};

/**
 * Get order by order number
 * GET /api/orders/number/:orderNumber
 */
exports.getOrderByNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customers (customer_code, name, phone),
        order_items (
          *,
          products (product_code, name)
        )
      `)
      .eq('order_number', orderNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get order by number error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
      message: error.message
    });
  }
};

/**
 * Get all orders for a customer
 * GET /api/orders/customer/:customerId
 * Query params: status, payment_status, limit, offset
 */
exports.getCustomerOrders = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status, payment_status, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          quantity,
          line_total,
          products (product_code, name)
        )
      `, { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);
    if (payment_status) query = query.eq('payment_status', payment_status);

    const { data, error, count } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: count,
      data: data,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count
      }
    });

  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer orders',
      message: error.message
    });
  }
};

/**
 * Get all orders (with filters)
 * GET /api/orders
 * Query params: status, payment_status, start_date, end_date, limit, offset
 */
exports.getAllOrders = async (req, res) => {
  try {
    const { 
      status, 
      payment_status, 
      start_date, 
      end_date, 
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = supabase
      .from('orders')
      .select(`
        *,
        customers (customer_code, name, phone, city)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);
    if (payment_status) query = query.eq('payment_status', payment_status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    const { data, error, count } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: count,
      data: data,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count
      }
    });

  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error.message
    });
  }
};

/**
 * Update order status
 * PUT /api/orders/:id/status
 * Body: { status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' }
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: data
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status',
      message: error.message
    });
  }
};

/**
 * Update payment status
 * PUT /api/orders/:id/payment
 * Body: { payment_status: 'unpaid' | 'partial' | 'paid' }
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status } = req.body;

    const validStatuses = ['unpaid', 'partial', 'paid'];
    
    if (!payment_status || !validStatuses.includes(payment_status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment status',
        message: `Payment status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ 
        payment_status: payment_status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      data: data
    });

  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment status',
      message: error.message
    });
  }
};

/**
 * Cancel order
 * PUT /api/orders/:id/cancel
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (product_id, quantity)
      `)
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Order is already cancelled'
      });
    }

    // Restore stock quantities
    for (const item of order.order_items) {
      const { error: stockError } = await supabase
        .from('products')
        .update({
          stock_quantity: supabase.sql`stock_quantity + ${item.quantity}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.product_id);

      if (stockError) throw stockError;
    }

    // Update order status to cancelled
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: data
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
      message: error.message
    });
  }
};

/**
 * Get order statistics
 * GET /api/orders/stats
 * Query params: start_date, end_date
 */
exports.getOrderStats = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = supabase
      .from('orders')
      .select('status, payment_status, total_amount, created_at');

    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    const { data: orders, error } = await query;

    if (error) throw error;

    // Calculate statistics
    const stats = {
      total_orders: orders.length,
      by_status: {},
      by_payment_status: {},
      total_revenue: 0,
      average_order_value: 0
    };

    orders.forEach(order => {
      // Count by status
      stats.by_status[order.status] = (stats.by_status[order.status] || 0) + 1;
      
      // Count by payment status
      stats.by_payment_status[order.payment_status] = 
        (stats.by_payment_status[order.payment_status] || 0) + 1;
      
      // Sum total revenue
      stats.total_revenue += parseFloat(order.total_amount);
    });

    stats.total_revenue = Math.round(stats.total_revenue * 100) / 100;
    stats.average_order_value = orders.length > 0 
      ? Math.round((stats.total_revenue / orders.length) * 100) / 100 
      : 0;

    res.status(200).json({
      success: true,
      date_range: {
        start: start_date || 'all time',
        end: end_date || 'present'
      },
      data: stats
    });

  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order statistics',
      message: error.message
    });
  }
};
