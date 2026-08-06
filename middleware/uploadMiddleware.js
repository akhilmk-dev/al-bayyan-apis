const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Validate only image file types
 */
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, webp).'));
  }
};

/**
 * Create multer storage dynamically based on folder
 */
const getStorage = (folder) => {
  const fullPath = path.join(__dirname, '..', 'uploads', folder);
  
  // Ensure folder exists
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }

  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, fullPath);
    },
    filename: function (req, file, cb) {
      const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, uniqueName + ext);
    }
  });
};

/**
 * Multer instance for product images (up to 5 files, image only)
 */
const uploadProductImages = multer({
  storage: getStorage('products'),
  fileFilter: imageFileFilter,
  limits: {  fileSize: 10 * 1024 * 1024 }, // 5MB per image
});

/**
 * Multer instance for category image (single, image only)
 */
const uploadCategoryImage = multer({
  storage: getStorage('categories'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadBrandImage = multer({
  storage : getStorage('brands'),
  fileFilter:imageFileFilter,
  limits:{fileSize:10*1024*1024}
});

const uploadBannerImage = multer({
  storage:getStorage("banners"),
  fileFilter:imageFileFilter,
  limits:{fileSize:10*1024*1024}
})

const uploadAgentAvatar = multer({
  storage: getStorage('agents'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = {
  uploadProductImages,
  uploadCategoryImage,
  uploadBannerImage,
  uploadBrandImage,
  uploadAgentAvatar
};
