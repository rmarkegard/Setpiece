"""Index the reviewed native captures without altering original evidence."""
from pathlib import Path
import html
import json

root = Path(__file__).resolve().parents[1]
artifacts = root / 'artifacts'
scenes = {}
for folder in ['screenshots-final', 'screenshots-responsive', 'screenshots-corrections']:
    for row in json.loads((artifacts / folder / 'manifest.json').read_text(encoding='utf-8-sig')):
        # Keep the individually reviewed main-route captures; add responsive sizes.
        if folder == 'screenshots-responsive' and row['file'] in scenes:
            continue
        scenes[row['file']] = dict(row, source=f"{folder}/{row['file']}")
assert len(scenes) == 164
assert all(w['fits'] for row in scenes.values() for w in row['measurement']['widgets'])
manual = list((artifacts / 'screenshots-final').glob('*.png'))
manual += [artifacts / 'screenshots' / n for n in [
    'manual-a-saved.png', 'manual-c-luna.png', 'manual-d-detached.png',
    'manual-e-single-instance.png', 'luna-browser-persistence.png']]
for path in manual:
    if path.name not in scenes and path.exists():
        scenes[path.name] = dict(file=path.name, source=path.relative_to(artifacts).as_posix(), manual=True)
rows = sorted(scenes.values(), key=lambda r: r['file'])
(artifacts / 'visual-review-manifest.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
cards = []
for row in rows:
    name, source = html.escape(row['file']), html.escape(row['source'])
    kind = 'Manual evidence' if row.get('manual') else f"{row['width']} × {row['height']}"
    cards.append(f'<figure data-name="{name}"><a href="{source}" target="_blank"><img loading="lazy" src="{source}" alt="{name}"></a><figcaption>{name}<small>{kind}</small></figcaption></figure>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setpiece visual review</title>
<style>*{box-sizing:border-box}body{margin:0;background:#111b16;color:#e1eee4;font:16px system-ui}header{padding:32px;max-width:1200px}h1{font-size:36px;margin:0 0 12px}p{line-height:1.6;max-width:960px}input,select{font:inherit;padding:12px;border:1px solid #88a18e;border-radius:8px;background:#233127;color:inherit;margin:4px}main{padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:24px}figure{margin:0;padding:12px;background:#26332b;border-radius:16px;align-self:start}img{width:100%;max-height:520px;object-fit:contain;object-position:top;border-radius:8px;background:#15201a}figcaption{overflow-wrap:anywhere;padding:12px 0 4px}small{display:block;color:#b3c9b9;margin-top:6px}[hidden]{display:none}a{color:#91d7aa}:focus-visible{outline:3px solid #b5f3ca;outline-offset:3px}</style>
<header><h1>Setpiece visual review</h1><p>164 reviewed scenes: every catalog widget in square, compact and tall sizes, seven main routes, twelve connection guides, game views and workspace surfaces in Terminal dark and Luna light. Additional screenshots record manual browser and layout checks. Corrected captures replace earlier versions in this index. Click an image to inspect its original resolution.</p><p>Disconnected integrations are shown honestly; these images do not prove account-authorized or hardware behavior. See the <a href="../docs/VERIFICATION.md">verification report</a> for limits and the full build output.</p><label>Theme <select id="theme"><option value="">Both themes</option><option value="terminal">Terminal</option><option value="luna">Luna</option><option value="manual">Manual journeys</option></select></label><label>Find a surface <input id="find" placeholder="clock, compact, browser…" type="search"></label><p id="count" aria-live="polite"></p></header><main>'''+''.join(cards)+'''</main><script>const figures=[...document.querySelectorAll('figure')];function filter(){const theme=document.querySelector('#theme').value,query=document.querySelector('#find').value.toLowerCase();let count=0;for(const f of figures){f.hidden=!(f.dataset.name.includes(theme)&&f.dataset.name.includes(query));if(!f.hidden)count++}document.querySelector('#count').textContent=count+' captures shown'}document.querySelector('#theme').addEventListener('change',filter);document.querySelector('#find').addEventListener('input',filter);filter()</script></html>'''
(artifacts / 'visual-review.html').write_text(page, encoding='utf-8')
print(f'Indexed 164 suite scenes and {len(rows)-164} manual captures; all widget measurements fit.')
