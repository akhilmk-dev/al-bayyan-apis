// All shapes below were confirmed by introspecting the live store schema
// (API version 2025-10, matching utils/shopifyGraphql.js) rather than
// guessed from docs - field/enum names here are exact.

// Cancels the order in Shopify itself (inventory restock, financial/
// fulfillment status, reporting) - previously cancelOrder only ever touched
// the local Mongo record. Cancellation is asynchronous in Shopify: the
// returned `job` just confirms it was accepted, the existing orders/updated
// webhook (routed to createOrder) picks up the final state once Shopify
// finishes.
//
// OrderCancelReason enum: CUSTOMER | DECLINED | FRAUD | INVENTORY | STAFF | OTHER
const ORDER_CANCEL_MUTATION = `
  mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $restock: Boolean!, $notifyCustomer: Boolean, $staffNote: String) {
    orderCancel(orderId: $orderId, reason: $reason, restock: $restock, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
      job {
        id
        done
      }
      orderCancelUserErrors {
        field
        message
        code
      }
    }
  }
`;

// Creates a Return with status REQUESTED, requiring merchant approval in
// Shopify admin before it proceeds (as opposed to returnCreate, which opens
// immediately). fulfillmentLineItemId comes from the order's own line items
// (stored as fulfillment_item_id at order-sync time).
//
// ReturnReason enum: SIZE_TOO_SMALL | SIZE_TOO_LARGE | UNWANTED | NOT_AS_DESCRIBED
//                   | WRONG_ITEM | DEFECTIVE | STYLE | COLOR | OTHER | UNKNOWN
// ReturnStatus enum (on the returned `return.status`): REQUESTED | OPEN | DECLINED | CANCELED | CLOSED
const RETURN_REQUEST_MUTATION = `
  mutation ReturnRequest($input: ReturnRequestInput!) {
    returnRequest(input: $input) {
      return {
        id
        name
        status
        createdAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// Reorder: Shopify has no dedicated "reorder" mutation, but
// draftOrderCreateFromOrder is the purpose-built equivalent - it duplicates
// an existing order's line items/discounts/shipping into a new Draft Order
// in one call (more faithful than manually rebuilding line items from our
// local snapshot, which would miss discounts/custom line items/tax nuance).
// The customer completes payment via the returned invoiceUrl (Shopify-hosted
// checkout); the resulting real order flows back in through the existing
// orders/create webhook once they pay - no payment details are ever stored
// or replayed by this backend.
const DRAFT_ORDER_CREATE_FROM_ORDER_MUTATION = `
  mutation DraftOrderCreateFromOrder($orderId: ID!) {
    draftOrderCreateFromOrder(orderId: $orderId) {
      draftOrder {
        id
        name
        invoiceUrl
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

module.exports = {
  ORDER_CANCEL_MUTATION,
  RETURN_REQUEST_MUTATION,
  DRAFT_ORDER_CREATE_FROM_ORDER_MUTATION
};
