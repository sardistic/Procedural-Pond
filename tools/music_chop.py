# Cut the soundtrack into phrases for js/music.js.
#   py tools/music_chop.py <track.flac> [<track.flac> ...]
# For each track: find the tempo and the downbeats, split it into 4-bar pieces ("atoms"), measure
# each one (loudness, brightness, busyness), give it a mood, and write 8-bar MP3 files (two atoms
# each, plus a short tail so a fade-out can ring on) to audio/music/, with audio/music.json listing
# them. Near-silent pieces are left out. The source FLACs stay out of the repo (see .gitignore).
import json, os, re, subprocess, sys
import numpy as np
from music_analyze import SR, HOP, load, features, tempo

OUT = os.path.join(os.path.dirname(__file__), '..', 'audio')
TAIL = 3.0          # seconds of what follows, kept after each file's last bar
KBPS_Q = '6'        # LAME VBR quality (about 115 kbps)
PC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def refine(o, bpm):
    """The tempo and first beat that best fit the whole track (it's rendered to a grid)."""
    fps = SR / HOP
    best = (-1, bpm, 0)
    for b in np.arange(bpm - 1, bpm + 1.001, 0.01):
        period = fps * 60 / b
        n = int((len(o) - 1) / period)
        for ph in np.arange(0, period, 0.5):
            idx = ph + np.arange(n) * period
            idx = idx[idx < len(o) - 1]
            s = np.interp(idx, np.arange(len(o)), o).sum()
            if s > best[0]:
                best = (s, b, ph / fps)
    return best[1], best[2]


def chroma(x):
    n = 1 + (len(x) - 4096) // 2048
    frames = np.lib.stride_tricks.as_strided(x, shape=(n, 4096), strides=(x.strides[0] * 2048, x.strides[0]))
    mag = np.abs(np.fft.rfft(frames * np.hanning(4096), axis=1))
    f = np.fft.rfftfreq(4096, 1 / SR)
    keep = (f > 55) & (f < 2000)
    pc = (np.round(12 * np.log2(f[keep] / 440)) + 9) % 12
    ch = np.zeros((n, 12))
    for k in range(12):
        ch[:, k] = mag[:, keep][:, pc == k].sum(axis=1)
    return ch


def key_of(ch):
    prof = ch.sum(axis=0)
    prof = prof / prof.sum()
    best = (-2, '')
    for k in range(12):
        for name, p in (('major', MAJOR), ('minor', MINOR)):
            r = np.corrcoef(prof, np.roll(p, k))[0, 1]
            if r > best[0]:
                best = (r, f'{PC[k]} {name}')
    return best


def downbeat(x, flux_low, t0, beat):
    """Which of the four beats starts the bar: the one with the most low-end attack and chord change."""
    fps = SR / HOP
    ch = chroma(x)
    cfps = SR / 2048
    chn = ch / (np.linalg.norm(ch, axis=1, keepdims=True) + 1e-9)
    change = np.concatenate([[0], 1 - (chn[1:] * chn[:-1]).sum(axis=1)])
    scores = []
    for ph in range(4):
        ts = t0 + (ph + 4 * np.arange(int((len(x) / SR - t0) / (4 * beat)))) * beat
        lo = np.interp(ts * fps, np.arange(len(flux_low)), flux_low).sum()
        cc = np.interp(ts * cfps, np.arange(len(change)), change).sum()
        scores.append((lo / (flux_low.mean() + 1e-9) + 3 * cc / (change.mean() + 1e-9), ph))
    return max(scores)[1]


def mood(db, cent, busy):
    if db < -19:
        return 'deep' if cent < 450 else 'glow' if cent > 900 else 'calm'
    if db > -14.5:
        return 'rise' if cent > 900 else 'surge'
    return 'glow' if cent > 950 else 'deep' if cent < 450 else 'drift'


def main(paths):
    os.makedirs(os.path.join(OUT, 'music'), exist_ok=True)
    # Tracks not given here keep their entries and files (so a new track can be added on its own).
    # --after=<seconds> marks the tracks given as held back until that much play time.
    after = next((int(a.split('=')[1]) for a in paths if a.startswith('--after=')), 0)
    paths = [a for a in paths if not a.startswith('--')]
    mpath = os.path.join(OUT, 'music.json')
    manifest = json.load(open(mpath, encoding='utf-8')) if os.path.exists(mpath) else {'tracks': [], 'files': []}
    for path in paths:
        name = re.sub(r'_\d{4}-\d\d-\d\dT\d+$', '', os.path.splitext(os.path.basename(path))[0])
        slug = name.lower().replace('_', '-')
        manifest['tracks'] = [t for t in manifest['tracks'] if t['id'] != slug]
        manifest['files'] = [f for f in manifest['files'] if f['track'] != slug]
        x = load(path)
        flux, rms, cent = features(x)
        bpm0, _, _, o = tempo(flux)
        bpm, t0 = refine(o, bpm0)
        beat = 60 / bpm
        # Low-end attack (kicks and bass), for the downbeat.
        n = 1 + (len(x) - 2048) // HOP
        frames = np.lib.stride_tricks.as_strided(x, shape=(n, 2048), strides=(x.strides[0] * HOP, x.strides[0]))
        mag = np.abs(np.fft.rfft(frames * np.hanning(2048), axis=1))
        lowm = np.log1p(10 * mag[:, 1:20])
        flux_low = np.concatenate([[0], np.maximum(0, np.diff(lowm, axis=0)).sum(axis=1)])
        ph = downbeat(x, flux_low, t0, beat)
        start = t0 + ph * beat
        bar = 4 * beat
        atom = 4 * bar
        dur = len(x) / SR
        kr, key = key_of(chroma(x))
        print(f'{name}: {bpm:.2f} bpm, first downbeat {start:.2f}s, 4 bars = {atom:.2f}s, key ~{key} ({kr:.2f})')
        fps = SR / HOP
        db = 20 * np.log10(rms + 1e-6)
        atoms = []
        k = 0
        while start + (k + 1) * atom <= dur + 0.5:
            a0, a1 = start + k * atom, min(dur, start + (k + 1) * atom)
            i0, i1 = int(a0 * fps), int(a1 * fps)
            seg = db[i0:i1]
            w = int(2 * fps)  # the quietest two seconds (a whole atom of near-silence is no use as a phrase)
            quiet = min(np.convolve(seg, np.ones(w) / w, mode='valid')) if len(seg) > w else seg.mean()
            m = dict(t=round(a0, 3), dur=round(a1 - a0, 3), db=round(float(seg.mean()), 1), cent=int(cent[i0:i1].mean()),
                     busy=round(float(flux[i0:i1].mean()), 1), gap=bool(quiet < -40 or seg.mean() < -28))
            m['mood'] = 'gap' if m['gap'] else mood(m['db'], m['cent'], m['busy'])
            atoms.append(m)
            k += 1
        manifest['tracks'].append({'id': slug, 'name': name.replace('_', ' '), 'bpm': round(bpm, 3), 'key': key, 'atom': round(atom, 3), **({'after': after} if after else {})})
        # Files: two atoms each (8 bars), plus a tail; files that are all gap are left out.
        for j in range(0, len(atoms), 2):
            pair = atoms[j:j + 2]
            if all(a['gap'] for a in pair):
                continue
            f0 = pair[0]['t']
            length = sum(a['dur'] for a in pair)
            fn = f'{slug}-{j // 2 + 1:02d}.mp3'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{f0:.3f}', '-t', f'{min(length + TAIL, dur - f0):.3f}', '-i', path,
                            '-c:a', 'libmp3lame', '-q:a', KBPS_Q, '-ar', '44100', os.path.join(OUT, 'music', fn)], check=True)
            manifest['files'].append({'f': fn, 'track': slug, 'n': j // 2,
                                      'atoms': [{'at': round(a['t'] - f0, 3), 'dur': a['dur'], 'db': a['db'], 'mood': a['mood']} for a in pair]})
        for a in atoms:
            print(f"  {a['t']:7.2f}s {a['db']:6.1f} dB {a['cent']:5d} Hz busy {a['busy']:6.1f}  {a['mood']}")
    with open(os.path.join(OUT, 'music.json'), 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(manifest, fh, separators=(',', ':'))
    size = sum(os.path.getsize(os.path.join(OUT, 'music', f['f'])) for f in manifest['files'])
    print(f"{len(manifest['files'])} files, {size / 1e6:.1f} MB")


if __name__ == '__main__':
    main(sys.argv[1:])
