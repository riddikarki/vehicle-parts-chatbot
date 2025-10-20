// =====================================================
// PRODUCTS ROUTES
// File: api/routes/products.js
// Purpose: Define product-related API routes
// =====================================================

const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// =====================================================
// PRODUCT ROUTES
// =====================================================

/**
 * @route   GET /api/products
 * @desc    Get all products (with optional filters)
 * @access  Public
 * @query   category, brand, vehicle_make, vehicle_model, is_active
 */
router.get('/', productController.getAllProducts);

/**
 * @route   GET /api/products/search
 * @desc    Search products by name, code, description, or category
 * @access  Public
 * @query   query, limit (default: 20)
 */
router.get('/search', productController.searchProducts);

/**
 * @route   GET /api/products/stats
 * @desc    Get product statistics
 * @access  Public
 */
router.get('/stats', productController.getProductStats);

/**
 * @route   GET /api/products/low-stock
 * @desc    Get products with low stock
 * @access  Public
 */
router.get('/low-stock', productController.getLowStockProducts);

/**
 * @route   GET /api/products/code/:productCode
 * @desc    Get product by product code
 * @access  Public
 * @param   productCode - Product code
 */
router.get('/code/:productCode', productController.getProductByCode);

/**
 * @route   GET /api/products/category/:category
 * @desc    Get products by category
 * @access  Public
 * @param   category - Product category
 */
router.get('/category/:category', productController.getProductsByCategory);

/**
 * @route   GET /api/products/brand/:brand
 * @desc    Get products by brand
 * @access  Public
 * @param   brand - Product brand
 */
router.get('/brand/:brand', productController.getProductsByBrand);

/**
 * @route   GET /api/products/vehicle/:make/:model
 * @desc    Get products by vehicle make and model
 * @access  Public
 * @param   make - Vehicle make (e.g., Toyota)
 * @param   model - Vehicle model (e.g., Corolla)
 */
router.get('/vehicle/:make/:model', productController.getProductsByVehicle);

/**
 * @route   GET /api/products/:id
 * @desc    Get product by ID
 * @access  Public
 * @param   id - Product UUID
 */
router.get('/:id', productController.getProductById);

/**
 * @route   POST /api/products
 * @desc    Create new product
 * @access  Private (requires authentication - to be implemented)
 * @body    { product_code, name, unit_price, category, brand, ... }
 */
router.post('/', productController.createProduct);

/**
 * @route   PUT /api/products/:id
 * @desc    Update product
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Product UUID
 * @body    { fields to update }
 */
router.put('/:id', productController.updateProduct);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product (soft delete)
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Product UUID
 */
router.delete('/:id', productController.deleteProduct);

module.exports = router;