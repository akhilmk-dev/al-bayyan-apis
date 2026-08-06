
const catchAsync = require('../utils/catchAsync');
const saveBase64Image = require('../utils/saveBase64Image');
const {
  NotFoundError,
  InternalServerError,
} = require('../utils/customErrors');
const CollectionImage = require('../models/CollectionImageSchema');
const getFullUrl = require('../utils/fullUrl');

/**
 * Create Collection Image
 */
exports.createCollectionImage = catchAsync(async (req, res) => {
  const { collectionId, image,collection_name } = req.body;

  // Check if collectionId already exists
  const existing = await CollectionImage.findOne({ collectionId });
  if (existing) {
    return res.status(409).json({
      status: 'fail',
      message: 'Collection image already exists for this collection'
    });
  }

  const imagePath = saveBase64Image(image, 'collection-images');

  const collectionImage = new CollectionImage({
    collectionId,
    image: imagePath,
    collection_name
  });

  await collectionImage.save();

  res.status(201).json({
    status: 'success',
    data: {
      ...collectionImage.toObject(),
      image: getFullUrl(req, collectionImage.image)
    }
  });
});

/**
 * Get Collection Image by ID
 */
exports.getCollectionImage = catchAsync(async (req, res) => {
  const { id } = req.params;

  const collectionImage = await CollectionImage.findById(id);
  if (!collectionImage) {
    throw new NotFoundError('Collection image not found');
  }

  res.status(200).json({
    status: 'success',
    data: {
      ...collectionImage.toObject(),
      image: getFullUrl(req, collectionImage.image)
    },
  });
});

/**
 * Get All Collection Images
 * (optionally filtered by collectionId)
 */
exports.getCollectionImages = catchAsync(async (req, res) => {
  const filter = {};

  if (req.query.collectionId) {
    filter.collectionId = req.query.collectionId;
  }

  const images = await CollectionImage.find(filter).sort({ sortOrder: 1 });

  res.status(200).json({
    status: 'success',
    data: images.map(img => ({
      ...img.toObject(),
      image: getFullUrl(req, img.image)
    })),
  });
});

/**
 * Update Collection Image
 */
exports.updateCollectionImage = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { collectionId, image,collection_name } = req.body;

  const collectionImage = await CollectionImage.findById(id);
  if (!collectionImage) {
    throw new NotFoundError('Collection image not found');
  }

  // UNIQUE CHECK (exclude current document)
  if (collectionId && collectionId.toString() !== collectionImage.collectionId.toString()) {
    const exists = await CollectionImage.findOne({
      collectionId,
      _id: { $ne: id } // 👈 exclude current record
    });

    if (exists) {
      return res.status(409).json({
        status: 'fail',
        message: 'Collection image already exists for this collection'
      });
    }

    collectionImage.collectionId = collectionId;
  
  }

  // Update image only if new base64 is sent
  if (image && !image.startsWith('http')) {
    const imagePath = saveBase64Image(image, 'collection-images');
    collectionImage.image = imagePath;
  }
  collectionImage.collection_name = collection_name;
  await collectionImage.save();

  res.status(200).json({
    status: 'success',
    data: {
      ...collectionImage.toObject(),
      image: getFullUrl(req, collectionImage.image)
    }
  });
});


/**
 * Delete Collection Image
 */
exports.deleteCollectionImage = catchAsync(async (req, res) => {
  const { id } = req.params;

  const collectionImage = await CollectionImage.findById(id);
  if (!collectionImage) {
    throw new NotFoundError('Collection image not found');
  }

  await collectionImage.deleteOne();

  res.status(200).json({
    status: 'success',
    message: 'Collection image deleted successfully',
  });
});
