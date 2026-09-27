# Look at a track before cutting it: tempo (and how sure), the beat grid, and energy and
# brightness over time. Usage: py tools/music_analyze.py <audio file>
import subprocess, sys
import numpy as np

SR, HOP, NFFT = 22050, 512, 2048


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def features(x):
    n = 1 + (len(x) - NFFT) // HOP
    win = np.hanning(NFFT).astype(np.float32)
    frames = np.lib.stride_tricks.as_strided(x, shape=(n, NFFT), strides=(x.strides[0] * HOP, x.strides[0]))
    mag = np.abs(np.fft.rfft(frames * win, axis=1))
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    logm = np.log1p(10 * mag)
    flux = np.maximum(0, np.diff(logm, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    rms = np.sqrt((frames ** 2).mean(axis=1))
    cent = (mag * freqs).sum(axis=1) / (mag.sum(axis=1) + 1e-9)
    return flux, rms, cent


def tempo(flux):
    fps = SR / HOP
    o = flux - np.convolve(flux, np.ones(16) / 16, mode='same')  # local mean removed
    o = np.maximum(o, 0)
    ac = np.correlate(o, o, mode='full')[len(o) - 1:]
    ac /= ac[0] + 1e-9
    best, bpm_best = -1, 0
    scores = []
    for bpm in np.arange(60, 160.5, 0.5):
        lag = fps * 60 / bpm
        s = np.interp(lag, np.arange(len(ac)), ac) + 0.5 * np.interp(2 * lag, np.arange(len(ac)), ac)
        s *= np.exp(-0.5 * (np.log2(bpm / 100) / 0.9) ** 2)  # a gentle preference for ~100
        scores.append((s, bpm))
        if s > best:
            best, bpm_best = s, bpm
    scores.sort(reverse=True)
    return bpm_best, best, scores[:5], o


def phase(o, bpm):
    fps = SR / HOP
    period = fps * 60 / bpm
    best, off = -1, 0
    for k in np.arange(0, period, 0.25):
        idx = (k + np.arange(0, (len(o) - k) / period) * period).astype(int)
        s = o[idx[idx < len(o)]].sum()
        if s > best:
            best, off = s, k
    return off / fps


if __name__ == '__main__':
    x = load(sys.argv[1])
    flux, rms, cent = features(x)
    bpm, conf, top, o = tempo(flux)
    t0 = phase(o, bpm)
    dur = len(x) / SR
    print(f'duration {dur:.1f}s  tempo {bpm} bpm (score {conf:.3f}; next {[(round(b, 1), round(float(s), 3)) for s, b in top]})  first beat {t0:.2f}s')
    fps = SR / HOP
    step = 4  # seconds per printed row
    db = 20 * np.log10(rms + 1e-6)
    for s in range(0, int(dur), step):
        a, b = int(s * fps), int((s + step) * fps)
        bar = '#' * max(0, int((db[a:b].mean() + 50) / 1.5))
        print(f'{s:4d}s  {db[a:b].mean():6.1f} dB  cent {cent[a:b].mean():6.0f} Hz  flux {flux[a:b].mean():6.1f}  {bar}')
