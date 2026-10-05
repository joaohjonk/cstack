// Errors shared by the HTTP adapters (fal, openai-image).
// A request that never left this machine costs nothing (F46: five calls that failed before reaching fal were booked as
// charged). Connection refusals, DNS failures, TLS failures and a malformed key header all fail before the host sees the
// request; a reset or timeout after sending might have been accepted, so those stay booked.
const NEVER_SENT = /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|UND_ERR_CONNECT_TIMEOUT|ERR_INVALID_CHAR|ERR_INVALID_HTTP_TOKEN|CERT_|ERR_TLS_CERT|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_)/;

/** Mark an error as one that never reached the provider: the ledger books it as not charged. */
export function notSent(err) {
  err.not_submitted = true;
  return err;
}

/** True when a fetch error happened before the request left this machine. */
export function neverSent(err) {
  const code = String(err?.cause?.code ?? err?.code ?? '');
  return NEVER_SENT.test(code) || /invalid header value|Headers\.(append|set)|is not a legal HTTP header value/i.test(String(err?.message ?? '') + String(err?.cause?.message ?? ''));
}
