"""Build signed Google Play AAB + installable APK. Credentials stay outside this repo.

python tools/build_android.py --init-upload-key  (one-time, new app only)
python tools/build_android.py                    (subsequent builds reuse the key)
Set POND_SIGNING_PROPERTIES to use an existing external signing configuration.
"""
import argparse
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--init-upload-key', action='store_true')
    a = parser.parse_args()
    env = os.environ.copy()
    directory = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local/share'))) / 'Pond/signing/nz.pond.game'
    config = Path(env.get('POND_SIGNING_PROPERTIES', str(directory / 'upload.properties'))).resolve()
    if config.is_relative_to(ROOT):
        raise ValueError('Keep signing credentials outside the repository.')
    if not config.exists():
        if not a.init_upload_key:
            raise SystemExit('Signing configuration missing. For a NEW app use --init-upload-key, or set POND_SIGNING_PROPERTIES.')
        if config != (directory / 'upload.properties').resolve():
            raise SystemExit('Custom signing configurations must already exist; no implicit key replacement.')
        directory.mkdir(parents=True, exist_ok=True)
        if os.name == 'nt':
            subprocess.run(['icacls', str(directory), '/inheritance:r', '/grant:r', os.environ['USERNAME'] + ':(OI)(CI)F'], check=True, capture_output=True)
        else:
            directory.chmod(0o700)
        key = directory / 'upload.p12'
        if key.exists():
            raise SystemExit('Upload key exists but configuration is missing. Restore its configuration; refusing to replace the key.')
        password = secrets.token_urlsafe(36)
        keyenv = dict(env, POND_NEW_KEY_PASSWORD=password)
        subprocess.run(['keytool', '-genkeypair', '-keystore', str(key), '-storetype', 'PKCS12',
                        '-storepass:env', 'POND_NEW_KEY_PASSWORD', '-keypass:env', 'POND_NEW_KEY_PASSWORD',
                        '-alias', 'pond-upload', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
                        '-dname', 'CN=Pond Upload, O=sardistic', '-noprompt'], env=keyenv, check=True, capture_output=True)
        config.write_text(f'storeFile={key.as_posix()}\nstorePassword={password}\nkeyAlias=pond-upload\nkeyPassword={password}\n', encoding='utf-8')
        if os.name != 'nt':
            key.chmod(0o600); config.chmod(0o600)
        print('Created an upload key in your private local Pond signing folder. Back up that folder securely.')
    env['POND_SIGNING_PROPERTIES'] = str(config)
    if not env.get('ANDROID_HOME') and os.name == 'nt':
        env['ANDROID_HOME'] = str(Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk')
    wrapper = ROOT / 'android' / ('gradlew.bat' if os.name == 'nt' else 'gradlew')
    subprocess.run([str(wrapper), '-p', str(ROOT / 'android'), 'bundleRelease', 'assembleRelease', 'lintRelease', '--console=plain'], env=env, check=True)
    out = ROOT / 'dist/google-play'; out.mkdir(parents=True, exist_ok=True)
    gradle = (ROOT / 'android/app/build.gradle').read_text(encoding='utf-8')
    version = re.search(r"versionName '([0-9]+\.[0-9]+\.[0-9]+)'", gradle).group(1)
    code = int(re.search(r'versionCode (\d+)', gradle).group(1))
    artifacts = {}
    for src, dst in [('bundle/release/app-release.aab', f'pond-{version}.aab'), ('apk/release/app-release.apk', f'pond-{version}.apk')]:
        dest = out / dst
        shutil.copyfile(ROOT / 'android/app/build/outputs' / src, dest)
        artifacts[dst] = {'bytes': dest.stat().st_size, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()}
    # Public certificate may accompany the package; private key/password never do.
    signing = dict(line.split('=', 1) for line in config.read_text().splitlines() if '=' in line)
    certenv = dict(env, POND_CERT_PASSWORD=signing['storePassword'])
    subprocess.run(['keytool', '-exportcert', '-rfc', '-keystore', signing['storeFile'], '-storepass:env', 'POND_CERT_PASSWORD',
                    '-alias', signing['keyAlias'], '-file', str(out / 'upload-certificate.pem')], env=certenv, check=True, capture_output=True)
    report = {'applicationId': 'nz.pond.game', 'versionCode': code, 'versionName': version, 'targetSdk': 36,
              'minSdk': 26, 'artifacts': artifacts, 'websiteRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'workingTreeChanges': bool(subprocess.check_output(['git', 'diff', '--name-only'], cwd=ROOT, text=True).strip())}
    (out / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    run()
