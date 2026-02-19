export const errorHandler = (err, req, res, next) => {
  void next;
  console.error('Error:', err);

  if (err?.name === 'ValidationError') {
    const firstError = Object.values(err.errors || {})[0];
    return res.status(400).json({
      success: false,
      message: firstError?.message || 'Validation failed',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  if (err?.code === 11000) {
    const duplicateField = Object.keys(err.keyPattern || {})[0] || 'field';
    const fieldLabel = duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1);
    return res.status(409).json({
      success: false,
      message: `${fieldLabel} already exists`,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
