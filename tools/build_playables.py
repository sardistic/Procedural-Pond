"""Build the YouTube edition using only Python's standard library.

Run: python tools/build_playables.py
Outputs: dist/youtube-playables/ and dist/pond-youtube-playable.zip
The normal website is never rewritten. No server, credentials or agent files
are included. See playables/README.md for validation and submission.
"""
from pathlib import Path
import gzip
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SDK = "https://www.youtube.com/game_api/v1"
OUT = ROOT / "dist" / "youtube-playables"
ZIP = ROOT / "dist" / "pond-youtube-playable.zip"


def source_for_playables(source):
    # Explicit per-build storage routing, without replacing browser globals.
    source = re.sub(r"\blocalStorage\b", "PondPlatform.storage", source)
    source = re.sub(r"\bsessionStorage\b", "PondPlatform.session", source)
    source = source.replace("document.hidden", "PondPlatform.hidden")
    return source


def html_for_playables(html):
    html = html.replace('<html lang="en">', '<html lang="en" data-platform="youtube">')
    html = re.sub(r"<title>.*?</title>", "<title>Procedural Pond</title>", html)
    # SDK is the first script, including before our platform adapter.
    html = html.replace("<head>", f'<head>\n  <script src="{SDK}"></script>', 1)
    html = re.sub(r'<script type="application/ld\+json">.*?</script>', '', html, flags=re.S)
    # Website analytics must not make external requests from a YouTube Playable.
    html = re.sub(r'<script\b[^>]*\bdata-website-id="[^"]+"[^>]*></script>\s*', '', html)
    html = re.sub(r'<link\b[^>]*(?:https?://|manifest.webmanifest)[^>]*>\s*', '', html)
    html = re.sub(r'<script src="js/[^\"]+"></script>\s*', '', html)
    html = html.replace('</body>', '  <script src="js/platform.js"></script>\n  <script src="js/boot-playables.js"></script>\n</body>')
    # Keep attribution as text. Playables must not offer external links.
    html = re.sub(r'<a\b[^>]*>', '<span>', html).replace('</a>', '</span>')
    html = re.sub(r'(<p id="entry-tag"[^>]*>).*?(</p>)', r'\1A living pixel-art pond. Feed its animals, plant and build, and watch them grow, breed, hunt and evolve. Deeper water brings stranger creatures and new things to discover. YouTube keeps your progress.\2', html, flags=re.S)
    html = re.sub(r'(<p class="note ponds-help">).*?(</p>)', r'\1Your ponds and settings save to YouTube. Start another pond here, or return to one you have already grown.\2', html, flags=re.S)
    faq = {
        'Do I need an account?': 'YouTube keeps your progress automatically. No separate account or sign-in is needed.',
        'Can other people see my pond?': 'Your ponds are yours to grow. This edition has no public pond links or visits.',
        'How do high scores work?': 'Your best score is the deepest your ponds have reached, in whole fathoms. It is kept across all your ponds and sent to YouTube.',
    }
    for question, answer in faq.items():
        html = re.sub(r'<details><summary>' + re.escape(question) + r'</summary>.*?</details>', f'<details><summary>{question}</summary><p>{answer}</p></details>', html, flags=re.S)
    html = html.replace('<details><summary>What are awakened minds?</summary>', '<details class="online-only"><summary>What are awakened minds?</summary>')
    html = html.replace('<h3>Leaderboard</h3>', '<h3>Best depth</h3><p id="yt-best">0 fathoms</p>')
    html = html.replace('<h3>Along the beach</h3>', '').replace('<h3>Rare finds in every pond</h3>', '')
    css = '''
    @font-face { font-family: Silkscreen; src: url("fonts/Silkscreen-Regular.ttf") format("truetype"); font-display: swap; }
    #share, #copy-link, #snapshot, #account, #entry-account, #sp-rename, #sp-rename-form,
    #sp-board, #sp-finds, #sp-neighbours, #sp-rank, #sp-rank-note, #guide-minds,
    .online-only, .pond-support, label:has(#pond-lock), label:has(#pond-visit-plant), label:has(#pond-visit-minds),
    [data-toggle="neighbours"] { display: none !important; }
    #entry h1 span:last-child { display: none; }
    html[data-host-paused] *, html[data-host-paused] *::before, html[data-host-paused] *::after { animation-play-state: paused !important; }
    '''
    html = html.replace('</head>', '<style>' + css + '</style>\n</head>')
    return html


BOOT = ''''use strict';
// Load cloud progress before any script reads options, saves or play time.
(async () => {
  let started = false;
  async function start() {
    try {
      await PondPlatform.ready;
      await PondPlatform.waitActive();
      if (started) return;
      started = true;
      const script = document.createElement('script'); script.src = 'js/game.js';
      script.onerror = () => { document.getElementById('entry-status').textContent = "The pond couldn't load. Please reopen the game."; };
      document.body.append(script);
    } catch {
      const status = document.getElementById('entry-status'), button = document.getElementById('entry-enter');
      status.textContent = "Couldn't load your YouTube save. Retry to keep your existing progress.";
      document.getElementById('entry-label').textContent = 'Retry'; button.disabled = false;
      button.onclick = () => { button.disabled = true; PondPlatform.ready = PondPlatform.load(); void start(); };
    }
  }
  await start();
})();
'''


def build():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    scripts = re.findall(r'<script src="(js/[^\"]+)"', html)
    scripts = [s.split('?')[0] for s in scripts if not s.startswith('js/platform.js')]
    game = '\n'.join(f'\n// ---- {s} ----\n' + source_for_playables((ROOT / s).read_text(encoding='utf-8')) for s in scripts)
    files = {
        'index.html': html_for_playables(html).encode('utf-8'),
        'style.css': (ROOT / 'style.css').read_bytes(),
        'js/platform.js': (ROOT / 'js/platform.js').read_bytes(),
        'js/boot-playables.js': BOOT.encode('utf-8'),
        'js/game.js': game.encode('utf-8'),
        'fonts/Silkscreen-Regular.ttf': (ROOT / 'playables/assets/Silkscreen-Regular.ttf').read_bytes(),
        'fonts/OFL.txt': (ROOT / 'playables/assets/OFL.txt').read_bytes(),
    }
    for name in ('favicon.ico', 'icon-192.png', 'apple-touch-icon.png'):
        files[name] = (ROOT / name).read_bytes()
    for path in sorted((ROOT / 'audio').rglob('*')):
        if path.is_file():
            files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    for name, data in files.items():
        if not all(re.fullmatch(r'[A-Za-z0-9_.-]+', part) for part in name.split('/')):
            raise ValueError(f'Unsupported bundle filename: {name}')
        if len(data) >= 30 * 1024 * 1024:
            raise ValueError(f'File exceeds 30 MiB: {name}')
    total = sum(map(len, files.values()))
    # Audio is fetched only after a gesture. Bound the compressed initial files
    # conservatively, including icons and the local font.
    initial = sum(len(gzip.compress(data, mtime=0)) for name, data in files.items() if not name.startswith('audio/'))
    if len(files) > 8000 or total >= 250 * 1024 * 1024 or initial >= 15 * 1024 * 1024:
        raise ValueError('Bundle exceeds YouTube limits')
    # Only remove this exact generated directory, never a caller-supplied path.
    target = OUT.resolve()
    expected = (ROOT / 'dist' / 'youtube-playables').absolute()
    if target != expected or not target.is_relative_to(ROOT.resolve()):
        raise ValueError('Unsafe generated output path')
    if target.exists():
        shutil.rmtree(target)
    for name, data in files.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    with zipfile.ZipFile(ZIP, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    report = {
        'files': len(files), 'totalBytes': total, 'initialGzipBytes': initial,
        'zipBytes': ZIP.stat().st_size, 'sdk': SDK,
        'largestFile': max(files, key=lambda key: len(files[key])),
        'directory': str(target), 'zip': str(ZIP),
    }
    (ROOT / 'dist' / 'youtube-playables-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    build()
