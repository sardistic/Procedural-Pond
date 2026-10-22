"""Bundle the existing standalone edition for the Android WebView. No remote code."""
from pathlib import Path
import re
import shutil
import build_itch

ROOT = Path(__file__).resolve().parents[1]


def build():
    build_itch.build()
    target = (ROOT / 'android/app/src/main/assets').resolve()
    assert target.is_relative_to(ROOT.resolve()) and target == ROOT / 'android/app/src/main/assets'
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / 'dist/itch', target)
    p = target / 'index.html'
    html = p.read_text(encoding='utf-8').replace('data-platform="itch"', 'data-platform="android"')
    html = re.sub(r'<p class="pond-support">.*?</p>', '', html, flags=re.S)
    html = html.replace('this browser on this device', 'this app on this device')
    html = html.replace('Browser data must remain available to keep your progress.', 'Clearing app storage or uninstalling removes your ponds.')
    html = html.replace('</body>', '<script src="android.js"></script>\n</body>')
    html = html.replace('</head>', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\' blob:; worker-src \'self\' blob:; frame-src \'none\'; object-src \'none\'">\n</head>')
    html = html.replace('<p>Made by', '<p><a href="privacy.html">Android privacy policy</a></p><p>Made by', 1)
    p.write_text(html, encoding='utf-8', newline='\n')
    shutil.copyfile(ROOT / 'android/adapter.js', target / 'android.js')
    shutil.copyfile(ROOT / 'android/privacy.html', target / 'privacy.html')
    icon = ROOT / 'android/app/src/main/res/drawable-nodpi/pond_icon.png'
    icon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'icon-512.png', icon)
    print('Android assets prepared; analytics, online services and donation link excluded.')


if __name__ == '__main__':
    build()
