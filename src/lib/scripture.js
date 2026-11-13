// Scripture text for episode pages, from the ESV (src/data/scripture-esv.json).
// Quoted under Crossway's standard use guidelines: 500 verses at most across the site,
// with the copyright notice below. The audit fails at 450 verses so there is room to act.
// When a new episode has a reading that is not in the file, the page shows the reference only.
import esv from '../data/scripture-esv.json';

export const ESV_NOTICE =
  'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. ESV Text Edition: 2025. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated in whole or in part into any other language. Used by permission. All rights reserved.';

// "John 3:16-17", "Psalm 130" -> { ref, verses: [{n, text}], more } or null
export function passage(ref) {
  const p = esv[ref.trim()];
  return p ? { ref: ref.trim(), verses: p.verses, more: p.more || 0 } : null;
}
