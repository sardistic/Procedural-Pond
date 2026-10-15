"""Build a standalone HTML5 itch.io upload. Run python tools/build_itch.py."""
from pathlib import Path
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'itch'
ZIP = ROOT / 'dist' / 'pond-itch.zip'


def html_for_itch(html):
    html = html.replace('<html lang="en">', '<html lang="en" data-platform="itch">', 1)
    html = re.sub(r'<script\b[^>]*\bdata-website-id="[^"]+"[^>]*></script>\s*', '', html)
    html = re.sub(r'<script src="js/water-sdf\.js[^\"]*"></script>\s*', '', html)
    html = re.sub(r'<link\b[^>]*(?:https?://|manifest.webmanifest)[^>]*>\s*', '', html)
    html = re.sub(r'<script type="application/ld\+json">.*?</script>', '', html, flags=re.S)
    html = html.replace('Classic: the original pixel water. 3D: a moving water mesh (water3d.js)', 'Classic: the original pixel water. 3D: a moving water mesh')
    html = html.replace('3D or Seascape water', '3D water')
    html = re.sub(r' Seascape: the sea surface[^\"]*', '', html)
    html = re.sub(r'(<p id="entry-tag"[^>]*>).*?(</p>)', r'\1A living pixel-art pond. Feed, breed, plant and explore the strange waters beneath it. Progress saves in this browser on this device.\2', html, flags=re.S)
    faq = {
        'Do I need an account?': 'No account is needed. Your ponds save in this browser on this device. Browser data must remain available to keep your progress.',
        'Can other people see my pond?': 'This edition keeps your pond on this device. Visit pond.nz for public pond addresses and visiting.',
        'How do high scores work?': 'Your depth and discoveries are kept in your local pond. Online rankings are available at pond.nz.',
    }
    for question, answer in faq.items():
        html = re.sub(r'<details><summary>' + re.escape(question) + r'</summary>.*?</details>', f'<details><summary>{question}</summary><p>{answer}</p></details>', html, flags=re.S)
    html = html.replace('<details><summary>What are awakened minds?</summary>', '<details class="online-only"><summary>What are awakened minds?</summary>')
    css = '''
    @font-face { font-family: Silkscreen; src: url("fonts/Silkscreen-Regular.ttf") format("truetype"); font-display: swap; }
    #account, #entry-account, #sp-rename, #sp-rename-form, #sp-board, #sp-finds, #sp-neighbours,
    #sp-rank, #sp-rank-note, #guide-minds, #share, #copy-link, #signin-nudge,
    .online-only, label:has(#pond-lock), label:has(#pond-visit-plant), label:has(#pond-visit-minds),
    [data-toggle="neighbours"] { display: none !important; }
    '''
    return html.replace('</head>', '<style>' + css + '</style>\n</head>')


def build():
    html = html_for_itch((ROOT / 'index.html').read_text(encoding='utf-8'))
    scripts = re.findall(r'<script src="(js/[^\"]+)"', html)
    scripts = [name.split('?')[0] for name in scripts if not name.startswith('js/platform.js')]
    game = '\n'.join('// ---- ' + name + ' ----\n' + (ROOT / name).read_text(encoding='utf-8') for name in scripts)
    html = re.sub(r'<script src="js/(?!platform\.js)[^\"]+"></script>\s*', '', html)
    html = html.replace('</body>', '<script src="js/game.js"></script>\n</body>')
    files = {'index.html': html.encode('utf-8'), 'js/game.js': game.encode('utf-8')}
    # Only the platform adapter and entry-water worker need separate files.
    for name in ['js/platform.js', 'js/entry-water.js']:
        files[name] = (ROOT / name).read_bytes()
    for name in ['style.css', 'favicon.ico', 'icon-192.png', 'apple-touch-icon.png']:
        files[name] = (ROOT / name).read_bytes()
    for directory in ['audio']:
        for path in sorted((ROOT / directory).rglob('*')):
            if path.is_file() and path.name != 'water-sdf.js':
                files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    for name in ['Silkscreen-Regular.ttf', 'OFL.txt']:
        files['fonts/' + name] = (ROOT / 'playables' / 'assets' / name).read_bytes()
    files['CREDITS.txt'] = b'Procedural Pond / pond.nz by sardistic. Animation inspired by argonautcode/animal-proc-anim. Silkscreen by Jason Kottke, SIL Open Font License (fonts/OFL.txt). This edition excludes the Seascape adaptation. Existing audio is included; its source rights remain with the respective creators.\n'
    assert len(files) <= 1000 and sum(map(len, files.values())) <= 500 * 1024 * 1024
    assert all(len(name) <= 240 and len(data) <= 200 * 1024 * 1024 for name, data in files.items())
    assert 'analytics.sardistic.com' not in files['index.html'].decode()
    target = OUT.resolve()
    if target != (ROOT / 'dist' / 'itch').absolute() or not target.is_relative_to(ROOT.resolve()):
        raise ValueError('Unsafe output directory')
    if target.exists():
        shutil.rmtree(target)
    for name, data in files.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    with zipfile.ZipFile(ZIP, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    report = {'zip': str(ZIP), 'zipBytes': ZIP.stat().st_size, 'files': len(files), 'extractedBytes': sum(map(len, files.values()))}
    (ROOT / 'dist' / 'itch-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    build()
