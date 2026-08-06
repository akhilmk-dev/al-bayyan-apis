const Product = require("../models/Product");
const catchAsync = require("../utils/catchAsync");
const Order = require("../models/Order");
const User = require("../models/User");
const { deleteShopifyProductById, getRecentOrders, getRecentShopifyProducts, getShopifyCustomersCount, getShopifyProductsCount, getTotalEarnings, getTotalOrdersCount, transformShopifyProduct } = require("../helper/productHelper");
const shopifyClient = require("../utils/shopifyClient");
const { GET_ALL_Product, GET_MARKETS, GET_PROVINCES, MARKET_CATALOG_QUERY, PRODUCT_MARKETS_QUERY, PUBLISH_TO_CATALOG } = require("../graphql/queries/product.query");
const { PUBLISH_PRODUCT_MUTATION } = require("../graphql/mutations/product.mutation");
const shopifyGraphql = require("../utils/shopifyGraphql");

const createProductAndPublishToMarkets = async (req, res) => {
  let createdProductId = null;
  try {
    const { product, marketIds = [], inventoryByVariant = {}, collectionIds = [] } = req.body;
    // 1️ Create product
    const { data } = await shopifyClient.post("/products.json", { product });
    const shopifyProduct = data.product;
    const productGid = `gid://shopify/Product/${shopifyProduct.id}`;
    createdProductId = shopifyProduct.id

    for (const collectionId of collectionIds) {
      await shopifyClient.post("/collects.json", {
        collect: {
          product_id: createdProductId,
          collection_id: collectionId
        }
      });
    }

    // 2️ Inventory
    for (const variant of shopifyProduct.variants) {
      for (const loc of inventoryByVariant[variant.sku] || []) {
        await shopifyClient.post("/inventory_levels/set.json", {
          location_id: Number(loc.locationId.replace("gid://shopify/Location/", "")),
          inventory_item_id: variant.inventory_item_id,
          available: loc.quantity
        });
      }
    }

    // 3️ Publish to markets
    for (const marketId of marketIds) {
      const { data } = await shopifyGraphql.post("", {
        query: MARKET_CATALOG_QUERY,
        variables: { marketId }
      });

      const catalogs = data.data.market?.catalogs?.nodes || [];

      for (const catalog of catalogs) {
        await shopifyGraphql.post("", {
          query: PUBLISH_PRODUCT_MUTATION,
          variables: {
            publicationId: catalog.publication.id,
            productId: productGid
          }
        });
      }
    }

    res.status(201).json({
      message: "Product created & published",
      shopifyProductId: shopifyProduct.id
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    if (createdProductId) {
      await deleteShopifyProductById(createdProductId);
    }
    res.status(500).json({ error: "Product creation failed" });
  }
};

const getProducts = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const user = await User.findById(req.user?.id)?.populate("role");

  let { search, vendor_name, after, before,collectionId } = req.query;

  if (user?.role?.role_name?.toLowerCase() === "vendor") {
    vendor_name = user.name;
  }

  // Build query
  let queryString = "";
  // 2. title / search filter

  // 1. collection filter
  if (collectionId) {
    const collectionFilter = `collection_id:${collectionId}`;
  
    queryString += queryString
      ? ` AND ${collectionFilter}`
      : collectionFilter;
  }else{
    if (search) {
      const titleFilter = `title:*${search}*`;
    
      queryString += queryString
        ? ` AND ${titleFilter}`
        : titleFilter;
    }
  }
  
  // 3. vendor filter
  if (vendor_name) {
    const safeVendor = vendor_name.replace(/"/g, '\\"');
    const vendorFilter = `vendor:"${safeVendor}"`;
  
    queryString += queryString
      ? ` AND ${vendorFilter}`
      : vendorFilter;
  }
  
  const variables = {
    query: queryString || null,
  };

  if (after) {
    variables.first = limit;
    variables.after = after;
  } else if (before) {
    variables.last = limit;
    variables.before = before;
  } else {
    variables.first = limit; // initial load
  }
  const response = await shopifyGraphql.post("", {
    query: GET_ALL_Product,
    variables,
  });

  let productsData = [];
  if(collectionId){
    productsData = response.data.data.products?.edges.map(e => e.node)?.filter(p =>
      p.title.toLowerCase().includes(search.toLowerCase())
    );
  }else{
    productsData=response.data.data.products?.edges.map(e => e.node)
  }
  const totalCountResponse = await shopifyClient.get("/products/count.json"); 
  const totalProductCount = totalCountResponse.data.count;
  res.status(200).json({
    status: "success",
    data: productsData,
    pageInfo: response.data.data.products?.pageInfo,
    total: productsData?.length,
    totalPages: totalProductCount,
  });
});

const deleteProduct = async (req, res) => {
  const { productId } = req.params;

  if (!productId) {
    return res.status(500).json({ message: "Product ID is required" });
  }

  try {
    // 1 Delete product from Shopify
    await shopifyClient.delete(`/products/${productId}.json`);

    //  Delete product from MongoDB
    const deletedProduct = await Product.findOneAndDelete({ shopifyId: productId });

    res.status(200).json({
      message: "Product deleted successfully",
      product: deletedProduct || null,
    });
  } catch (err) {
    console.error("Error deleting product:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      message: "Failed to delete product",
      details: err.response?.data || err.message,
    });
  }
};

const getProductById = async (req, res) => {
  const { productId } = req.params;

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  try {
    /* ----------------------------------------------------
    GET PRODUCT (REST)
    ---------------------------------------------------- */
    const productRes = await shopifyClient.get(`/products/${productId}.json`);

    const collectionRes = await shopifyClient.get(`/collects.json?product_id=${productId}`);
    const collectionIds = collectionRes.data.collects?.map(item => item?.collection_id)
    const shopifyProduct = productRes.data.product;

    /* ----------------------------------------------------
      GET METAFIELDS (REST)
    ---------------------------------------------------- */
    const metafieldsRes = await shopifyClient.get(`/products/${productId}/metafields.json`);

    const metafields = metafieldsRes.data.metafields.map((mf) => ({
      namespace: mf.namespace,
      key: mf.key,
      type: mf.type,
      value: mf.value,
    }));

    /* ----------------------------------------------------
      BUILD PRODUCT PAYLOAD (CREATE/UPDATE FORMAT)
    ---------------------------------------------------- */
    const productPayload = {
      id: shopifyProduct.id,
      title: shopifyProduct.title,
      body_html: shopifyProduct.body_html,
      vendor: shopifyProduct.vendor,
      product_type: shopifyProduct.product_type,
      handle:shopifyProduct.handle,
      price: shopifyProduct.price,
      images: shopifyProduct.images,
      status: shopifyProduct.status,
      tags: shopifyProduct.tags
        ? shopifyProduct.tags.split(",").map((t) => t.trim())
        : [],
      metafields,
      options: shopifyProduct.options.map((opt) => ({
        name: opt.name,
        values: opt.values,
      })),
      variants: shopifyProduct.variants.map((v) => ({
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
        price: v.price,
        sku: v.sku,
        tracked: v.tracked,
      })),
    };

    /* ----------------------------------------------------
      INVENTORY BY VARIANT & LOCATION
    ---------------------------------------------------- */
    const inventoryByVariant = {};

    for (const variant of shopifyProduct.variants) {
      const invRes = await shopifyClient.get("/inventory_levels.json", {
        params: {
          inventory_item_ids: variant.inventory_item_id,
        },
      }
      );

      inventoryByVariant[variant.sku] = invRes.data.inventory_levels.map(
        (level) => ({
          locationId: `gid://shopify/Location/${level.location_id}`,
          quantity: level.available,
        })
      );
    }

    /* ----------------------------------------------------
       GET MARKET IDS (GraphQL – CORRECT WAY)
    ---------------------------------------------------- */
    const marketRes = await shopifyGraphql.post("", {
      query: PRODUCT_MARKETS_QUERY,
      variables: {
        id: `gid://shopify/Product/${productId}`,
      },
    });

    const marketIdsSet = new Set();

    const nodes =
      marketRes?.data?.data?.product?.resourcePublicationsV2?.nodes || [];

    nodes.forEach((node) => {
      const markets = node?.publication?.catalog?.markets?.nodes || [];
      markets.forEach((market) => {
        marketIdsSet.add(market.id);
      });
    });

    const marketIds = Array.from(marketIdsSet);

    /* ----------------------------------------------------
      GET COLLECTION IDS (MONGODB)
    ---------------------------------------------------- */
    const mongoProduct = await Product.findOne({ shopifyId: productId });

    /* ----------------------------------------------------
       FINAL SINGLE-API RESPONSE
    ---------------------------------------------------- */
    return res.status(200).json({
      marketIds,
      collectionIds,
      product: productPayload,
      inventoryByVariant,
    });
  } catch (error) {
    console.error("GET PRODUCT ERROR:", error.response?.data || error.message);
    return res.status(500).json({
      message: "Failed to fetch product details",
      error: error.response?.data || error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  const { productId } = req.params;
  const {
    product,
    inventoryByVariant = {},
    collectionIds = [],
    marketIds = []
  } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  let originalProduct = null;

  try {
    /* --------------------------------------------------
        BACKUP PRODUCT (ROLLBACK SAFETY)
    -------------------------------------------------- */
    const originalRes = await shopifyClient.get(`/products/${productId}.json`);
    originalProduct = originalRes.data.product;

    /* --------------------------------------------------
        UPDATE PRODUCT CORE (REST)
    -------------------------------------------------- */
    const cleanProduct = {
      title: product.title,
      body_html: product.body_html,
      vendor: product.vendor,
      product_type: product.product_type,
      status: product.status,
      tags: product.tags?.join(","),
      options: product.options,
      variants: product.variants.map(v => ({
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
        price: v.price,
        sku: v.sku,
        inventory_management: "shopify"
      }))
    };

    const updateRes = await shopifyClient.put(`/products/${productId}.json`, { product: cleanProduct });

    const updatedShopifyProduct = updateRes.data.product;

    /* --------------------------------------------------
     UPDATE METAFIELDS
    -------------------------------------------------- */
    if (product.metafields?.length) {
      for (const mf of product.metafields) {
        await shopifyClient.post(`/products/${productId}/metafields.json`, { metafield: mf });
      }
    }

    /* --------------------------------------------------
        UPDATE INVENTORY (PER VARIANT, PER LOCATION)
    -------------------------------------------------- */
    let totalStock = 0;

    for (const variant of updatedShopifyProduct.variants) {
      const inventoryList = inventoryByVariant[variant.sku] || [];

      for (const inv of inventoryList) {
        const locationId = Number(inv.locationId.replace("gid://shopify/Location/", ""));

        await shopifyClient.post(`/inventory_levels/set.json`,
          {
            inventory_item_id: variant.inventory_item_id,
            location_id: locationId,
            available: inv.quantity
          }
        );

        totalStock += inv.quantity;
      }
    }

    /* --------------------------------------------------
      UPDATE COLLECTIONS
    -------------------------------------------------- */
    const existingCollectsRes = await shopifyClient.get(`/collects.json?product_id=${productId}`);
    const existingCollects = existingCollectsRes.data.collects;

    const existingCollectionIds = existingCollects.map(c => Number(c.collection_id));
    const desiredCollectionIds = collectionIds.map(id => Number(id));

    const toDelete = existingCollects.filter(
      c => !desiredCollectionIds.includes(Number(c.collection_id))
    );

    const toAdd = desiredCollectionIds.filter(
      id => !existingCollectionIds.includes(id)
    );

    // Delete
    for (const collect of toDelete) {
      await shopifyClient.delete(`/collects/${collect.id}.json`);
    }

    // Add
    for (const cid of toAdd) {
      await shopifyClient.post(`/collects.json`, {
        collect: {
          product_id: Number(productId),
          collection_id: cid,
        },
      });
    }

    /* --------------------------------------------------
      UPDATE MARKETS (PUBLISH)
    -------------------------------------------------- */
    const productGid = `gid://shopify/Product/${productId}`;

    for (const marketId of marketIds) {
      const catalogRes = await shopifyGraphql.post("", {
        query: MARKET_CATALOG_QUERY,
        variables: { id: marketId }
      });

      const catalogs =
        catalogRes?.data?.data?.market?.catalogs?.nodes || [];

      for (const catalog of catalogs) {
        await shopifyGraphql.post("", {
          query: PUBLISH_TO_CATALOG,
          variables: {
            id: productGid,
            publicationId: catalog.publication.id
          }
        });
      }
    }

    return res.status(200).json({
      message: "Product updated successfully",
      data: {
        shopify: updatedShopifyProduct
      }
    });

  } catch (error) {
    console.error("UPDATE ERROR:", error);

    /* --------------------------------------------------
       ROLLBACK
    -------------------------------------------------- */
    if (originalProduct) {
      await shopifyClient.put(`/products/${productId}.json`, { product: originalProduct });
    }

    return res.status(500).json({
      error: "Failed to update product",
      details: error.response?.data || error.message,
    });
  }
};

const shopifyProductDeleteWebhook = async (req, res) => {
  try {
    const data = req.body;
    const shopifyProductId = data.id;

    if (!shopifyProductId) {
      return res.status(400).json({ message: "Shopify product ID missing" });
    }
    // Delete from MongoDB
    const deleted = await Product.findOneAndDelete({ shopifyId: shopifyProductId });
    // Important: Respond with 200 so Shopify knows webhook succeeded
    return res.status(200).json({ success: true, message: "Product deleted locally" });
  } catch (error) {
    console.error("SHOPIFY DELETE WEBHOOK ERROR:", error);
    return res.status(500).json({ message: "Error processing webhook" });
  }
};

const updateVariantQuantity = catchAsync(async (req, res, next) => {
  const { productId, variantId } = req.params;
  const { quantity } = req.body;

  if (!variantId || !productId || quantity === undefined) {
    return res.status(400).json({ message: "productId, variantId and quantity are required" });
  }

  try {
    // 1. Get variant to fetch inventory_item_id
    const variantRes = await shopifyClient.get(`/variants/${variantId}.json`);

    const inventoryItemId = variantRes.data?.variant?.inventory_item_id;

    // 2. Get location id
    const locRes = await shopifyClient.get("/locations.json");

    const locationId = locRes.data.locations[0].id;

    // 3. Update inventory level
    const updateRes = await shopifyClient.post("/inventory_levels/set.json", {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: Number(quantity),
    });

    res.status(200).json({
      message: "Variant quantity updated successfully",
      data: updateRes.data,
    });
  } catch (error) {
    console.error("Variant quantity update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update variant quantity",
      details: error.response?.data || error.message,
    });
  }
});

const updateVariantPrice = catchAsync(async (req, res, next) => {
  const { productId, variantId } = req.params;
  const { price } = req.body;

  if (!variantId || !productId || price === undefined) {
    return res.status(400).json({ message: "productId, variantId and price are required" });
  }

  try {
    const response = await shopifyClient.put(`/variants/${variantId}.json`, {
      variant: { id: variantId, price: Number(price) },
    });

    res.status(200).json({
      message: "Variant price updated successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("Variant price update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update variant price",
      details: error.response?.data || error.message,
    });
  }
});

const updateProductPrice = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { price } = req.body;

  if (!productId || price === undefined) {
    return res.status(400).json({ message: "productId and price are required" });
  }

  try {
    // Simple product means only 1 variant
    const response = await shopifyClient.put(`/products/${productId}.json`, {
      product: {
        id: productId,
        variants: [{ price: Number(price) }],
      },
    });

    res.status(200).json({
      message: "Product price updated successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("Product price update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update product price",
      details: error.response?.data || error.message,
    });
  }
});

const updateProductQuantity = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { quantity } = req.body;

  if (!productId || quantity === undefined) {
    return res.status(400).json({ message: "productId and quantity are required" });
  }

  try {
    // step 1: get product → get first variant id
    const productRes = await shopifyClient.get(`/products/${productId}.json`);

    const variant = productRes.data.product.variants[0];
    const variantId = variant.id;
    const inventoryItemId = variant.inventory_item_id;

    // step 2: get location id
    const locRes = await shopifyClient.get("/locations.json");

    const locationId = locRes.data.locations[0].id;

    // step 3: update inventory
    const updateRes = await shopifyClient.post("/inventory_levels/set.json", {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: Number(quantity),
    });

    res.status(200).json({
      message: "Product quantity updated successfully",
      data: updateRes.data,
    });
  } catch (error) {
    console.error("Product qty update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update product quantity",
      details: error.response?.data || error.message,
    });
  }
});

const getDashboardStats = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id)?.populate('role');
    let vendor = null;
    if (user?.role?.role_name?.toLowerCase() == "vendor") {

      vendor = user.name
    }
    // TOTAL PRODUCTS (SHOPIFY)
    const totalProducts = await getShopifyProductsCount();
    const totalCustomers = await getShopifyCustomersCount();
    // TOTAL ORDERS (ADMIN)
    const totalOrders = await getTotalOrdersCount();
    // RECENT 5 ORDERS
    const recentOrders = await getRecentOrders();
    // TOTAL EARNINGS
    const totalEarnings = await getTotalEarnings();
    // RECENT 5 PRODUCTS (SHOPIFY)
    const recentProducts = await getRecentShopifyProducts();

    // Define all possible statuses
    const ORDER_STATUSES = ["paid", "unpaid", "pending", "refunded"];

    const orderStatusAggregation = await Order.aggregate([
      {
        $match: {
          deleted_at: { $in: [null, undefined] }
        }
      },
      {
        $group: {
          _id: "$financial_status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize with 0 for all statuses
    const orderStatusDistribution = {};
    ORDER_STATUSES.forEach(status => {
      orderStatusDistribution[status] = 0;
    });

    // Fill actual counts from aggregation
    orderStatusAggregation.forEach(item => {
      const status = item._id?.toLowerCase();
      if (ORDER_STATUSES.includes(status)) {
        orderStatusDistribution[status] = item.count;
      }
    });


    // // RECENT 5 ORDERS
    // const recentOrders = await Order.find(vendorFilter)
    //   .sort({ createdAt: -1 })
    //   .limit(5);

    return res.status(200).json({
      status: "success",
      data: {
        counts: {
          totalOrders,
          // totalSales,
          totalEarnings,
          totalProducts,
          totalCustomers,
        },
        recentProducts,
        recentOrders,
        orderStatusDistribution
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);

    return res.status(500).json({
      status: "error",
      message: "Dashboard API failed",
      details: error.message,
    });
  }
};

const getMarkets = async (req, res) => {
  try {
    const response = await shopifyGraphql.post("", { query: GET_MARKETS });
    res.status(200).json({
      success: true,
      markets: response.data.data.markets.nodes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
};

const getProvinces = async (req, res) => {
  try {
    const response = await shopifyGraphql.post("", { query: GET_PROVINCES });
    const result = JSON.parse(response.data.data.metafieldDefinitions.edges?.[0]?.node?.validations?.[0].value) || []
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
};

module.exports = {
  createProductAndPublishToMarkets,
  getProducts,
  deleteProduct,
  getProductById,
  updateProduct,
  shopifyProductDeleteWebhook,
  updateVariantQuantity,
  updateVariantPrice,
  updateProductPrice,
  updateProductQuantity,
  getDashboardStats,
  getMarkets,
  getProvinces,
};