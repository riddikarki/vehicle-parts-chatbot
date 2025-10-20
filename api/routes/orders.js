// =====================================================
// ORDERS ROUTES
// File: api/routes/orders.js
// Purpose: Define order-related API routes
// =====================================================

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// =====================================================
// ORDER ROUTES
// =====================================================

/**
 * @route   GET /api/orders
 * @desc    Get all orders (with filters)
 * @access  Private (requires authentication - to be implemented)
 * @query   status, payment_status, start_date, end_date, limit, offset
 */
router.get('/', orderController.getAllOrders);

/**
 * @route   GET /api/orders/stats
 * @desc    Get order statistics
 * @access  Private (requires authentication - to be implemented)
 * @query   start_date, end_date
 */
router.get('/stats', orderController.getOrderStats);

/**
 * @route   GET /api/orders/number/:orderNumber
 * @desc    Get order by order number
 * @access  Public
 * @param   orderNumber - Order number (e.g., ORD-20251019-0001)
 */
router.get('/number/:orderNumber', orderController.getOrderByNumber);

/**
 * @route   GET /api/orders/customer/:customerId
 * @desc    Get all orders for a customer
 * @access  Public
 * @param   customerId - Customer UUID
 * @query   status, payment_status, limit, offset
 */
router.get('/customer/:customerId', orderController.getCustomerOrders);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Public
 * @param   id - Order UUID
 */
router.get('/:id', orderController.getOrderById);

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Public
 * @body    { customer_id, items: [{ product_id, quantity }], notes }
 */
router.post('/', orderController.createOrder);

/**
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Order UUID
 * @body    { status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' }
 */
router.put('/:id/status', orderController.updateOrderStatus);

/**
 * @route   PUT /api/orders/:id/payment
 * @desc    Update payment status
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Order UUID
 * @body    { payment_status: 'unpaid' | 'partial' | 'paid' }
 */
router.put('/:id/payment', orderController.updatePaymentStatus);

/**
 * @route   PUT /api/orders/:id/cancel
 * @desc    Cancel order
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Order UUID
 */
router.put('/:id/cancel', orderController.cancelOrder);

module.exports = router;
