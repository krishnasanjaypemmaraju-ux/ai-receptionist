import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split("\n")){const m=line.match(/^([^#=]+)=(.*)$/);if(m)process.env[m[1].trim()]=m[2].trim();}
const { GoogleGenAI, Modality } = await import("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-native-audio-latest";
const b64ToInt16=(b)=>{const buf=Buffer.from(b,"base64");return new Int16Array(buf.buffer,buf.byteOffset,Math.floor(buf.byteLength/2));};
const int16ToB64=(p)=>Buffer.from(p.buffer,p.byteOffset,p.byteLength).toString("base64");
function resample(pcm,from,to){if(from===to)return pcm;const r=to/from,out=new Int16Array(Math.round(pcm.length*r));for(let i=0;i<out.length;i++){const s=i/r,i0=Math.floor(s),i1=Math.min(i0+1,pcm.length-1),f=s-i0;out[i]=(pcm[i0]*(1-f)+pcm[i1]*f)|0;}return out;}

const chunks=[];
const sA=await ai.live.connect({model:MODEL,config:{responseModalities:[Modality.AUDIO]},callbacks:{onopen(){},onerror(){},onclose(){},onmessage:(m)=>{for(const p of (m.serverContent?.modelTurn?.parts||[]))if(p.inlineData?.data)chunks.push(p.inlineData.data);}}});
sA.sendClientContent({turns:"Say clearly: My name is Kiran, I have a toothache.",turnComplete:true});
await new Promise(r=>setTimeout(r,5000)); sA.close();
let all=[];for(const c of chunks)all.push(...b64ToInt16(c));
const speech16=resample(new Int16Array(all),24000,16000);

let replied=false,heard=false;
const s=await ai.live.connect({model:MODEL,config:{responseModalities:[Modality.AUDIO],inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{endOfSpeechSensitivity:"END_SENSITIVITY_HIGH",startOfSpeechSensitivity:"START_SENSITIVITY_HIGH",silenceDurationMs:350,prefixPaddingMs:60}},systemInstruction:"You are a clinic receptionist. Reply briefly."},callbacks:{
  onopen(){},onerror:(e)=>console.log("[ERR]",e?.message||e),onclose:(e)=>console.log("[CLOSED]",e?.code,e?.reason),
  onmessage:(m)=>{const it=m.serverContent?.inputTranscription?.text;if(it){heard=true;console.log("HEARD:",it);}const ot=m.serverContent?.outputTranscription?.text;if(ot){replied=true;process.stdout.write(ot);}}
}});
console.log("-> greeting");
s.sendClientContent({turns:"Greet the caller and ask their name.",turnComplete:true});
await new Promise(r=>setTimeout(r,4000));
console.log("\n-> feeding speech (NO audioStreamEnd — relying on VAD, like the real connector)");
for(let i=0;i<speech16.length;i+=320){s.sendRealtimeInput({audio:{data:int16ToB64(speech16.subarray(i,i+320)),mimeType:"audio/pcm;rate=16000"}});await new Promise(r=>setTimeout(r,18));}
console.log("-> feeding 2.5s of trailing SILENCE so VAD can detect end-of-turn");
const silence=new Int16Array(320); // zeros = silence
for(let i=0;i<125;i++){s.sendRealtimeInput({audio:{data:int16ToB64(silence),mimeType:"audio/pcm;rate=16000"}});await new Promise(r=>setTimeout(r,18));}
await new Promise(r=>setTimeout(r,6000));
console.log("\n===> heard =",heard,"| replied(without audioStreamEnd) =",replied);
s.close();process.exit(0);
