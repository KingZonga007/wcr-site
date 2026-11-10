import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

// Resolve from this file's own location rather than process.cwd(), which can
// differ between `node scripts/...`, a bundled Netlify Function, and tests.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEQUENCES_DIR = path.join(REPO_ROOT, 'emails', 'sequences');
const CAMPAIGNS_DIR = path.join(REPO_ROOT, 'emails', 'campaigns');

export function loadSequenceSteps(name) {
  const dir = path.join(SEQUENCES_DIR, name);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data, content } = matter(raw);
      return {
        step: `${name}:${path.basename(file, '.md')}`,
        delayDays: Number(data.delay_days ?? 0),
        subject: data.subject,
        preheader: data.preheader || '',
        body: content.trim(),
      };
    })
    .sort((a, b) => a.delayDays - b.delayDays);
}

export function loadCampaignFiles() {
  if (!fs.existsSync(CAMPAIGNS_DIR)) return [];
  const files = fs.readdirSync(CAMPAIGNS_DIR).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(CAMPAIGNS_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    return {
      id: path.basename(file, '.md'),
      subject: data.subject,
      preheader: data.preheader || '',
      segment: data.segment || 'all',
      sendAt: data.send_at,
      body: content.trim(),
    };
  });
}
