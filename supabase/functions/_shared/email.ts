// Shared email sender identity helpers.
//
// Centralises the "From" address per comm type and the From-header
// builder so every customer/host email reads as the VENDOR (display
// name + vendor reply-to), on the right address for the comm type.
//
// FROM_ORDERS — transactional order mail (order confirmations).
// FROM_HELLO  — relationship/activation mail (early access, post-drop
//               thank-you, host handoff).
export const FROM_ORDERS = "orders@lovehearth.co.uk";
export const FROM_HELLO = "hello@lovehearth.co.uk";

// Email sender. From header always quotes display_name to survive
// commas/other special chars per RFC 5322. Falls back to "Vendor" for
// a truly empty name — the From name must never be empty or a generic
// platform name. Lifted from send-order-confirmation, parameterised on
// the From address; for FROM_ORDERS the output is byte-identical to the
// previous order-confirmation From for any non-empty name.
export function buildFromHeader(displayName: string, fromAddress: string): string {
  const safe = String(displayName || "").replace(/"/g, "") || "Vendor";
  return `"${safe}" <${fromAddress}>`;
}
