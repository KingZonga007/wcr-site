// Scripture text for episode pages. King James Version (public domain), read at build time only.
import verses from 'es-kjv/json/verses-1769.js';

const BOOK = { Psalm: 'Psalms', 'Song of Songs': 'Song of Solomon' };
const clean = (t) => t.replace(/^#\s*/, '').replace(/[\[\]]/g, '').replace(/<<[^>]*>>\s*/g, '').trim();
const MAX = 12;

// "John 3:16-17", "Psalm 130", "Isaiah 42:3" -> { ref, verses: [{n, text}], more }
export function passage(ref) {
  const m = ref.trim().match(/^((?:[1-3] )?[A-Za-z ]+?) (\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  const book = BOOK[m[1]] || m[1];
  const ch = m[2];
  let from = m[3] ? +m[3] : 1;
  let to = m[4] ? +m[4] : m[3] ? +m[3] : 200;
  const out = [];
  for (let v = from; v <= to; v++) {
    const t = verses[`${book} ${ch}:${v}`];
    if (!t) break;
    out.push({ n: v, text: clean(t) });
  }
  if (!out.length) return null;
  const more = out.length > MAX ? out[out.length - 1].n : 0;
  return { ref, verses: out.slice(0, MAX), more };
}
