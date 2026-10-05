// F94: a fixed-price promise ("$3 always", "never more than $3") cannot survive a test that shows two prices in
// public at once. Read the public copy of a round together and flag one promise made with different prices; a price
// test on such a brand needs a regional or channel split, or one price at a time.
import fs from 'node:fs';
import path from 'node:path';

// a number with optional thousands groups (2,999 or 2.999) and an optional two-digit decimal part
const NUM = '\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?';
const PRICE = new RegExp(`(?:US\\$|R\\$|USD\\s?|BRL\\s?|EUR\\s?|GBP\\s?|[$€£])\\s?(?:${NUM})|(?:${NUM})\\s?(?:USD|BRL|EUR|GBP|reais|dollars)\\b`, 'gi');
const FIXED = /\b(always|every day|everyday|forever|for good|never more than|never over|one price|sempre|todo dia|para sempre)\b/i;
const WINDOW = 40;

function norm(p) {
  const raw = p.match(/\d[\d.,]*/)[0];
  // the last separator is the decimal point only when exactly two digits follow it; the rest group thousands
  const m = raw.match(/^(.*?)(?:([.,])(\d{2}))?$/);
  const n = Number(m[1].replace(/[.,]/g, '') + (m[3] ? `.${m[3]}` : ''));
  const cur = /R\$|BRL|reais/i.test(p) ? 'BRL' : /€|EUR/i.test(p) ? 'EUR' : /£|GBP/i.test(p) ? 'GBP' : 'USD';
  return `${cur} ${n.toFixed(2)}`;
}

/** Text of a copy file: tags stripped from HTML and SVG, strings kept from JSON and YAML as written. */
export function copyText(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!/\.(html?|svg|xml)$/i.test(file)) return raw;
  // block and line tags end a sentence, so two headlines in one page are two promises, not one
  return raw
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/?(p|div|h[1-6]|li|br|tr|td|th|section|article|header|footer|text|tspan|title|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** fixedPrices(text) -> [{price, said}]: prices in the same sentence as a fixed-price word, and close to it. */
export function fixedPrices(text) {
  const out = [];
  // a sentence ends at . ! ? ; followed by a space or the end ("Always $3. Sale: $2" is two), never inside 2.99
  for (const sentence of String(text).split(/[.!?;](?=\s|$)|\n|·|\|/)) {
    const said = sentence.replace(/\s+/g, ' ').trim();
    const fixed = said.match(FIXED);
    if (!fixed) continue;
    for (const m of said.matchAll(PRICE)) if (Math.abs(m.index - fixed.index) <= WINDOW) out.push({ price: norm(m[0]), said });
  }
  return out;
}

/** claimConflicts(files) -> {ok, prices: {price: [{file, said}]}, conflicts: [[price]]}: two prices promised as fixed in one currency conflict. */
export function claimConflicts(files) {
  const prices = {};
  for (const f of files) for (const p of fixedPrices(copyText(f))) (prices[p.price] ??= []).push({ file: path.resolve(f), said: p.said });
  // one promise per currency: USD 2.99 and BRL 14.90 can both be fixed in their own markets
  const byCur = {};
  for (const k of Object.keys(prices)) (byCur[k.split(' ')[0]] ??= []).push(k);
  const conflicts = Object.values(byCur).filter((v) => v.length > 1);
  return { ok: !conflicts.length, prices, conflicts };
}
