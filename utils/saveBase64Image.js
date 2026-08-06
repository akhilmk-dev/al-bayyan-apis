const fs = require('fs');
const path = require('path');

const IMAGE_PATTERN = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/;
const ANY_FILE_PATTERN = /^data:(.+);base64,(.+)$/;

// Single shared base64-upload helper. By default only accepts image mime
// types (jpeg/jpg/png/webp), matching the historical image-upload behavior.
// Pass { allowAnyMimeType: true } for non-image uploads (e.g. ID proof
// documents that may be PDFs) so callers don't need to hand-roll their own
// fs/base64 writing logic.
const saveBase64Image = (base64String, folderName, options = {}) => {
  try {
    const { allowAnyMimeType = false } = options;
    const pattern = allowAnyMimeType ? ANY_FILE_PATTERN : IMAGE_PATTERN;
    const matches = base64String.match(pattern);
    if (!matches) {
      throw new Error(allowAnyMimeType ? 'Invalid base64 file format' : 'Invalid base64 image format');
    }

    const mimeType = matches[1];
    const base64Data = matches[matches.length - 1];
    const ext = mimeType.includes('/') ? mimeType.split('/')[1] : mimeType;
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `img-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    const folderPath = path.join(__dirname, '..', 'uploads', folderName);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filePath = path.join(folderPath, fileName);
    fs.writeFileSync(filePath, buffer);

    return `${folderName}/${fileName}`; // You can also return `${folderName}/${fileName}` if you prefer full path
  } catch (error) {
    throw new Error('Failed to save base64 image: ' + error.message);
  }
};

module.exports = saveBase64Image;
