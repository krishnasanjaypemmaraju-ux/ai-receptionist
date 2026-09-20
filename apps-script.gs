/*************************************************************************
 * HARSHA MULTI-SPECIALITY DENTAL CLINIC — AI Receptionist backend
 * Google Apps Script (FREE). Bound to the "Harsha Appointments" Sheet.
 *
 * Sheet must have 3 tabs (exact names):
 *   Hours        -> Day | Open1 | Close1 | Open2 | Close2   (times as HH:mm, blank = closed)
 *   Blocked      -> Date | Start | End | Reason             (Date = YYYY-MM-DD, times HH:mm)
 *   Appointments -> BookedAt | Name | Phone | Problem | Date | Time | Status
 *
 * Deploy: Extensions > Apps Script > paste this > Deploy > New deployment
 *   Type: Web app | Execute as: Me | Who has access: Anyone
 * Copy the Web app URL and put it in the Vapi tool config.
 *************************************************************************/

// ---- CONFIG (edit these) --------------------------------------------
var SECRET   = 'CHANGE_ME_secret123';   // must match the token Vapi sends
var SLOT_MIN = 30;                       // appointment slot length (minutes)
var MAX_DAYS = 14;                       // how far ahead patients can book
var TZ       = 'Asia/Kolkata';
// ---------------------------------------------------------------------

function _ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function _tab(n){ return _ss().getSheetByName(n); }
function _json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function _pad(n){ return (n<10?'0':'')+n; }
function _toMin(hhmm){ if(!hhmm) return null; var p=String(hhmm).split(':'); return parseInt(p[0],10)*60+parseInt(p[1],10); }
function _toHHMM(m){ return _pad(Math.floor(m/60))+':'+_pad(m%60); }
function _dayName(d){ return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]; }
function _fmtDate(d){ return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function _parseDate(s){ var p=String(s).split('-'); return new Date(p[0], p[1]-1, p[2]); }

// Working half-day ranges for a given weekday, from the Hours tab
function _hoursFor(dayName){
  var rows=_tab('Hours').getDataRange().getValues(); // includes header
  for(var i=1;i<rows.length;i++){
    if(String(rows[i][0]).trim().toLowerCase()===dayName.toLowerCase()){
      var ranges=[];
      if(rows[i][1] && rows[i][2]) ranges.push([_toMin(rows[i][1]), _toMin(rows[i][2])]);
      if(rows[i][3] && rows[i][4]) ranges.push([_toMin(rows[i][3]), _toMin(rows[i][4])]);
      return ranges;
    }
  }
  return [];
}

// Busy minute-ranges for a date = existing appointments + blocked entries
function _busyFor(dateStr){
  var busy=[];
  var ap=_tab('Appointments').getDataRange().getValues();
  for(var i=1;i<ap.length;i++){
    var status=String(ap[i][6]||'').toLowerCase();
    if(String(ap[i][4])===dateStr && status!=='cancelled'){
      var t=_toMin(ap[i][5]); if(t!=null) busy.push([t, t+SLOT_MIN]);
    }
  }
  var bl=_tab('Blocked').getDataRange().getValues();
  for(var j=1;j<bl.length;j++){
    var bd = (bl[j][0] instanceof Date) ? _fmtDate(bl[j][0]) : String(bl[j][0]);
    if(bd===dateStr){ var s=_toMin(bl[j][1]), e=_toMin(bl[j][2]); if(s!=null&&e!=null) busy.push([s,e]); }
  }
  return busy;
}

// Free slot start-times (HH:mm) for one date
function _freeSlots(dateStr){
  var d=_parseDate(dateStr);
  var ranges=_hoursFor(_dayName(d));
  var busy=_busyFor(dateStr);
  var now=new Date();
  var isToday=_fmtDate(now)===dateStr;
  var nowMin=now.getHours()*60+now.getMinutes()+30; // 30-min lead time for same-day
  var slots=[];
  for(var r=0;r<ranges.length;r++){
    for(var m=ranges[r][0]; m+SLOT_MIN<=ranges[r][1]; m+=SLOT_MIN){
      if(isToday && m<nowMin) continue;
      var clash=false;
      for(var b=0;b<busy.length;b++){ if(m<busy[b][1] && (m+SLOT_MIN)>busy[b][0]){ clash=true; break; } }
      if(!clash) slots.push(_toHHMM(m));
    }
  }
  return slots;
}

// GET: ?token=..&action=availability&from=YYYY-MM-DD&days=7
//      ?token=..&action=slots&date=YYYY-MM-DD
function doGet(e){
  try{
    var p=e.parameter||{};
    if(p.token!==SECRET) return _json({ok:false, error:'unauthorized'});
    var action=p.action||'availability';

    if(action==='slots'){
      return _json({ok:true, date:p.date, dayName:_dayName(_parseDate(p.date)), slots:_freeSlots(p.date)});
    }
    // availability: next N open days that actually have free slots
    var start = p.from ? _parseDate(p.from) : new Date();
    var want  = Math.min(parseInt(p.days||'5',10), 10);
    var out=[], added=0;
    for(var i=0;i<MAX_DAYS && added<want;i++){
      var d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
      var ds=_fmtDate(d);
      var s=_freeSlots(ds);
      if(s.length){ out.push({date:ds, dayName:_dayName(d), slots:s}); added++; }
    }
    return _json({ok:true, clinic:'Harsha Multi-Speciality Dental Clinic', slotMinutes:SLOT_MIN, days:out});
  }catch(err){ return _json({ok:false, error:String(err)}); }
}

// POST: { token, name, phone, problem, date, time }
function doPost(e){
  try{
    var b=JSON.parse(e.postData.contents||'{}');
    if(b.token!==SECRET) return _json({ok:false, error:'unauthorized'});
    if(!b.name || !b.date || !b.time) return _json({ok:false, error:'missing name/date/time'});

    // re-check the slot is still free
    var free=_freeSlots(b.date);
    if(free.indexOf(b.time)===-1)
      return _json({ok:false, error:'slot_taken', freeSlots:free});

    _tab('Appointments').appendRow([
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
      b.name, b.phone||'', b.problem||'', b.date, b.time, 'Booked'
    ]);
    return _json({ok:true, message:'Appointment booked', name:b.name, date:b.date, time:b.time});
  }catch(err){ return _json({ok:false, error:String(err)}); }
}
