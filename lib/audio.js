// Audio helpers: Plivo uses 8kHz mu-law; Gemini Live uses 16kHz PCM in, 24kHz PCM out.

const BIAS = 0x84;
const CLIP = 32635;

// ---- mu-law <-> 16-bit PCM ----
export function muLawDecodeSample(u) {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return sign ? -sample : sample;
}

export function muLawEncodeSample(sample) {
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

// base64 mu-law (8k) -> Int16Array PCM (8k)
export function muLawB64ToPcm16(b64) {
  const buf = Buffer.from(b64, "base64");
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = muLawDecodeSample(buf[i]);
  return out;
}

// Int16Array PCM -> base64 mu-law
export function pcm16ToMuLawB64(pcm) {
  const buf = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) buf[i] = muLawEncodeSample(pcm[i]);
  return buf.toString("base64");
}

// ---- linear resampler for Int16 PCM ----
export function resample(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm;
  const ratio = toRate / fromRate;
  const outLen = Math.round(pcm.length * ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = srcPos - i0;
    out[i] = (pcm[i0] * (1 - frac) + pcm[i1] * frac) | 0;
  }
  return out;
}

export function int16ToB64(pcm) {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString("base64");
}
export function b64ToInt16(b64) {
  const buf = Buffer.from(b64, "base64");
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
}

// Plivo (mu-law 8k, base64)  ->  Gemini (PCM 16k, base64)
export function plivoToGemini(b64) {
  const pcm8k = muLawB64ToPcm16(b64);
  const pcm16k = resample(pcm8k, 8000, 16000);
  return int16ToB64(pcm16k);
}

// Gemini (PCM 24k, base64)  ->  Plivo (mu-law 8k, base64)
export function geminiToPlivo(b64) {
  const pcm24k = b64ToInt16(b64);
  const pcm8k = resample(pcm24k, 24000, 8000);
  return pcm16ToMuLawB64(pcm8k);
}
