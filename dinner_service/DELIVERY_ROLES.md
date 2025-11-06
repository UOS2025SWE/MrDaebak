# Delivery Specialist Responsibilities

This project now distinguishes delivery staff (`user_type: RIDER`) from kitchen staff.
The delivery role intersects with the voice-order and scheduling features that were
recently updated. Use this checklist to keep operations consistent with the demo
scenario (Champagne Festival dinner, deluxe service).

## Before Leaving the Kitchen
- **Review the scheduled dispatch:** Confirm `orders.estimated_delivery_time`
  matches the customer’s requested date/time (e.g., 12월 2일 18:00).
- **Verify inventory overrides:** Cross-check custom quantities such as
  `baguette: 6`, `champagne_bottle: 2`, or other `order_item_customizations`
  returned by the staff dashboard.
- **Inspect packaging & serving style:** Ensure deluxe decorations, serving
  ware, and celebration notes match the voice assistant summary.
- **Confirm payment & address:** Validate `payment_status` and final delivery
  address in the staff dashboard before accepting the hand-off.

## On the Route
- **Update order status:** Use the staff dashboard action buttons to move the
  order from `PREPARING` → `DELIVERING` when departing, and to `COMPLETED`
  once the hand-off is done. This triggers customer notifications.
- **Monitor timing:** Aim to arrive within the scheduled window; notify the
  manager if traffic or weather will cause delays.
- **Protect the experience:** Handle champagne and baguettes carefully. The
  deluxe experience includes fresh flowers and linens—keep packaging upright
  and secure during transport.

## At the Customer Location
- **Validate the celebration request:** Reconfirm recipient name and the special
  occasion message before presenting the setup.
- **Capture proof of delivery (optional):** If policy requires, take a photo or
  secure a signature in the admin app once the customer signs off.
- **Close out the order:** Mark the delivery `COMPLETED` so the system releases
  reserved inventory and notifies the kitchen that the job is done.

These responsibilities ensure the delivery specialist complements the updated
voice-order and scheduling workflows while keeping the dining experience
consistent for every celebration.

