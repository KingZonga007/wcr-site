import { query } from './db.mjs';

const TAG_SEGMENTS = new Set(['musician', 'wiw_reminders', 'chart_waitlist']);

// 'all' and 'test' (handled separately by the caller) aside, a segment name is
// just a tag every matching subscriber carries.
export async function subscribersInSegment(segment) {
  if (segment === 'all') {
    const { rows } = await query(`select * from subscribers where status = 'active'`);
    return rows;
  }
  if (TAG_SEGMENTS.has(segment)) {
    const { rows } = await query(`select * from subscribers where status = 'active' and $1 = any(tags)`, [segment]);
    return rows;
  }
  throw new Error(`Unknown segment: ${segment}`);
}
