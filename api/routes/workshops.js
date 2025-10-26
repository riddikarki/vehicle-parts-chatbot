// =====================================================
// WORKSHOPS ROUTES
// File: api/routes/workshops.js
// Purpose: Define workshop-related API routes
// =====================================================

const express = require('express');
const router = express.Router();
const workshopController = require('../controllers/workshopController');

// =====================================================
// WORKSHOP ROUTES
// =====================================================

/**
 * @route   GET /api/workshops
 * @desc    Get all workshops (with optional filters)
 * @access  Public
 * @query   city, district, zone, segment, is_active
 */
router.get('/', workshopController.getAllWorkshops);

/**
 * @route   GET /api/workshops/nearby
 * @desc    Find nearby workshops based on coordinates
 * @access  Public
 * @query   lat, lon, radius (default: 10km), limit (default: 10)
 * @note    Must be before /:id route to avoid conflict
 */
router.get('/nearby', workshopController.getNearbyWorkshops);

/**
 * @route   GET /api/workshops/search
 * @desc    Search workshops by name or owner
 * @access  Public
 * @query   query, limit (default: 20)
 */
router.get('/search', workshopController.searchWorkshops);

/**
 * @route   GET /api/workshops/stats
 * @desc    Get workshop statistics
 * @access  Public
 */
router.get('/stats', workshopController.getWorkshopStats);

/**
 * @route   GET /api/workshops/segment/:segment
 * @desc    Get workshops by segment
 * @access  Public
 * @param   segment - Workshop segment (e.g., Premium, Standard)
 */
router.get('/segment/:segment', workshopController.getWorkshopsBySegment);

/**
 * @route   GET /api/workshops/city/:city
 * @desc    Get workshops by city
 * @access  Public
 * @param   city - City name
 */
router.get('/city/:city', workshopController.getWorkshopsByCity);

/**
 * @route   GET /api/workshops/:id
 * @desc    Get workshop by ID
 * @access  Public
 * @param   id - Workshop UUID
 */
router.get('/:id', workshopController.getWorkshopById);

/**
 * @route   POST /api/workshops
 * @desc    Create new workshop
 * @access  Private (requires authentication - to be implemented)
 * @body    { name, address, city, district, zone, latitude, longitude, ... }
 */
router.post('/', workshopController.createWorkshop);

/**
 * @route   PUT /api/workshops/:id
 * @desc    Update workshop
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Workshop UUID
 * @body    { fields to update }
 */
router.put('/:id', workshopController.updateWorkshop);

/**
 * @route   DELETE /api/workshops/:id
 * @desc    Delete workshop (soft delete)
 * @access  Private (requires authentication - to be implemented)
 * @param   id - Workshop UUID
 */
router.delete('/:id', workshopController.deleteWorkshop);

module.exports = router;
