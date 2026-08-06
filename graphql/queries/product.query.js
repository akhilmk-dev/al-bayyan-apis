const MARKET_CATALOG_QUERY = `
  query MarketCatalogPublications($marketId: ID!) {
    market(id: $marketId) {
      id
      name
      catalogs(first: 10) {
        nodes {
          id
          publication {
            id
          }
        }
      }
    }
  }
`;
const PRODUCT_BY_ID_QUERY = `
  query ProductWithInventory($id: ID!, $inventoryLevelsFirst: Int!) {
    product(id: $id) {
      id
      title
      vendor
      productType
      bodyHtml
      tags
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            price
          }
        }
      }
    }
  }
`;

const PRODUCT_MARKETS_QUERY = `
  query ProductMarkets($id: ID!) {
    product(id: $id) {
      id
      title
      resourcePublicationsV2(catalogType: MARKET, first: 50) {
        nodes {
          publication {
            id
            catalog {
              __typename
              ... on MarketCatalog {
                markets(first: 50) {
                  nodes {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PUBLISH_TO_CATALOG = `
mutation PublishToCatalog($id: ID!, $publicationId: ID!) {
  publishablePublish(id: $id, publicationId: $publicationId) {
    userErrors {
      field
      message
    }
  }
}
`;

const GET_ALL_Product = `
query GetProducts(
  $first: Int
  $last: Int
  $after: String
  $before: String
  $query: String
) {
  products(
    first: $first
    last: $last
    after: $after
    before: $before
    query: $query
    sortKey: CREATED_AT
    reverse: true
  ) {
    edges {
      cursor
      node {
        id
        legacyResourceId
        title
        handle
        vendor
        productType
        tags
        status
        descriptionHtml
        createdAt
        updatedAt
        options {
          id
          name
          values
        }
        images(first: 20) {
          edges {
            node {
              id
              src
              altText
              width
              height
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
              availableForSale
              selectedOptions {
                name
                value
              }
              barcode
              image {
                id
                src
                altText
              }
              unitPrice {
                amount
                currencyCode
              }
              unitPriceMeasurement {
                measuredType
                quantityUnit
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
  }
}
`;

const GET_PROVINCES = `
query GetProvinceSelectorOptions {
metafieldDefinitions(
first: 1
ownerType: PRODUCT
namespace: "availability"
key: "provinces_oman"
) {
edges {
node {
id
name
namespace
key
type {
name
}
validations {
name
value
}
}
}
}
}
`

const GET_MARKETS = `
query GetMarketsWithCountries {
markets(first: 10) {
nodes {
id
name
primary
enabled
currencySettings {
baseCurrency {
currencyCode
}
}
conditions {
regionsCondition {
regions(first: 50) {
  nodes {
    ... on MarketRegionCountry {
      id
      name
      code
    }
  }
}
}
}
}
}
}
`

module.exports = {
  MARKET_CATALOG_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCT_MARKETS_QUERY,
  PUBLISH_TO_CATALOG,
  GET_ALL_Product,
  GET_PROVINCES,
  GET_MARKETS,
};