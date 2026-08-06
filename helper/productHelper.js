const axios = require("axios");
const Order = require("../models/Order");
const shopifyClient = require("../utils/shopifyClient");

const transformShopifyProduct = (response) =>{
    const product = response.product;
  
    // 1. Market IDs (from publications)
    const marketIds = product.resourcePublicationsV2.edges.flatMap(edge =>
      edge.node.publication.catalog?.markets?.edges.map(m => m.node.id) || []
    );
  
    // 2. Extract variants
    const variants = product.variants.edges.map(edge => {
      const [color, size, material] = edge.node.title.split(" / ");
  
      return {
        option1: color,
        option2: size,
        option3: material,
        price: edge.node.price,
        sku: edge.node.sku,
        inventoryLevels: edge.node.inventoryItem.inventoryLevels.edges
      };
    });
  
    // 3. Build options dynamically
    const optionMap = {
      Color: new Set(),
      Size: new Set(),
      Material: new Set()
    };
  
    variants.forEach(v => {
      optionMap.Color.add(v.option1);
      optionMap.Size.add(v.option2);
      optionMap.Material.add(v.option3);
    });
  
    const options = Object.entries(optionMap).map(([name, values]) => ({
      name,
      values: Array.from(values)
    }));
  
    // 4. Inventory by variant (only available > 0)
    const inventoryByVariant = {};
  
    variants.forEach(variant => {
      const inventory = variant.inventoryLevels
        .flatMap(level => {
          const available = level.node.quantities.find(
            q => q.name === "available" && q.quantity > 0
          );
  
          if (!available) return [];
  
          return {
            locationId: level.node.location.id,
            quantity: available.quantity
          };
        });
  
      if (inventory.length > 0) {
        inventoryByVariant[variant.sku] = inventory;
      }
    });
  
    // 5. Final output
    return {
      marketIds,
      collectionIds: [],
      product: {
        title: product.title,
        body_html: product.bodyHtml,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags,
        metafields: [
          {
            namespace: "custom",
            key: "vendor_name",
            type: "single_line_text_field",
            value: product.vendor
          }
        ],
        options,
        variants: variants.map(v => ({
          option1: v.option1,
          option2: v.option2,
          option3: v.option3,
          price: v.price,
          sku: v.sku
        }))
      },
      inventoryByVariant
    };
  }
  
  const deleteShopifyProductById = async (productId) => {
  if (!productId) return;
  try {
    await shopifyClient.delete(`/products/${productId}.json`);

    // Optional: delete from MongoDB if exists
    // await Product.findOneAndDelete({ shopifyId: productId });

    console.log(`Rollback: deleted product ${productId}`);
  } catch (err) {
    console.error(
      "Rollback failed:",
      err.response?.data || err.message
    );
  }
};

async function getShopifyProductsCount(vendor) {
  try {
    const res = await shopifyClient.get(`/products/count.json${vendor ? `?vendor=${vendor}` : ''}`);
    return res.data?.count || 0;
  } catch (error) {
    console.error("Shopify Products Error:", error.message);
    return 0;
  }
}

async function getShopifyCustomersCount() {
  try {
    const res = await shopifyClient.get(`customers/count.json`);
    return res.data?.count || 0;
  } catch (error) {
    console.error("Shopify Products Error:", error.message);
    return 0;
  }
}

// GET 5 Recent Shopify Products
async function getRecentShopifyProducts(vendor) {
  try {
    const res = await shopifyClient.get(`/products.json?limit=5&order=created_at desc${vendor ? `&vendor=${vendor}` : ''}`);
    return res.data?.products || [];
  } catch (error) {
    console.error("Recent Products Error:", error.message);
    return [];
  }
}

async function getTotalEarnings() {
  let filter = {
    deleted_at: { $in: [null, undefined] },
    financial_status: { $in: ["paid", "authorized", "pending", "partially_paid"] }
  };

  const orders = await Order.find(filter).lean();

  let total = 0;
  orders.forEach(order => {
    total += Number(order.total_price || 0);
  });

  return total.toFixed(2);
}

async function getRecentOrders(vendorName = null) {
  let filter = { deleted_at: { $in: [null, undefined] } };

  if (vendorName) {
    filter["line_items.vendor_name"] = vendorName;
  }

  return await Order.find(filter)
    .sort({ created_at: -1 })
    .limit(5)
    .lean();
}

async function getTotalOrdersCount(vendorName = null) {
  let filter = {
    deleted_at: { $in: [null, undefined] }
  };

  if (vendorName) {
    filter["line_items.vendor_name"] = vendorName;
  }

  return await Order.countDocuments(filter);
}

module.exports = {
  transformShopifyProduct,
  deleteShopifyProductById,
  getShopifyProductsCount,
  getShopifyCustomersCount,
  getRecentShopifyProducts,
  getTotalEarnings,
  getRecentOrders,
  getTotalOrdersCount,
};