// =====================================================
// PRODUCTS CONTROLLER
// File: api/controllers/productController.js
// Purpose: Handle product-related API endpoints
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
 * Get all products (with optional filters)
 * GET /api/products
 * Query params: category, brand, vehicle_make, vehicle_model, is_active
 */
exports.getAllProducts = async (req, res) => {
  try {
    const { category, brand, vehicle_make, vehicle_model, is_active = true } = req.query;

    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', is_active)
      .order('name');

    // Apply filters if provided
    if (category) query = query.ilike('category', `%${category}%`);
    if (brand) query = query.ilike('brand', `%${brand}%`);
    if (vehicle_make) query = query.ilike('vehicle_make', `%${vehicle_make}%`);
    if (vehicle_model) query = query.ilike('vehicle_model', `%${vehicle_model}%`);

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });

  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
      message: error.message
    });
  }
};

/**
 * Get product by ID
 * GET /api/products/:id
 */
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get product by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
      message: error.message
    });
  }
};

/**
 * Get product by product code
 * GET /api/products/code/:productCode
 */
exports.getProductByCode = async (req, res) => {
  try {
    const { productCode } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('product_code', productCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Product not found',
          message: `No product found with code: ${productCode}`
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get product by code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
      message: error.message
    });
  }
};

/**
 * Search products
 * GET /api/products/search
 * Query params: query, limit (default: 20)
 */
exports.searchProducts = async (req, res) => {
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
      .from('products')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,product_code.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
      .limit(parseInt(limit));

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      search_query: query,
      data: data
    });

  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search products',
      message: error.message
    });
  }
};

/**
 * Get products by category
 * GET /api/products/category/:category
 */
exports.getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .ilike('category', `%${category}%`)
      .order('name');

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      category: category,
      data: data
    });

  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products by category',
      message: error.message
    });
  }
};

/**
 * Get products by vehicle
 * GET /api/products/vehicle/:make/:model
 */
exports.getProductsByVehicle = async (req, res) => {
  try {
    const { make, model } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .ilike('vehicle_make', `%${make}%`)
      .ilike('vehicle_model', `%${model}%`)
      .order('category');

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      vehicle: {
        make: make,
        model: model
      },
      data: data
    });

  } catch (error) {
    console.error('Get products by vehicle error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products by vehicle',
      message: error.message
    });
  }
};

/**
 * Get products by brand
 * GET /api/products/brand/:brand
 */
exports.getProductsByBrand = async (req, res) => {
  try {
    const { brand } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .ilike('brand', `%${brand}%`)
      .order('name');

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      brand: brand,
      data: data
    });

  } catch (error) {
    console.error('Get products by brand error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products by brand',
      message: error.message
    });
  }
};

/**
 * Get low stock products
 * GET /api/products/low-stock
 * Query params: threshold (default: reorder_point)
 */
exports.getLowStockProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .filter('stock_quantity', 'lte', 'reorder_point')
      .order('stock_quantity', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });

  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch low stock products',
      message: error.message
    });
  }
};

/**
 * Create new product
 * POST /api/products
 * Body: { product_code, name, unit_price, category, brand, ... }
 */
exports.createProduct = async (req, res) => {
  try {
    const productData = req.body;

    // Validate required fields
    if (!productData.product_code || !productData.name || !productData.unit_price) {
      return res.status(400).json({
        success: false,
        error: 'Product code, name, and unit price are required'
      });
    }

    const { data, error } = await supabase
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: data
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create product',
      message: error.message
    });
  }
};

/**
 * Update product
 * PUT /api/products/:id
 * Body: { fields to update }
 */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: data
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product',
      message: error.message
    });
  }
};

/**
 * Delete product (soft delete by setting is_active to false)
 * DELETE /api/products/:id
 */
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('products')
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
          error: 'Product not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Product deactivated successfully',
      data: data
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product',
      message: error.message
    });
  }
};

/**
 * Get product statistics
 * GET /api/products/stats
 */
exports.getProductStats = async (req, res) => {
  try {
    // Get total products
    const { count: totalProducts, error: countError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (countError) throw countError;

    // Get products by category
    const { data: byCategory, error: categoryError } = await supabase
      .from('products')
      .select('category')
      .eq('is_active', true);

    if (categoryError) throw categoryError;

    // Get products by brand
    const { data: byBrand, error: brandError } = await supabase
      .from('products')
      .select('brand')
      .eq('is_active', true);

    if (brandError) throw brandError;

    // Count by category
    const categoryStats = byCategory.reduce((acc, product) => {
      const category = product.category || 'Unknown';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    // Count by brand
    const brandStats = byBrand.reduce((acc, product) => {
      const brand = product.brand || 'Unknown';
      acc[brand] = (acc[brand] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        total_products: totalProducts,
        by_category: categoryStats,
        by_brand: brandStats
      }
    });

  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product statistics',
      message: error.message
    });
  }
};