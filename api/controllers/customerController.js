// =====================================================
// CUSTOMERS CONTROLLER
// File: api/controllers/customerController.js
// Purpose: Handle customer-related API endpoints
// =====================================================

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =====================================================
// CONTROLLER FUNCTIONS
// =====================================================

/**
 * Get all customers (with optional filters)
 * GET /api/customers
 * Query params: city, district, customer_grade, is_active
 */
exports.getAllCustomers = async (req, res) => {
  try {
    const { city, district, customer_grade, is_active = true } = req.query;

    let query = supabase
      .from('customers')
      .select('*')
      .eq('is_active', is_active)
      .order('name');

    // Apply filters if provided
    if (city) query = query.ilike('city', `%${city}%`);
    if (district) query = query.ilike('district', `%${district}%`);
    if (customer_grade) query = query.eq('customer_grade', customer_grade);

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });

  } catch (error) {
    console.error('Get all customers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers',
      message: error.message
    });
  }
};

/**
 * Get customer by phone number
 * GET /api/customers/phone/:phone
 */
exports.getCustomerByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Customer not found',
          message: `No customer found with phone: ${phone}`
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get customer by phone error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer',
      message: error.message
    });
  }
};

/**
 * Get customer by customer code
 * GET /api/customers/code/:code
 */
exports.getCustomerByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_code', code)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Customer not found',
          message: `No customer found with code: ${code}`
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get customer by code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer',
      message: error.message
    });
  }
};

/**
 * Get customer by ID
 * GET /api/customers/:id
 */
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get customer by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer',
      message: error.message
    });
  }
};

/**
 * Get customer orders
 * GET /api/customers/:customerId/orders
 */
exports.getCustomerOrders = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const { data, error, count } = await supabase
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
 * Search customers by name
 * GET /api/customers/search
 * Query params: query, limit (default: 20)
 */
exports.searchCustomers = async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        message: 'Please provide a query parameter'
      });
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,customer_code.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(parseInt(limit));

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      search_query: query,
      data: data
    });

  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search customers',
      message: error.message
    });
  }
};

/**
 * Get customers by grade
 * GET /api/customers/grade/:grade
 */
exports.getCustomersByGrade = async (req, res) => {
  try {
    const { grade } = req.params;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .eq('customer_grade', grade)
      .order('name');

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      grade: grade,
      data: data
    });

  } catch (error) {
    console.error('Get customers by grade error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers by grade',
      message: error.message
    });
  }
};

/**
 * Create new customer
 * POST /api/customers
 * Body: { customer_code, name, phone, city, district, customer_grade, ... }
 */
exports.createCustomer = async (req, res) => {
  try {
    const customerData = req.body;

    // Validate required fields
    if (!customerData.customer_code || !customerData.name) {
      return res.status(400).json({
        success: false,
        error: 'Customer code and name are required'
      });
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([customerData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: data
    });

  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create customer',
      message: error.message
    });
  }
};

/**
 * Update customer
 * PUT /api/customers/:id
 * Body: { fields to update }
 */
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: data
    });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update customer',
      message: error.message
    });
  }
};

/**
 * Delete customer (soft delete by setting is_active to false)
 * DELETE /api/customers/:id
 */
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('customers')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Customer deactivated successfully',
      data: data
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete customer',
      message: error.message
    });
  }
};

/**
 * Get customer statistics
 * GET /api/customers/stats
 */
exports.getCustomerStats = async (req, res) => {
  try {
    // Get total customers
    const { count: totalCustomers, error: countError } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (countError) throw countError;

    // Get customers by grade
    const { data: byGrade, error: gradeError } = await supabase
      .from('customers')
      .select('customer_grade')
      .eq('is_active', true);

    if (gradeError) throw gradeError;

    // Get customers by city
    const { data: byCity, error: cityError } = await supabase
      .from('customers')
      .select('city')
      .eq('is_active', true);

    if (cityError) throw cityError;

    // Count by grade
    const gradeStats = byGrade.reduce((acc, customer) => {
      const grade = customer.customer_grade || 'Unknown';
      acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    }, {});

    // Count by city
    const cityStats = byCity.reduce((acc, customer) => {
      const city = customer.city || 'Unknown';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        total_customers: totalCustomers,
        by_grade: gradeStats,
        by_city: cityStats
      }
    });

  } catch (error) {
    console.error('Get customer stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer statistics',
      message: error.message
    });
  }
};