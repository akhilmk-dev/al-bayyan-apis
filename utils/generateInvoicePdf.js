const PDFDocument = require('pdfkit');

const STORE_NAME = 'Al Bayyan';

const fmt = (value, currency) => `${currency ? currency + ' ' : ''}${Number(value || 0).toFixed(2)}`;

const drawLineItemsTable = (doc, order) => {
   const columns = { title: 40, qty: 300, price: 360, total: 440 };
   const currency = order.currency;

   doc.font('Helvetica-Bold').fontSize(10);
   const headerY = doc.y;
   doc.text('Item', columns.title, headerY);
   doc.text('Qty', columns.qty, headerY);
   doc.text('Price', columns.price, headerY);
   doc.text('Total', columns.total, headerY);
   doc.y = headerY + doc.currentLineHeight();
   doc.moveDown(0.5);
   doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cccccc').stroke();
   doc.moveDown(0.3);

   doc.font('Helvetica').fontSize(10);

   const items = order.line_items || [];
   if (items.length === 0) {
      doc.text('No items', columns.title, doc.y);
      doc.moveDown();
      return;
   }

   items.forEach((item) => {
      if (doc.y > 700) {
         doc.addPage();
      }
      const y = doc.y;
      const price = item.price || 0;
      const qty = item.quantity || 0;
      const lineTotal = price * qty - (item.total_discount || 0);

      doc.text(item.title || item.name || 'Item', columns.title, y, { width: 250 });
      doc.text(String(qty), columns.qty, y, { width: 50 });
      doc.text(fmt(price, currency), columns.price, y, { width: 70 });
      doc.text(fmt(lineTotal, currency), columns.total, y, { width: 90 });
      doc.moveDown(0.8);
   });
};

const drawTotals = (doc, order) => {
   const currency = order.currency;
   const labelX = 360;
   const valueX = 460;

   doc.moveDown();
   doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cccccc').stroke();
   doc.moveDown(0.5);

   const row = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      const rowY = doc.y;
      doc.text(label, labelX, rowY, { width: 90 });
      doc.text(fmt(value, currency), valueX, rowY, { width: 90 });
      doc.y = rowY + doc.currentLineHeight();
      doc.moveDown(0.5);
   };

   row('Subtotal', order.subtotal_price);
   if (order.total_discounts) row('Discounts', -order.total_discounts);
   row('Tax', order.total_tax);
   if (order.delivery_amount) row('Delivery', order.delivery_amount);
   if (order.total_refunded) row('Refunded', -order.total_refunded);
   row('Total', order.total_price, true);
};

const drawShippingAddress = (doc, order) => {
   const address = order.shipping_address?.address1
      ? order.shipping_address
      : order.customer?.default_address;

   doc.font('Helvetica-Bold').fontSize(10).text('Ship To', 40, doc.y);
   doc.font('Helvetica').fontSize(10);

   if (!address) {
      doc.text('Not available');
      doc.moveDown();
      return;
   }

   const name = [address.first_name, address.last_name].filter(Boolean).join(' ');
   const lines = [
      name,
      address.company,
      address.address1,
      address.address2,
      [address.city, address.country].filter(Boolean).join(', '),
      address.phone,
   ].filter(Boolean);

   lines.forEach((line) => doc.text(line));
   doc.moveDown();
};

// Builds a PDF invoice from an Order document (plain object, e.g. from
// .lean()). Renders best-effort with whatever fields are present rather than
// erroring - the customer should still be able to see what they were charged
// even for a cancelled/refunded/incomplete order.
const generateInvoicePdf = (order) => {
   const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

   doc.font('Helvetica-Bold').fontSize(18).text(STORE_NAME);
   doc.font('Helvetica').fontSize(10).text(process.env.SHOPIFY_BASE_URL || '');
   doc.moveDown();

   if (order.cancelled_at) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('red').text('CANCELLED');
      doc.fillColor('black');
      doc.moveDown(0.5);
   }

   doc.font('Helvetica-Bold').fontSize(14).text(`Invoice - ${order.name || order.order_number || order.order_id}`);
   doc.font('Helvetica').fontSize(10);
   doc.text(`Order date: ${order.created_at ? new Date(order.created_at).toDateString() : 'N/A'}`);
   doc.text(`Payment status: ${order.financial_status || 'N/A'}`);
   if (order.payment_gate_way) doc.text(`Payment method: ${order.payment_gate_way}`);
   const contactEmail = order.contact_email || order.email || order.customer?.email;
   if (contactEmail) doc.text(`Email: ${contactEmail}`);
   if (order.phone) doc.text(`Phone: ${order.phone}`);
   doc.moveDown();

   drawShippingAddress(doc, order);
   drawLineItemsTable(doc, order);
   drawTotals(doc, order);

   doc.fontSize(8).fillColor('#888888');
   const pageCount = doc.bufferedPageRange().count;
   const bottomMargin = doc.page.margins.bottom;
   for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // suppress pdfkit's auto-page-break while drawing the footer
      doc.text(`Page ${i + 1} of ${pageCount} - ${STORE_NAME}`, 40, doc.page.height - 30, { align: 'center', width: 515 });
      doc.page.margins.bottom = bottomMargin;
   }

   return doc;
};

module.exports = { generateInvoicePdf };
