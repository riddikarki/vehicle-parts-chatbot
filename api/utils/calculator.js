/**
 * Calculate discounted price based on customer grade
 * @param {number} unitPrice - Original unit price
 * @param {number} discountPercentage - Discount percentage from customer grade
 * @param {number} quantity - Quantity ordered
 * @returns {object} - Pricing breakdown
 */
function calculateDiscountedPrice(unitPrice, discountPercentage, quantity = 1) {
  const discountAmount = (unitPrice * discountPercentage) / 100;
  const discountedPrice = unitPrice - discountAmount;
  const lineTotal = discountedPrice * quantity;
  
  return {
    unitPrice,
    discountPercentage,
    discountAmount,
    discountedPrice,
    quantity,
    lineTotal
  };
}

/**
 * Calculate order totals
 * @param {array} items - Array of order items with pricing
 * @param {number} taxPercentage - Tax percentage (default 13% VAT in Nepal)
 * @returns {object} - Order totals
 */
function calculateOrderTotals(items, taxPercentage = 13) {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discountAmount = items.reduce((sum, item) => sum + (item.discountAmount * item.quantity), 0);
  const taxAmount = (subtotal * taxPercentage) / 100;
  const totalAmount = subtotal + taxAmount;
  
  return {
    subtotal,
    discountAmount,
    taxPercentage,
    taxAmount,
    totalAmount
  };
}

module.exports = {
  calculateDiscountedPrice,
  calculateOrderTotals
};