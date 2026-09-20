import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) { const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim(); }
const { GoogleGenAI, Modality } = await import("@google/genai");
const { functionDeclarations, runTool } = await import("./lib/tools.js");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash-native-audio-latest";

// Try each config variant; see which one survives a tool call without the 1007 error.
const variants = {
  "FULL (current)": { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, tools: [{ functionDeclarations }], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }, realtimeInputConfig: { automaticActivityDetection: { endOfSpeechSensitivity: "END_SENSITIVITY_HIGH", startOfSpeechSensitivity: "START_SENSITIVITY_HIGH", silenceDurationMs: 350, prefixPaddingMs: 60 } } },
  "no realtimeInputConfig": { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, tools: [{ functionDeclarations }], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } },
  "no speechConfig": { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, tools: [{ functionDeclarations }] },
  "no transcriptions": { responseModalities: [Modality.AUDIO], tools: [{ functionDeclarations }] },
};

for (const [name, config] of Object.entries(variants)) {
  let closed = null, toolOK = false, respAfter = false;
  const s = await ai.live.connect({ model: MODEL, config: { ...config, systemInstruction: "You are a clinic receptionist. When they want an appointment, call getAvailability then offer a slot." }, callbacks: {
    onopen(){}, onerror(e){ closed = "ERR " + (e?.message||e); },
    onclose(e){ if(!closed) closed = "code " + e?.code + " " + (e?.reason||""); },
    onmessage: async (m) => {
      if (m.toolCall?.functionCalls?.length) { for (const fc of m.toolCall.functionCalls) { const r = await runTool(fc.name, fc.args||{}); toolOK = true; try { s.sendToolResponse({ functionResponses:[{ id:fc.id, name:fc.name, response:{ result:r } }] }); } catch(e){ closed="sendToolResp "+e?.message; } } return; }
      if (m.serverContent?.outputTranscription?.text || m.serverContent?.modelTurn?.parts?.some(p=>p.inlineData)) respAfter = toolOK ? true : respAfter;
    },
  }});
  s.sendClientContent({ turns: "I want to book a dental appointment for tomorrow.", turnComplete: true });
  await new Promise(r => setTimeout(r, 8000));
  try { s.close(); } catch {}
  console.log(`[${name}] toolCalled=${toolOK} respondedAfterTool=${respAfter} closedWith=${closed || "still-open/OK"}`);
}
process.exit(0);
