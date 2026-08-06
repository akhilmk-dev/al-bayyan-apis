
const CollectionImageSchema = require('../models/CollectionImageSchema');
const Item = require('../models/Item');
const catchAsync = require('../utils/catchAsync');
const {
  NotFoundError,
  ConflictError,
  InternalServerError,
} = require('../utils/customErrors');

/**
 * Create Item
 */
exports.createItem = catchAsync(async (req, res) => {
  const { type, sortOrder, data } = req.body;

  const item = new Item({
    type,
    sortOrder,
    data,
  });

  await item.save();

  res.status(201).json({
    status: 'success',
    data: item,
  });
});

/**
 * Get Item by ID
 */
exports.getItem = catchAsync(async (req, res) => {
  const { id } = req.params;

  const item = await Item.findById(id);
  if (!item) throw new NotFoundError('Item not found');

  res.status(200).json({
    status: 'success',
    data: item,
  });
});

/**
 * Update Item
 */
exports.updateItem = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { type, sortOrder, data } = req.body;

  const item = await Item.findById(id);
  if (!item) throw new NotFoundError('Item not found');

  if (type !== undefined) item.type = type;
  if (sortOrder !== undefined) item.sortOrder = sortOrder;
  if (data !== undefined) item.data = data;

  await item.save();

  res.status(200).json({
    status: 'success',
    data: item,
  });
});

/**
 * Delete Item
 */
exports.deleteItem = catchAsync(async (req, res) => {
  const { id } = req.params;

  const item = await Item.findById(id);
  if (!item) throw new NotFoundError('Item not found');

  await item.deleteOne();

  res.status(200).json({
    status: 'success',
    message: 'Item deleted successfully',
  });
});

exports.getItems = catchAsync(async (req, res) => {
    const items = await Item.find().sort({ sortOrder: 1 });
    res.status(200).json({ status: 'success', data: items });
});

const toCollectionGid = (id) => {
  if (!id) return null;
  if (String(id).startsWith('gid://')) return id;
  return `gid://shopify/Collection/${id}`;
};

const withBaseUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${process.env.BASE_URL_TWO}${path.replace(/^\/+/, '')}`;
};

exports.getHomePageData = catchAsync(async (req, res) => {
  const items = await Item.find().sort({ sortOrder: 1 }).lean();

  // 1. Collect ALL collection IDs from everywhere
  const collectionIds = new Set();

  for (const item of items) {
    const data = JSON.parse(item.data || '{}');

    if (item.type === 'Collection List') {
      data.collectionIds?.forEach(id => collectionIds.add(Number(id)));
    }

    if (item.type === 'Product List' && data.collectionId) {
      collectionIds.add(Number(data.collectionId));
    }

    if (['Sliders', 'Banners'].includes(item.type)) {
      data.items?.forEach(i => {
        if (i.linkType === 'Collection' && i.id) {
          collectionIds.add(Number(i.id));
        }
      });
    }
  }

  // 2. Fetch collection images
  const collectionImages = await CollectionImageSchema.find({
    collectionId: { $in: [...collectionIds] }
  }).lean();

  // 3. Image lookup map
  const collectionImageMap = {};
  for (const img of collectionImages) {
    collectionImageMap[img.collectionId] = withBaseUrl(
      `uploads/${img.image}`
    );
  }

  // 4. Build final response
  const homeData = items.map(item => {
    const parsedData = JSON.parse(item.data || '{}');

    // Collection List
    if (item.type === 'Collection List') {
      parsedData.collections = (parsedData.collectionIds || []).map(id => ({
        collectionId: toCollectionGid(id),
        collection_name:collectionImages.filter(item=>item?.collectionId == id)?.[0]?.collection_name,
        image: collectionImageMap[id] || null
      }));
      delete parsedData.collectionIds;
    }

    // Product List
    if (item.type === 'Product List' && parsedData.collectionId) {
      parsedData.collectionId = toCollectionGid(parsedData.collectionId);
    }

    // Sliders & Banners
    if (['Sliders', 'Banners'].includes(item.type)) {
      parsedData.items = (parsedData.items || []).map(i => ({
        ...i,
        id:
          i.linkType === 'Collection'
            ? toCollectionGid(i.id)
            : i.id,
        file: withBaseUrl(i.file)
      }));
    }

    return {
      type: item.type,
      sortOrder: item.sortOrder,
      data: parsedData
    };
  });

  res.status(200).json({
    status: 'success',
    data: homeData
  });
});
