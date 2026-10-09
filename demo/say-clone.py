"""
Narration in McKeen's own cloned voice (Chatterbox via mlx-audio, model loaded once). Spells n8n as "N eight N".
Writes <out>/<id>.wav + manifest.json for assemble.mjs.

  TTS=/path/to/chatterbox-mlx-audio   # folder with mlx-audio in .venv and ../whisper/<model>.bin
  REF=/path/to/your-voice.wav           # your own reference clip; never commit it
  cd $TTS && REF=$REF HF_HUB_OFFLINE=1 .venv/bin/python <this>/say-clone.py <this>/lines.json $OUT/voices

Clean demo, no room tone: silence-trim, -16 LUFS,
Whisper round-trip; a line Whisper hears <85 % of is re-rendered once. The reference clip is never copied.
"""
import json, os, re, subprocess, sys, wave
import numpy as np

TTS = os.getcwd()  # run from vendor/tts
sys.path.insert(0, TTS)
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio

REF = os.environ["REF"]  # your reference clip (path from env, fails loudly if unset); never copy or commit
WHISPER = f"{TTS}/../whisper/ggml-large-v3-turbo-q5_0.bin"
EXAG = 0.3  # Chatterbox exaggeration
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def words(n):  # 0–999, and one decimal ("1.1" → "one point one")
    if "." in n: a, b = n.split("."); return f"{words(a)} point {' '.join(ONES[int(d)] for d in b)}"
    n = int(n)
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    return ONES[n // 100] + " hundred" + (" and " + words(str(n % 100)) if n % 100 else "")


# spoken spelling only; captions keep the real text (manifest "text").
spoken = lambda t: re.sub(r"\b(\d+(?:\.\d)?)\b", lambda m: words(m.group(1)), re.sub(r"(?i)\bn8n\b", "N eight N", t.replace("PHP", "P H P")))
norm = lambda s: re.sub(r"[^a-z0-9 ]", "", s.lower().replace("-", " "))


def hit_rate(text, heard):
    want, got = norm(text).split(), re.sub(r"va\b", " v a", norm(spoken(heard))).split()  # Whisper writes digits ("55", "4G", "TechVA")
    return sum(w in got for w in want) / max(1, len(want))


def main():
    lines_path, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    m = load_model(f"{TTS}/models/chatterbox-8bit")
    conds = m.prepare_conditionals(load_audio(REF, sample_rate=24000), 24000, EXAG)
    manifest = []
    for L in json.load(open(lines_path)):
        text = L["text"].strip()
        wav = os.path.join(out, f"{L['id']}.wav")
        for attempt in range(2):
            r = m.generate(spoken(text), conds=conds, exaggeration=EXAG, verbose=False)
            r = r if hasattr(r, "audio") else next(iter(r))
            pcm = (np.clip(np.asarray(r.audio, dtype=np.float32).reshape(-1), -1, 1) * 32767).astype("<i2")
            with wave.open(wav + ".raw.wav", "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(r.sample_rate); w.writeframes(pcm.tobytes())
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav + ".raw.wav", "-af",
                "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5",
                "-ar", "24000", wav], check=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ar", "16000", "-ac", "1", wav + ".16k.wav"], check=True)
            heard = subprocess.run(["whisper-cli", "-m", WHISPER, "-f", wav + ".16k.wav", "-l", "en", "-nt", "-np"],
                                   capture_output=True, text=True).stdout.strip()
            hit = hit_rate(spoken(text), heard)
            if hit >= 0.85: break
        for f in (wav + ".raw.wav", wav + ".16k.wav"): os.remove(f)
        with wave.open(wav) as w: secs = w.getnframes() / w.getframerate()  # real duration from sample count
        manifest.append({"id": L["id"], "voice": "mckeen-clone", "file": wav, "seconds": round(secs, 3), "text": text})
        print(json.dumps({"id": L["id"], "seconds": round(secs, 2), "hit": round(hit, 2), "heard": heard}), file=sys.stderr, flush=True)
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=2)


if __name__ == "__main__":
    assert hit_rate("AI Automation V A", "AI automation VA.") == 1  # self-check of the matcher
    assert hit_rate(spoken("blocks PHP in uploads, Tech V A"), "blocks PHP in uploads, TechVA.") == 1
    assert spoken("3 of 12 PHP files") == "three of twelve P H P files"
    assert hit_rate(spoken("an n8n workflow, Contact Form 7"), "an N8N workflow, Contact Form 7.") == 1
    main()
