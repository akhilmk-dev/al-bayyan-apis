function errorHandler(err, req, res, next) {

  function formatMongooseErrors(err) {
    if (!err.errors) return {};
    return Object.keys(err.errors).reduce((acc, key) => {
      acc[key] = [err.errors[key].message];
      return acc;
    }, {});
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message:"Validation failed",
      errors: formatMongooseErrors(err),
    });
  }

  if(err.name == "ConflictError"){
    return res.status(409).json({
      status:"error",
      name: "Conflict Error",
      message:err.message
    })
  }

  if(err.name == "NotFoundError"){
    return res.status(404).json({
      status:"error",
      name: "Not found Error",
      message:err.message
    })
  }

  if (err.name === 'ZodError') {
    // Transform ZodError.errors array to an object like { fieldName: [msg1, msg2] }
    const formattedErrors = err.errors.reduce((acc, e) => {
      const field = e.path.length ? e.path.join('.') : '_';
      if (!acc[field]) acc[field] = [];
      acc[field].push(e.message);
      return acc;
    }, {});

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: formattedErrors,
    });
  }

  res.status(err.status || err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
}

module.exports = errorHandler;
