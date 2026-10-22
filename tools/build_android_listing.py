"""Prepare Google Play listing text, icon and a graphic using the game's existing art."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright
from promo_page import Site, CHROME

ROOT = Path(__file__).resolve().parents[1]


def build():
    out = ROOT / 'dist/google-play/listing'
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'icon-512.png', out / 'icon-512.png')
    shutil.copyfile(ROOT / 'android/store-listing.md', out / 'store-listing.md')
    shutil.copyfile(ROOT / 'android/privacy.html', out / 'privacy.html')
    shutil.copyfile(ROOT / 'android/README.md', out.parent / 'UPLOAD-README.md')
    html = '''<!doctype html><meta charset="utf-8"><style>
    @font-face{font-family:Silkscreen;src:url('/playables/assets/Silkscreen-Regular.ttf')}
    *{box-sizing:border-box}body{margin:0;width:1024px;height:500px;overflow:hidden;background:#092b38;color:#ecf5e8;font-family:Silkscreen}
    body:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 31px,#7fd8e807 31px 32px),repeating-linear-gradient(90deg,transparent 0 31px,#7fd8e807 31px 32px)}
    main{position:relative;height:100%;display:flex;align-items:center;padding:52px 64px;gap:32px}
    .copy{flex:1}h1{font-size:104px;line-height:1;margin:0 0 28px;color:#ffdc79;text-shadow:6px 6px #9a511c}
    p{font-size:23px;line-height:1.65;margin:0}small{display:block;color:#8cd6ce;margin-top:28px;font-size:14px}
    img{width:344px;height:344px;image-rendering:pixelated}
    </style><main><div class="copy"><h1>POND</h1><p>A little pond.<br>A whole living world.</p><small>FEED · BREED · PLANT · DISCOVER</small></div><img src="/icon-512.png" alt="Pixel-art koi"></main>'''
    (out / 'feature-graphic.html').write_text(html, encoding='utf-8')
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Site, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROME, headless=True)
            page = browser.new_page(viewport={'width': 1024, 'height': 500}, device_scale_factor=1)
            page.goto(f'http://127.0.0.1:{server.server_port}/dist/google-play/listing/feature-graphic.html')
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(out / 'feature-graphic-1024x500.jpg'), type='jpeg', quality=95)
            browser.close()
    finally:
        server.shutdown(); server.server_close()
    print('Listing text, 512px icon and 1024x500 feature graphic prepared.')


if __name__ == '__main__':
    build()
