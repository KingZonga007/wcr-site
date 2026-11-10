#!/usr/bin/env node
// node scripts/email/export.mjs [path]
// Writes a CSV of active subscribers. Never writes into the repo by default.
import fs from 'node:fs';
import path from 'node:path';
import { query, closePool } from '../../email/lib/db.mjs';

const outPath = process.argv[2] || path.join(process.cwd(), `wcr-subscribers-${new Date().toISOString().slice(0, 10)}.csv`);

function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const { rows } = await query(
    `select email, first_name, tags, source, song, created_at, confirmed_at from subscribers where status = 'active' order by created_at`
  );
  const header = ['email', 'first_name', 'tags', 'source', 'song', 'created_at', 'confirmed_at'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      header
        .map((col) => {
          const v = row[col];
          if (col === 'tags') return csvField((v || []).join(';'));
          if (v instanceof Date) return csvField(v.toISOString());
          return csvField(v);
        })
        .join(',')
    );
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${rows.length} active subscribers to ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
