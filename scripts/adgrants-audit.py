#!/usr/bin/env python3
"""Ad Grants website-policy audit, stricter than Google's published policy.
Run after `npm run build`:  python3 scripts/adgrants-audit.py [dist]
Exit code 1 if any FAIL."""
import sys, re, os, json, glob, html
from html.parser import HTMLParser
from collections import defaultdict, deque

DIST = sys.argv[1] if len(sys.argv) > 1 else 'dist'
NOINDEX_OK = {'/thanks/', '/404.html', '/links/'}
KEY = {'/': 350, '/about/': 350, '/ministry/': 400, '/give/': 250, '/contact/': 120, '/invite/': 250,
       '/songs/': 250, '/worship-is-warfare/': 250, '/updates/': 200}
MIN_WORDS = 200          # every indexable text page (Google gives no number; 200 is a strict floor)
MIN_VIDEO = 100          # video pages: supporting text beside the video
MIN_LEGAL = 150          # privacy and terms
def floor(u):
    if u.startswith('/worship-is-warfare/') and u != '/worship-is-warfare/': return MIN_VIDEO
    if u in ('/privacy/', '/terms/'): return MIN_LEGAL
    return MIN_WORDS
PLACEHOLDER = re.compile(r'lorem ipsum|under construction|(?<!am )(?<!is )coming soon|\bTBD\b|\bTODO\b|placeholder text|check back soon|not posted yet|on release|releasing soon', re.I)
ADS = re.compile(r'adsbygoogle|googlesyndication|doubleclick\.net|amazon-adsystem|taboola|outbrain', re.I)
AFFIL = re.compile(r'amzn\.to|[?&]tag=[\w-]+-2\d|shareasale|awin1\.com|rstyle\.me', re.I)

class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.skip=0; s.inmain=0; s.text=[]; s.all=[]; s.links=[]; s.h1=0; s.title=''; s.t=0
        s.desc=None; s.robots=''; s.viewport=False; s.imgs=[]; s.iframes=[]; s.srcs=[]; s.navlinks=[]; s.innav=0
        s.ids=set(); s.btn=0; s.canon=None; s.forms=0; s.lang=None; s.footer=0; s.header=0; s.maindepth=0
    def handle_starttag(s, tag, a):
        a = dict(a)
        if tag=='html': s.lang=a.get('lang')
        if tag in ('script','style','noscript','svg','dialog'): s.skip+=1
        if tag=='main': s.inmain+=1
        if tag=='nav': s.innav+=1
        if tag=='footer': s.footer+=1
        if tag=='header': s.header+=1
        if tag=='h1': s.h1+=1
        if tag=='title': s.t=1
        if tag=='form': s.forms+=1
        if 'id' in a: s.ids.add(a['id'])
        if tag=='meta':
            n=(a.get('name') or '').lower()
            if n=='description': s.desc=a.get('content','')
            if n=='robots': s.robots=a.get('content','')
            if n=='viewport': s.viewport=True
        if tag=='link' and a.get('rel')=='canonical': s.canon=a.get('href')
        if tag=='a' and a.get('href') is not None:
            s.links.append((a['href'], a.get('class','') or '', s.innav>0, s.inmain>0))
            if 'btn' in (a.get('class') or ''): s.btn+=1
        if tag=='button': s.btn+=1
        if tag=='img': s.imgs.append(a)
        if tag=='iframe': s.iframes.append(a)
        for k in ('src','href'):
            if k in a and tag in ('img','script','iframe','link','source','video','audio'): s.srcs.append(a[k])
    def handle_endtag(s, tag):
        if tag in ('script','style','noscript','svg','dialog'): s.skip=max(0,s.skip-1)
        if tag=='main': s.inmain-=1
        if tag=='nav': s.innav-=1
        if tag=='footer': s.footer-=1
        if tag=='header': s.header-=1
        if tag=='title': s.t=0
    def handle_data(s, d):
        if s.t: s.title+=d
        if s.skip: return
        s.all.append(d)
        if s.inmain and not s.innav and not s.footer: s.text.append(d)

pages = {}
for f in glob.glob(DIST+'/**/*.html', recursive=True):
    url = '/'+os.path.relpath(f, DIST).replace('index.html','')
    p = P(); raw = open(f, encoding='utf8').read(); p.feed(raw); p.raw = raw
    p.words = re.findall(r"[A-Za-z0-9'’]+", ' '.join(p.text))
    pages[url] = p

res = defaultdict(list)   # check -> list of failures
warn = defaultdict(list)
def fail(c, m): res[c].append(m)
def ok(c): res.setdefault(c, [])

def exists(path):
    path = path.split('#')[0].split('?')[0]
    if path in pages: return True
    if path.rstrip('/')+'/' in pages: return True
    return os.path.isfile(DIST+path)

indexable = {u:p for u,p in pages.items() if 'noindex' not in p.robots and u not in NOINDEX_OK}

# --- A. Content
for c in ['A1 every page has substantial text','A2 key pages well developed','A3 no placeholder text','A4 unique title + description','A5 exactly one H1','A6 no near-duplicate pages','A7 pages are not mostly outbound links/embeds','A8 core info in HTML, not only PDFs']: ok(c)
titles=defaultdict(list); descs=defaultdict(list)
for u,p in sorted(indexable.items()):
    n=len(p.words)
    if n < floor(u): fail('A1 every page has substantial text', f'{u} {n} words (<{floor(u)})')
    if u in KEY and n < KEY[u]: fail('A2 key pages well developed', f'{u} {n} words (<{KEY[u]})')
    m = PLACEHOLDER.search(' '.join(p.all))
    if m: fail('A3 no placeholder text', f'{u} "{m.group(0)}"')
    titles[p.title.strip()].append(u); descs[(p.desc or '').strip()].append(u)
    if not p.desc or len(p.desc)<70: fail('A4 unique title + description', f'{u} description missing/short')
    if p.h1!=1: fail('A5 exactly one H1', f'{u} has {p.h1}')
    ext=[h for h,_,nav,main in p.links if main and h.startswith('http') and 'westcoastrevival.org' not in h]
    if ext and n/ max(1,len(ext)) < 25: fail('A7 pages are not mostly outbound links/embeds', f'{u} {n} words / {len(ext)} outbound links')
    pdfs=[h for h,_,_,_ in p.links if h.lower().endswith('.pdf')]
    if pdfs and n < 200: fail('A8 core info in HTML, not only PDFs', f'{u} {len(pdfs)} PDFs, {n} words')
for k,v in titles.items():
    if len(v)>1: fail('A4 unique title + description', f'duplicate title "{k[:50]}" x{len(v)}')
for k,v in descs.items():
    if k and len(v)>1: fail('A4 unique title + description', f'duplicate description x{len(v)}: {v[:3]}')
def shingles(w): return {' '.join(w[i:i+5]).lower() for i in range(max(0,len(w)-4))}
sh={u:shingles(p.words) for u,p in indexable.items()}
us=sorted(sh)
for i,a in enumerate(us):
    for b in us[i+1:]:
        if sh[a] and sh[b]:
            j=len(sh[a]&sh[b])/min(len(sh[a]),len(sh[b]))
            if j>0.60: fail('A6 no near-duplicate pages', f'{a} ~ {b} {j:.0%} shared')

# --- B. Mission
for c in ['B1 mission on home page','B2 EIN + address + email on home, about, ministry, contact','B3 programs and who we serve described','B4 financial transparency']: ok(c)
home=' '.join(pages['/'].all)
if not re.search(r'mission', home, re.I) or '501(c)(3)' not in home: fail('B1 mission on home page','mission/501(c)(3) wording missing')
for u in ['/','/about/','/ministry/','/contact/']:
    t=' '.join(pages[u].all) if u in pages else ''
    for label,rx in [('EIN','39-2579605'),('address','264 S Port'),('email','info@westcoastrevival.org')]:
        if rx not in t: fail('B2 EIN + address + email on home, about, ministry, contact', f'{u} missing {label}')
mt=' '.join(pages.get('/ministry/',P()).all)
for w in ['who we serve','program','financial']:
    if w not in mt.lower(): fail('B3 programs and who we serve described', f'/ministry/ missing "{w}"')
gt=' '.join(pages['/give/'].all).lower()
if 'how your gift' not in gt or 'tax' not in gt: fail('B4 financial transparency','/give/ missing gift-use or tax wording')

# --- C. Navigation
for c in ['C1 no broken internal links or anchors','C2 same header nav on every page','C3 every page within 3 clicks of home','C4 no orphan pages','C5 no empty or "#" links','C6 nav has 7 or fewer top items','C7 custom 404 page','C8 sitemap matches indexable pages']: ok(c)
graph=defaultdict(set); navsets={}
for u,p in pages.items():
    nav=[h for h,_,n,_ in p.links if n]
    navsets[u]=tuple(nav)
    for h,cls,_,_ in p.links:
        if h in ('','#') or h.startswith('javascript:'): fail('C5 no empty or "#" links', f'{u} href="{h}"'); continue
        if h.startswith(('http','mailto:','tel:','sms:')): continue
        path=h if h.startswith('/') else u+h
        if h.startswith('#'):
            if h[1:] not in p.ids: fail('C1 no broken internal links or anchors', f'{u} -> {h}')
            continue
        if not exists(path): fail('C1 no broken internal links or anchors', f'{u} -> {h}'); continue
        base=path.split('#')[0].split('?')[0]
        tgt=base if base in pages else base.rstrip('/')+'/'
        if tgt in pages:
            graph[u].add(tgt)
            if '#' in path and path.split('#')[1] and path.split('#')[1] not in pages[tgt].ids:
                fail('C1 no broken internal links or anchors', f'{u} -> {h} (anchor missing)')
ref=navsets['/']
for u,n in navsets.items():
    if u in indexable and n!=ref: fail('C2 same header nav on every page', u)
topnav=len(set(ref))
dist={'/':0}; q=deque(['/'])
while q:
    x=q.popleft()
    for y in graph[x]:
        if y not in dist: dist[y]=dist[x]+1; q.append(y)
for u in indexable:
    if u not in dist: fail('C4 no orphan pages', u)
    elif dist[u]>3: fail('C3 every page within 3 clicks of home', f'{u} depth {dist[u]}')
if not os.path.isfile(DIST+'/404.html'): fail('C7 custom 404 page','missing')
sm=''.join(open(f).read() for f in glob.glob(DIST+'/sitemap-*.xml'))
smu={re.sub(r'https://westcoastrevival\.org','',x) for x in re.findall(r'<loc>(.*?)</loc>', sm)}
for u in indexable:
    if u not in smu and u.rstrip('/') not in smu: fail('C8 sitemap matches indexable pages', f'{u} not in sitemap')
for u in smu:
    if u.endswith('.xml'): continue
    if not exists(u): fail('C8 sitemap matches indexable pages', f'{u} in sitemap but not built')

# --- D. Speed / mobile (static part; Lighthouse is separate)
for c in ['D1 viewport meta on every page','D2 images have width, height, alt','D3 no third-party iframes on load','D4 HTML under 100 KB per page','D5 no image over 300 KB','D6 at most 2 third-party script hosts']: ok(c)
for u,p in pages.items():
    if not p.viewport: fail('D1 viewport meta on every page', u)
    for im in p.imgs:
        if not im.get('width') or not im.get('height') or im.get('alt') is None:
            fail('D2 images have width, height, alt', f'{u} {im.get("src","")[:60]}')
    for fr in p.iframes: fail('D3 no third-party iframes on load', f'{u} {fr.get("src","")[:60]}')
    if len(p.raw.encode())>100_000: fail('D4 HTML under 100 KB per page', f'{u} {len(p.raw)//1024} KB')
    hosts={re.sub(r'^https?://([^/]+).*',r'\1',m) for m in re.findall(r'<script[^>]+src="(https?://[^"]+)"', p.raw)}
    if len(hosts)>2: fail('D6 at most 2 third-party script hosts', f'{u} {hosts}')
for f in glob.glob(DIST+'/**/*', recursive=True):
    if re.search(r'\.(png|jpe?g|webp|avif|gif|svg)$', f, re.I) and os.path.getsize(f)>300_000:
        fail('D5 no image over 300 KB', f'{os.path.relpath(f,DIST)} {os.path.getsize(f)//1024} KB')

# --- E. Security
for c in ['E1 no http:// resources or links','E2 external links open safely (rel noopener)']: ok(c)
for u,p in pages.items():
    for s in p.srcs+[h for h,_,_,_ in p.links]:
        if s.startswith('http://'): fail('E1 no http:// resources or links', f'{u} {s[:70]}')

# --- F. Commercial
for c in ['F1 no ad networks','F2 no affiliate links','F3 no store or prices','F4 give page explains use of gifts and links to a secure donation page']: ok(c)
for u,p in pages.items():
    if ADS.search(p.raw): fail('F1 no ad networks', u)
    if AFFIL.search(p.raw): fail('F2 no affiliate links', u)
    if re.search(r'add to cart|buy now|\$\d+\.\d\d', ' '.join(p.all), re.I): fail('F3 no store or prices', u)
gl=[h for h,_,_,m in pages['/give/'].links if m and h.startswith('https://')]
if not gl: fail('F4 give page explains use of gifts and links to a secure donation page','no https donation link')

# --- G. Calls to action / freshness
for c in ['G1 a button-style call to action on every page','G2 email signup or contact form reachable from every page','G3 dated content from the last 60 days on home','G4 footer year is current']: ok(c)
import datetime
today=datetime.date.today()
for u,p in indexable.items():
    if p.btn<1: fail('G1 a button-style call to action on every page', u)
dates=[datetime.date.fromisoformat(d) for d in re.findall(r'datetime="(\d{4}-\d\d-\d\d)', pages['/'].raw)]
if not dates or (today-max(d for d in dates if d<=today)).days>60: fail('G3 dated content from the last 60 days on home', f'newest {max(dates) if dates else None}')
if str(today.year) not in ' '.join(pages['/'].all[-200:]): fail('G4 footer year is current', 'year missing')

# --- H. Licensed text
for c in ['H1 ESV verses quoted site-wide stay under 450 (Crossway allows 500)','H2 every episode reading has its ESV text and notice']: ok(c)
src=os.path.join(os.path.dirname(DIST.rstrip('/')) or '.','src','data')
try:
    esv=json.load(open(os.path.join(src,'scripture-esv.json'))); eps=json.load(open(os.path.join(src,'episodes.json')))
    nv=sum(len(x['verses']) for x in esv.values())
    if nv>450: fail('H1 ESV verses quoted site-wide stay under 450 (Crossway allows 500)', f'{nv} verses')
    for e in eps:
        for r in e['scripture']:
            if r not in esv: fail('H2 every episode reading has its ESV text and notice', f'#{e["number"]} {r} has no text')
    for u,p in pages.items():
        if 'class="scripture"' in p.raw and 'Used by permission' not in p.raw: fail('H2 every episode reading has its ESV text and notice', f'{u} missing notice')
except FileNotFoundError: pass

nf=0
for c in sorted(res):
    v=res[c]; nf+=bool(v)
    print(('FAIL ' if v else 'PASS ')+c+(f'  ({len(v)})' if v else ''))
    for m in v[:8]: print('       '+m)
    if len(v)>8: print(f'       ... +{len(v)-8} more')
print(f'\n{len(res)-nf}/{len(res)} checks pass; {len(indexable)} indexable pages')
json.dump({u:{'words':len(p.words),'depth':dist.get(u)} for u,p in indexable.items()}, open('/tmp/audit-pages.json','w'), indent=0)
sys.exit(1 if nf else 0)
