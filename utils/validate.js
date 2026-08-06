const { z } = require('zod');

function validateMiddleware(schema) {

  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data;
      return next();
    }

    const tree = z.treeifyError(result.error).properties;
    const formattedErrors = {};

    for (const key in tree) {
      const field = tree[key];

      // If it's a basic field with errors
      if (Array.isArray(field.errors) && field.errors.length > 0) {
        formattedErrors[key] = field.errors.map(e => e.message || String(e));
      }

      // If it's an array with errors in items
      if (field.items && typeof field.items === 'object') {
        Object.entries(field.items).forEach(([index, itemError]) => {
          const itemKey = `${key}[${index}]`;
          if (itemError.errors && Array.isArray(itemError.errors)) {
            formattedErrors[itemKey] = itemError.errors.map(e => e.message || String(e));
          }
        });
      }
    }

    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: formattedErrors,
    });
  };
}

module.exports = validateMiddleware;
