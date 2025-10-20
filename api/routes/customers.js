// =====================================================
// CUSTOMERS ROUTES
// File: api/routes/customers.js
// Purpose: Define customer-related API routes
// =====================================================

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

// =====================================================
// CUSTOMER ROUTES
// =====================================================

/**
 * @route   GET /api/customers
 * @desc    Get all customers (with optional filters)
 * @access  Public
 * @query   city, district, customer_grade, is_active
 */
router.get('/', customerController.getAllCustomers);

/**
 * @route   GET /api/customers/search
 * @desc    Search customers by name, code, or phone
 * @access  Public
 * @query   query, limit (default: 20)
 */
router.get('/search', customerController.searchCustomers);

/**
 * @route   GET /api/customers/stats
 * @desc    Get customer statistics
 * @access  Public
 */
router.get('/stats', customerController.getCustomerStats);

/**
 * @route   GET /api/customers/phone/:phone
 * @desc    Get customer by phone number
 * @access  Public
 * @param   phone - Customer phone number
 */
router.get('/phone/:phone', customerController.getCustomerByPhone);

/**
 * @route   GET /api/customers/code/:code
 * @desc    Get customer by customer code
 * @access  Public
 * @param   code - Customer code
 */
router.get('/code/:code', customerController.getCustomerByCode);

/**
 * @route   GET /api/customers/grade/:grade
 * @desc    Get customers by grade
 * @access  Public
 * @param   grade - Customer grade (LEO, HRS, CAT, TORT, PUBLIC)
 */
router.get('/grade/:grade', customerController.getCustomersByGrade);

/**
 * @route   GET /api/customers/:id
 * @desc    Get customer by ID
 * @access  Public
 * @param   id - Customer UUID
 */
router.get('/:id', customerController.getCustomerById);

/**
 * @route   GET /api/customers/:customerId/orders
 * @desc    Get customer orders
 * @access  Public
 * @param   customerId - Customer UUID
 * @query   limit, offset
 */
router.get('/:customerId/orders', customerController.getCustomerOrders);

/**
 * @route   POST /api/customers
 * @desc    Create new customer
 * @access  Private (requires authentication - to be implemented)
 * @body    { customer_code, name, phone, city, district, customer_grade, ... }
 */
router.post('/', customerController.createCustomer);

/**
 * @route   PUT /api/customers/:id
 * @desc    Update customer
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Customer UUID
 * @body    { fields to update }
 */
router.put('/:id', customerController.updateCustomer);

/**
 * @route   DELETE /api/customers/:id
 * @desc    Delete customer (soft delete)
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Customer UUID
 */
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;