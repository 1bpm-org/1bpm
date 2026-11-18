# Renders the bell the site synthesises (src/audio.ts) to OneBPM/Resources/bell.wav:
# modal partials over 528 Hz plus a 20 ms band-passed noise strike. Also used as the notification sound.
import wave, numpy as np

SR = 44100
PARTIALS = [(0.5, 0.22, 2.6), (1.0, 1.0, 2.2), (1.003, 0.5, 2.0), (1.19, 0.42, 1.5), (1.5, 0.3, 1.2),
            (2.0, 0.34, 1.0), (2.52, 0.2, 0.75), (3.01, 0.14, 0.55), (4.07, 0.08, 0.35)]
F0 = 528
n = int(SR * 2.8)
t = np.arange(n) / SR
out = np.zeros(n)
for ratio, amp, decay in PARTIALS:
    attack = np.clip(t / 0.003, 0, 1)
    env = np.where(t < decay, amp * np.exp(np.log(0.0001 / amp) * t / decay), 0) * attack
    out += np.sin(2 * np.pi * F0 * ratio * t) * env

rng = np.random.default_rng(7)
ln = int(SR * 0.02)
noise = (rng.uniform(-1, 1, ln)) * (1 - np.arange(ln) / ln) ** 2
# simple band-pass around 3.2 kHz: difference of two one-pole low-passes
def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    for i, v in enumerate(x):
        s = (1 - a) * v + a * s; y[i] = s
    return y
band = lowpass(noise, 5200) - lowpass(noise, 2000)
out[:ln] += band * 0.35 * 4

fade = np.clip((n - np.arange(n)) / (SR * 0.05), 0, 1)
out *= fade
out *= 0.8 / np.max(np.abs(out))
pcm = (out * 32767).astype('<i2')
with wave.open('OneBPM/Resources/bell.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('bell.wav', len(pcm) / SR, 's')
