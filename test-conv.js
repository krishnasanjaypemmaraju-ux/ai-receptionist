import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) { const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim(); }
const { GoogleGenAI, Modality } = await import("@google/genai");
const { plivoToGemini, pcm16ToMuLawB64, resample } = await import("./lib/audio.js");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-native-audio-latest";
const b64ToInt16 = (b) => { const buf = Buffer.from(b, "base64"); return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2)); };

// capture speech
const chunks = [];
const sA = await ai.live.connect({ model: MODEL, config:{responseModalities:[Modality.AUDIO]}, callbacks:{onopen(){},onerror(){},onclose(){},onmessage:(m)=>{for(const p of (m.serverContent?.modelTurn?.parts||[]))if(p.inlineData?.data)chunks.push(p.inlineData.data);}}});
sA.sendClientContent({ turns:"Say clearly: My name is Suresh and I want a dental checkup.", turnComplete:true });
await new Promise(r=>setTimeout(r,5000)); sA.close();
let all=[]; for(const c of chunks) all.push(...b64ToInt16(c));
const speech16 = new Int16Array(all);
const pcm8 = resample(speech16, 24000, 8000);   // model audio is 24k -> down to phone 8k
console.log("phone-rate samples:", pcm8.length, "(", (pcm8.length/8000).toFixed(1), "s )");

let heard=false, replied=false;
const s = await ai.live.connect({ model: MODEL, config:{ responseModalities:[Modality.AUDIO], inputAudioTranscription:{}, outputAudioTranscription:{}, systemInstruction:"You are a clinic receptionist. Reply briefly." }, callbacks:{
  onopen(){}, onerror:(e)=>console.log("[ERR]",e?.message||e), onclose:(e)=>console.log("[CLOSED]",e?.code,e?.reason),
  onmessage:(m)=>{ const it=m.serverContent?.inputTranscription?.text; if(it){heard=true;console.log("CALLER HEARD:",it);} const ot=m.serverContent?.outputTranscription?.text; if(ot){replied=true;process.stdout.write(ot);} }
}});
// feed as Plivo would: 160-sample (20ms) mulaw frames -> our real plivoToGemini converter
for (let i=0;i<pcm8.length;i+=160){
  const frame8 = pcm8.subarray(i, i+160);
  const mulawB64 = pcm16ToMuLawB64(frame8);        // what Plivo sends us
  const gem16B64 = plivoToGemini(mulawB64);        // our real converter (mulaw8k -> pcm16k)
  s.sendRealtimeInput({ audio:{ data:gem16B64, mimeType:"audio/pcm;rate=16000" } });
  await new Promise(r=>setTimeout(r,18));
}
try{ s.sendRealtimeInput({audioStreamEnd:true}); }catch{}
await new Promise(r=>setTimeout(r,6000));
console.log("\n===> heard =", heard, "| replied =", replied);
s.close(); process.exit(0);
