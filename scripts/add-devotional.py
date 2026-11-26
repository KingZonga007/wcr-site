#!/usr/bin/env python3
"""Save devotional(s) from a batch JSON file into src/data/devotionals/<n>.json.
Usage: python3 scripts/add-devotional.py batch.json
Each item: {number, title, speaker, opening, closing, summary, exhortation[], prayer[], status?}
status defaults to "draft". The episode should already be in src/data/episodes.json
(the GitHub Action adds new episodes from YouTube every 2 hours). If it isn't, an
"episode" object can be included in the item and is stored with the draft.
Keeps an existing draftKey so the preview link doesn't change between revisions."""
import json, sys, secrets, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
batch = json.load(open(sys.argv[1]))
eps = json.load(open(f'{ROOT}/src/data/episodes.json'))
for d in batch:
    n = d['number']
    path = f'{ROOT}/src/data/devotionals/{n}.json'
    old = json.load(open(path)) if os.path.exists(path) else {}
    out = {"number": n, "status": d.get('status', 'draft'), "draftKey": old.get('draftKey') or f"{n}-{secrets.token_hex(5)}",
           "title": d['title'], "speaker": d.get('speaker'), "opening": d['opening'], "closing": d.get('closing'),
           "summary": d['summary'], "exhortation": d['exhortation'], "prayer": d.get('prayer', [])}
    ep = next((e for e in eps if e['number'] == n), None)
    if ep:
        ep['scripture'] = [x for x in [d['opening'], d.get('closing')] if x]
    elif d.get('episode') or old.get('episode'):
        out['episode'] = d.get('episode') or old.get('episode')
    json.dump(out, open(path, 'w'), indent=2, ensure_ascii=False)
    print(f"saved #{n} ({out['status']}): https://westcoastrevival.org/devotionals/draft/{out['draftKey']}/")
open(f'{ROOT}/src/data/episodes.json', 'w').write(json.dumps(eps, indent=2, ensure_ascii=False) + '\n')
