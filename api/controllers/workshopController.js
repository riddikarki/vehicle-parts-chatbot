// =====================================================
// WORKSHOPS CONTROLLER
// File: api/controllers/workshopController.js
// Purpose: Handle workshop-related API endpoints
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
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

// =====================================================
// CONTROLLER FUNCTIONS
// =====================================================

/**
 * Get all workshops (with optional filters)
 * GET /api/workshops
 * Query params: city, district, zone, segment, is_active
 */
exports.getAllWorkshops = async (req, res) => {
  try {
    const { city, district, zone, segment, is_active = true } = req.query;

    let query = supabase
      .from('workshops')
      .select('*')
      .eq('is_active', is_active)
      .order('name');

    // Apply filters if provided
    if (city) query = query.ilike('city', `%${city}%`);
    if (district) query = query.ilike('district', `%${district}%`);
    if (zone) query = query.eq('zone', zone);
    if (segment) query = query.eq('segment', segment);

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });

  } catch (error) {
    console.error('Get all workshops error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workshops',
      message: error.message
    });
  }
};

/**
 * Get workshop by ID
 * GET /api/workshops/:id
 */
exports.getWorkshopById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('workshops')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Workshop not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Get workshop by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workshop',
      message: error.message
    });
  }
};

/**
 * Find nearby workshops based on coordinates
 * GET /api/workshops/nearby
 * Query params: lat, lon, radius (default: 10km), limit (default: 10)
 */
exports.getNearbyWorkshops = async (req, res) => {
  try {
    const { lat, lon, radius = 10, limit = 10 } = req.query;

    // Validate coordinates
    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
        message: 'Please provide lat and lon query parameters'
      });
    }

    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    const searchRadius = parseFloat(radius);

    // Validate coordinates are valid numbers
    if (isNaN(userLat) || isNaN(userLon) || isNaN(searchRadius)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates',
        message: 'Latitude, longitude, and radius must be valid numbers'
      });
    }

    // Fetch all active workshops with coordinates
    const { data: workshops, error } = await supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) throw error;

    // Calculate distances and filter by radius
    const workshopsWithDistance = workshops
      .map(workshop => ({
        ...workshop,
        distance_km: calculateDistance(
          userLat,
          userLon,
          workshop.latitude,
          workshop.longitude
        )
      }))
      .filter(workshop => workshop.distance_km <= searchRadius)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      count: workshopsWithDistance.length,
      search_params: {
        latitude: userLat,
        longitude: userLon,
        radius_km: searchRadius
      },
      data: workshopsWithDistance
    });

  } catch (error) {
    console.error('Get nearby workshops error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find nearby workshops',
      message: error.message
    });
  }
};

/**
 * Search workshops by name or owner
 * GET /api/workshops/search
 * Query params: query, limit (default: 20)
 */
exports.searchWorkshops = async (req, res) => {
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
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,owner_name.ilike.%${query}%,mechanic_name.ilike.%${query}%`)
      .limit(parseInt(limit));

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      search_query: query,
      data: data
    });

  } catch (error) {
    console.error('Search workshops error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search workshops',
      message: error.message
    });
  }
};

/**
 * Get workshops by segment
 * GET /api/workshops/segment/:segment
 */
exports.getWorkshopsBySegment = async (req, res) => {
  try {
    const { segment } = req.params;

    const { data, error } = await supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .eq('segment', segment)
      .order('name');

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      segment: segment,
      data: data
    });

  } catch (error) {
    console.error('Get workshops by segment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workshops by segment',
      message: error.message
    });
  }
};

/**
 * Get workshops by city
 * GET /api/workshops/city/:city
 */
exports.getWorkshopsByCity = async (req, res) => {
  try {
    const { city } = req.params;

    const { data, error } = await supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .order('name');

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      city: city,
      data: data
    });

  } catch (error) {
    console.error('Get workshops by city error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workshops by city',
      message: error.message
    });
  }
};

/**
 * Create new workshop
 * POST /api/workshops
 * Body: { name, address, city, district, zone, latitude, longitude, ... }
 */
exports.createWorkshop = async (req, res) => {
  try {
    const workshopData = req.body;

    // Validate required fields
    if (!workshopData.name) {
      return res.status(400).json({
        success: false,
        error: 'Workshop name is required'
      });
    }

    const { data, error } = await supabase
      .from('workshops')
      .insert([workshopData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Workshop created successfully',
      data: data
    });

  } catch (error) {
    console.error('Create workshop error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create workshop',
      message: error.message
    });
  }
};

/**
 * Update workshop
 * PUT /api/workshops/:id
 * Body: { fields to update }
 */
exports.updateWorkshop = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('workshops')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Workshop not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Workshop updated successfully',
      data: data
    });

  } catch (error) {
    console.error('Update workshop error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update workshop',
      message: error.message
    });
  }
};

/**
 * Delete workshop (soft delete by setting is_active to false)
 * DELETE /api/workshops/:id
 */
exports.deleteWorkshop = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('workshops')
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
          error: 'Workshop not found'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Workshop deactivated successfully',
      data: data
    });

  } catch (error) {
    console.error('Delete workshop error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete workshop',
      message: error.message
    });
  }
};

/**
 * Get workshop statistics
 * GET /api/workshops/stats
 */
exports.getWorkshopStats = async (req, res) => {
  try {
    // Get total workshops
    const { count: totalWorkshops, error: countError } = await supabase
      .from('workshops')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (countError) throw countError;

    // Get workshops by city
    const { data: byCity, error: cityError } = await supabase
      .from('workshops')
      .select('city')
      .eq('is_active', true);

    if (cityError) throw cityError;

    // Get workshops by segment
    const { data: bySegment, error: segmentError } = await supabase
      .from('workshops')
      .select('segment')
      .eq('is_active', true);

    if (segmentError) throw segmentError;

    // Count by city
    const cityStats = byCity.reduce((acc, workshop) => {
      const city = workshop.city || 'Unknown';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    // Count by segment
    const segmentStats = bySegment.reduce((acc, workshop) => {
      const segment = workshop.segment || 'Unknown';
      acc[segment] = (acc[segment] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        total_workshops: totalWorkshops,
        by_city: cityStats,
        by_segment: segmentStats
      }
    });

  } catch (error) {
    console.error('Get workshop stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workshop statistics',
      message: error.message
    });
  }
};
