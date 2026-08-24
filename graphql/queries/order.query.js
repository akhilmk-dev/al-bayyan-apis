// Confirmed via a live test call against the store: order.fulfillments
// returns a plain list (not first/edges - it's paginated only via the
// fulfillments field itself accepting no args in this API version), each
// with its own fulfillmentLineItems.nodes.
//
// This exists because the FulfillmentLineItem ID Shopify's Returns API needs
// is NOT the same as the FulfillmentOrder line item ID this backend already
// stores (Order.line_items[].fulfillment_item_id, captured at order-sync
// time for use in fulfillmentCreateV2). FulfillmentLineItem IDs only exist
// once a real Fulfillment record exists (i.e., after shipping), so they
// have to be looked up live, keyed by the underlying LineItem ID instead.
const ORDER_FULFILLMENT_LINE_ITEMS_QUERY = `
  query OrderFulfillmentLineItems($orderId: ID!) {
    order(id: $orderId) {
      fulfillments {
        id
        fulfillmentLineItems(first: 50) {
          nodes {
            id
            lineItem { id }
          }
        }
      }
    }
  }
`;

// Shopify's recommended pattern for actually issuing a refund: query the
// suggested amounts/transactions for a given set of line items first, then
// pass that straight into refundCreate - avoids hand-computing gateway/
// parentId/amount ourselves, which would be easy to get wrong.
const SUGGESTED_REFUND_QUERY = `
  query SuggestedRefund($orderId: ID!, $refundLineItems: [RefundLineItemInput!]) {
    order(id: $orderId) {
      suggestedRefund(refundLineItems: $refundLineItems, suggestFullRefund: false) {
        amountSet { shopMoney { amount currencyCode } }
        refundLineItems {
          lineItem { id }
          quantity
        }
        suggestedTransactions {
          amountSet { shopMoney { amount currencyCode } }
          gateway
          parentTransaction { id }
        }
      }
    }
  }
`;

module.exports = { ORDER_FULFILLMENT_LINE_ITEMS_QUERY, SUGGESTED_REFUND_QUERY };
