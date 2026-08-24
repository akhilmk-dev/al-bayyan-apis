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

// Approves a REQUESTED return, moving it to OPEN - the return's status field
// (not a distinct "APPROVED" status). Admin-triggered, called directly on
// approve so the local Order.returns status updates immediately rather than
// waiting on the returns/approve webhook (which also isn't necessarily
// registered in Shopify - see HANDOVER.md).
const RETURN_APPROVE_MUTATION = `
  mutation ReturnApproveRequest($input: ReturnApproveRequestInput!) {
    returnApproveRequest(input: $input) {
      return {
        id
        name
        status
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// ReturnDeclineReason enum: RETURN_PERIOD_ENDED | FINAL_SALE | OTHER
const RETURN_DECLINE_MUTATION = `
  mutation ReturnDeclineRequest($input: ReturnDeclineRequestInput!) {
    returnDeclineRequest(input: $input) {
      return {
        id
        name
        status
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// Actually moves money - takes the exact refundLineItems/transactions shape
// straight out of the suggestedRefund query below (Shopify's own recommended
// pattern: query the suggestion, then submit it as-is to refundCreate rather
// than hand-computing amounts/gateway/parentId ourselves).
const REFUND_CREATE_MUTATION = `
  mutation RefundCreate($input: RefundInput!) {
    refundCreate(input: $input) {
      refund {
        id
        totalRefundedSet { shopMoney { amount } }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Marks a return fully processed/complete - called after issuing its refund.
const RETURN_CLOSE_MUTATION = `
  mutation ReturnClose($id: ID!) {
    returnClose(id: $id) {
      return {
        id
        status
      }
      userErrors {
        field
        message
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
  RETURN_APPROVE_MUTATION,
  RETURN_DECLINE_MUTATION,
  REFUND_CREATE_MUTATION,
  RETURN_CLOSE_MUTATION,
  DRAFT_ORDER_CREATE_FROM_ORDER_MUTATION
};
