import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) { const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim(); }
const { runTool } = await import("./lib/tools.js");
// find a free slot tomorrow
const avail = await runTool("getAvailability", { days: 1 });
const day = avail.days?.[0];
const slot = day?.slots?.[0];
console.log("Booking into:", day?.date, slot);
const r = await runTool("bookAppointment", {
  name: "Ravi Kumar", phone: "9876500000", problem: "Root canal pain", date: day.date, time: slot,
});
console.log("Booking result:", JSON.stringify(r));
process.exit(0);
