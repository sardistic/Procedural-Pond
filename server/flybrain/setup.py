"""Fetch the pinned upstream source and full connectome, verifying every file."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

MANIFEST = json.loads(Path(__file__).with_name('upstream.json').read_text())

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def install(root):
    root = Path(root).resolve()
    for name, expected in MANIFEST['files'].items():
        path = root / name
        if path.exists() and digest(path) == expected:
            print(f'Verified {name}', flush=True)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + '.part')
        url = f"https://raw.githubusercontent.com/eonsystemspbc/fly-brain/{MANIFEST['commit']}/{name}"
        request = urllib.request.Request(url, headers={'User-Agent': 'Procedural-Pond-FlyBrain/1.0'})
        try:
            with urllib.request.urlopen(request, timeout=90) as response, temporary.open('wb') as target:
                for block in iter(lambda: response.read(1024 * 1024), b''):
                    target.write(block)
            if digest(temporary) != expected:
                raise ValueError(f'Upstream checksum mismatch: {name}')
            temporary.replace(path)
            print(f'Installed {name}', flush=True)
        finally:
            temporary.unlink(missing_ok=True)
    return root

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='.agent/runtime/fly-brain-upstream')
    install(parser.parse_args().root)
