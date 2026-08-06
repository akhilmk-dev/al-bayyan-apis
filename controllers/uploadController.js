// controllers/uploadController.js
const saveBase64Image = require('../utils/saveBase64Image');

const uploadBase64Image = async (req, res) => {
  try {
    const { image, folder = 'common' } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'Image base64 is required',
      });
    }

    const imagePath = saveBase64Image(image, folder);

    return res.status(200).json({
      success: true,
      path: `/uploads/${imagePath}`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  uploadBase64Image,
};
