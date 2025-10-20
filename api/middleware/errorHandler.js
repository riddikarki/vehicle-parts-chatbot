/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Supabase errors
  if (err.code) {
    return res.status(400).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};