// Owner dashboard (single page, no external resources, noindex). Served by the Worker at /booking-admin
// (Sveltia CMS keeps /admin/). Works on desktop and Android (responsive, large touch targets).
export const ADMIN_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Bookings — Exotic Fish Cabo</title>
<style>
:root{--ink:#111;--line:#e3e0d8;--bg:#f6f4ef;--o:#fb7704;--ok:#1a7f37;--bad:#b42318;--warn:#b54708;--mut:#666}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header{background:#111;color:#fff;padding:12px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}header b{letter-spacing:.05em}
nav{display:flex;gap:6px;flex-wrap:wrap}nav button{background:#2a2a2a;color:#fff;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit}nav button.on{background:var(--o)}
main{padding:18px;max-width:1400px;margin:auto}.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
input,select,textarea,button{font:inherit}input,select,textarea{padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:#fff;max-width:100%}
button.b{background:#111;color:#fff;border:0;border-radius:8px;padding:9px 14px;cursor:pointer;font-weight:600}button.b.o{background:var(--o)}button.b.g{background:var(--ok)}button.b.r{background:var(--bad)}button.b.l{background:#fff;color:#111;border:1.5px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:#faf9f6;position:sticky;top:0}
tr.click{cursor:pointer}tr.click:hover{background:#fff7ef}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.row label{display:grid;gap:4px;font-size:13px;font-weight:600}
.pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:700;background:#eee}
.CONFIRMED{background:#dcfce7;color:#14532d}.AWAITING_PAYMENT,.HELD{background:#fef3c7;color:#78350f}.AWAITING_PAYMENT_VERIFICATION{background:#ffedd5;color:#7c2d12}
.PAYMENT_EXCEPTION{background:#fee2e2;color:#7f1d1d}.REFUND_PENDING{background:#ede9fe;color:#4c1d95}.CANCELED,.EXPIRED,.REFUNDED{background:#f1f1f1;color:#555}
.test{background:#e0f2fe;color:#075985}.msg{font-weight:600;margin:8px 0}.err{color:var(--bad)}.okm{color:var(--ok)}
.cal{overflow:auto}.cal table{font-size:12px}.cal td,.cal th{padding:4px;text-align:center;min-width:30px;border:1px solid var(--line)}.cal td.c{cursor:pointer}
.s-available{background:#fff}.s-booked{background:#86efac}.s-pending{background:#fde68a}.s-blocked{background:#d4d4d4}.s-too_soon,.s-past,.s-closed{background:#f5f5f5;color:#aaa}
.x2{outline:2px solid var(--o);outline-offset:-2px}#detail{position:fixed;inset:0;background:rgb(0 0 0/.45);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:24px}
#detail .card{max-width:860px;width:100%}.kv{display:grid;grid-template-columns:200px 1fr;gap:4px 12px;font-size:14px}.kv div:nth-child(odd){color:var(--mut)}
.actions{display:grid;gap:10px;margin-top:14px}.actions fieldset{border:1px solid var(--line);border-radius:10px;padding:10px}.actions legend{font-weight:700}
.hide{display:none!important}small{color:var(--mut)}
@media(max-width:640px){main{padding:10px}.kv{grid-template-columns:1fr}.kv div:nth-child(odd){margin-top:6px}.row label,.row input,.row select{width:100%}button.b{min-height:44px}nav button{padding:10px 12px}#detail{padding:8px}}
</style></head><body>
<header><b>EXOTIC FISH CABO · BOOKINGS</b><nav id="nav" class="hide">
<button data-t="list" class="on">Bookings</button><button data-t="cal">Calendar</button><button data-t="phone">New phone booking</button><button data-t="second">Record second trip</button>
<button data-t="clients">Clients</button><button data-t="boats">Boats &amp; prices</button><button data-t="settings">Settings</button><button data-t="audit">Audit log</button>
<button id="runjob" class="hide" title="Staging only: runs the hourly job now (expires holds past their deadline, sends the expiry notices once)">Run hourly job (staging)</button><button id="csv">Export CSV</button><button id="logout">Sign out</button></nav></header>
<main>
<section id="login" class="card" style="max-width:420px;margin:40px auto"><h2>Sign in</h2><form id="lf"><div class="row"><label>Password<input type="password" id="pw" autocomplete="current-password" required></label><button class="b o">Sign in</button></div></form><p class="msg err" id="lmsg"></p></section>
<section id="t-list" class="hide"><div class="card"><div class="row">
<label>Search<input id="q" placeholder="ref, name, email, phone"></label><label>Status<select id="fs"><option value="">All</option></select></label>
<label>Boat<select id="fb"><option value="">All</option></select></label><label>From<input type="date" id="ff"></label><label>To<input type="date" id="ft"></label>
<button class="b" id="go">Filter</button></div></div><div class="card" style="overflow:auto"><table><thead><tr><th>Ref</th><th>Date</th><th>Boat</th><th>Trip</th><th>Customer</th><th>People</th><th>Payment</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div></section>
<section id="t-cal" class="hide"><div class="card"><div class="row"><button class="b l" id="cprev">◀</button><b id="cmonth"></b><button class="b l" id="cnext">▶</button>
<small>Click a cell: free → block/unblock · booked → open the booking. Green = confirmed, yellow = awaiting payment, grey = blocked (M = manual booking taken before online booking). Orange outline = second trip. Past months stay visible here only.</small></div>
<div class="cal" id="cal"></div></div></section>
<section id="t-phone" class="hide"><div class="card"><h2>New phone booking</h2>
<p>For a customer on the phone or WhatsApp. Same rules as the website: valid boat/duration only (Boat #1 = 6 hours), approved price, one trip per boat per day. The price is filled in automatically.</p>
<form id="pf" class="actions"><div class="row"><label>Boat<select name="boat" id="pb" required></select></label><label>Duration<select name="hours" id="ph"></select></label><label>Date<input type="date" name="date" id="pd" required></label>
<label>People<input type="number" name="people" min="1" max="10" value="2" required></label></div>
<p class="msg" id="pprice"></p>
<div class="row"><label>First name<input name="fname" required autocomplete="off"></label><label>Last name<input name="lname" autocomplete="off"></label><label>Phone<input name="phone" required autocomplete="off"></label><label>Email <small>(for the confirmation)</small><input type="email" name="email" autocomplete="off"></label></div>
<label style="display:grid;gap:4px;font-weight:600;font-size:13px">Notes<textarea name="message" rows="2"></textarea></label>
<div class="row"><label>Deposit<select name="payment" id="pp"><option value="received">Already received (cash, Wise…) → confirm now</option><option value="stripe">Send a card payment link (Stripe, +6%)</option><option value="wise">Customer will pay by Wise (I verify later)</option></select></label>
<label class="rcv">Amount received (USD)<input type="number" name="amount" step="0.01" id="pa"></label><label class="rcv">How / reference<input name="payRef" placeholder="cash, Wise #…"></label><label class="rcv">Type <code>VERIFIED</code><input name="confirm" autocomplete="off"></label></div>
<div class="row"><button class="b o">Create booking</button></div><p class="msg" id="pmsg"></p></form></div></section>
<section id="t-second" class="hide"><div class="card"><h2>Record an approved second trip</h2>
<p>Only when the boat already has a booking that day and <b>you have personally checked</b> a second trip is possible. The existing booking is not touched. The customer receives a payment request; the booking becomes <b>CONFIRMED</b> (and you get the confirmation email) only once the deposit is paid by card or you verify the Wise payment.</p>
<form id="sf" class="actions"><div class="row"><label>Boat<select name="boat" id="sb" required></select></label><label>Date<input type="date" name="date" required></label>
<label>Duration<select name="hours"><option value="6">3/4 day (6 hours)</option><option value="8">Full day (8 hours)</option></select></label>
<label>People<input type="number" name="people" min="1" max="10" value="2" required></label>
<label>Deposit by<select name="payment"><option value="stripe">Card (Stripe, +6%)</option><option value="wise">Wise</option></select></label></div>
<div class="row"><label>First name<input name="fname" required></label><label>Last name<input name="lname" required></label><label>Email<input type="email" name="email" required></label><label>Phone<input name="phone" required></label></div>
<label style="display:grid;gap:4px;font-weight:600;font-size:13px">Message / notes<textarea name="message" rows="3"></textarea></label>
<div class="row"><label>Type <code>SECOND TRIP</code> to confirm<input name="confirm" required autocomplete="off"></label><button class="b o">Record second trip &amp; send payment request</button></div>
<p class="msg" id="smsg"></p></form></div></section>
<section id="t-clients" class="hide"><div class="card" style="overflow:auto"><p><small>Private list: customer name and email address only, one line per email (from the bookings).</small></p><table><thead><tr><th>Customer name</th><th>Customer email</th></tr></thead><tbody id="crows"></tbody></table></div></section>
<section id="t-boats" class="hide"><div class="card" style="overflow:auto"><p><small>Approved prices (USD). Empty price = that duration is not offered (Boat #1: 6 hours only). Every change is recorded (history + audit log). Prices are never shown as a list on the website: customers see one price at a time (SHOW MY PRICE).</small></p>
<table><thead><tr><th>#</th><th>Boat</th><th>6 h price</th><th>8 h price</th><th>Deposit</th><th>Capacity</th><th>Online</th></tr></thead><tbody id="brows"></tbody></table><p class="msg" id="bmsg"></p></div></section>
<section id="t-settings" class="hide"><div class="card"><form id="setf" class="row"></form><p class="msg" id="setmsg"></p><p><small>Times use the business timezone America/Mazatlan.</small></p></div></section>
<section id="t-audit" class="hide"><div class="card" style="overflow:auto"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Booking</th><th>Details</th></tr></thead><tbody id="arows"></tbody></table></div></section>
</main>
<div id="detail"><div class="card" id="dc"></div></div>
<script>
const $=s=>document.querySelector(s),H=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(p,body)=>{const r=await fetch('/api/admin/'+p,body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-efc-admin':'1'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({ok:false,error:'HTTP '+r.status}));if(r.status===401&&p!=='login'){show(false)}return j};
const SET_LABELS={min_lead_hours:'Minimum notice (hours before departure)',departure_hour_local:'Reference departure hour (0–23)',departure_minute_local:'Reference departure minutes (0–59)',booking_window_days:'Bookable up to (days ahead)',stripe_fee_pct:'Card fee (%)',stripe_hold_minutes:'Card checkout hold (minutes)',wise_hold_hours:'Wise hold (hours)',override_hold_hours:'Second-trip payment hold (hours)'};
let O=null,month=null;
const pill=(s,t)=>'<span class="pill '+H(s)+'">'+H(s)+'</span>'+(t?' <span class="pill test">TEST</span>':'');
const money=c=>'$'+(c/100).toFixed(2);
function show(on){$('#login').classList.toggle('hide',on);$('#nav').classList.toggle('hide',!on);if(!on)document.querySelectorAll('main>section[id^=t-]').forEach(s=>s.classList.add('hide'));}
async function boot(){const o=await api('overview');if(!o.ok){show(false);return}O=o;show(true);month=o.today.slice(0,7);
 $('#fs').innerHTML='<option value="">All</option>'+o.statuses.map(s=>'<option>'+s+'</option>').join('');
 const bo=o.boats.map(b=>'<option value="'+b.id+'">#'+b.number+' '+H(b.name)+'</option>').join('');$('#fb').innerHTML='<option value="">All</option>'+bo;$('#sb').innerHTML=bo;$('#pb').innerHTML=bo;
 tab('list')}
function tab(t){document.querySelectorAll('#nav button[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));document.querySelectorAll('main>section[id^=t-]').forEach(s=>s.classList.toggle('hide',s.id!=='t-'+t));
 ({list,cal,boats:boatsTab,settings:settingsTab,audit:auditTab,second:()=>{},phone:phoneTab,clients:clientsTab})[t]()}
async function list(){const p=new URLSearchParams({q:$('#q').value,status:$('#fs').value,boat:$('#fb').value,from:$('#ff').value,to:$('#ft').value});const j=await api('bookings?'+p);
 $('#rows').innerHTML=(j.bookings||[]).map(b=>'<tr class="click" data-id="'+b.id+'"><td><b>'+H(b.ref)+'</b>'+(b.source==='override'?' <span class="pill">2nd trip</span>':'')+'</td><td>'+H(b.date)+'</td><td>#'+b.boat_number+' '+H(b.boat_name)+'</td><td><b>'+b.hours+' HOURS</b></td><td>'+H(b.first_name+' '+b.last_name)+'<br><small>'+H(b.email)+' · '+H(b.phone)+'</small></td><td>'+b.people+'</td><td>'+H(b.payment_method)+'<br><small>'+money(b.charge_cents)+'</small></td><td>'+pill(b.status,b.is_test)+'</td></tr>').join('')||'<tr><td colspan="8">No bookings.</td></tr>';}
$('#rows').onclick=e=>{const tr=e.target.closest('tr[data-id]');if(tr)detail(tr.dataset.id)};
async function detail(id){const j=await api('booking?id='+encodeURIComponent(id));if(!j.ok)return alert(j.error);const b=j.booking;
 const kv=[['Reference',b.ref],['Status',null],['Boat',b.boat_name],['Trip duration',b.hours+' HOURS'],['Date',b.date+(b.slot?' — second trip #'+(b.slot+1):'')],['Customer',b.first_name+' '+b.last_name],['Email',b.email],['Phone',b.phone],['People',b.people],['Message',b.message],
  ['Total',b.total_usd+' USD'],['Deposit',b.deposit_usd+' USD'+(b.fee_cents?' + '+money(b.fee_cents)+' card fee':'')],['Charged',money(b.charge_cents)],['Balance',b.balance_usd+' USD'],['Payment',b.payment_method],['Hold until',b.hold_expires_at||'—'],['Source',b.source],['Created',b.created_at],['Owner email',b.owner_notified_at||'not sent'],['Customer email',b.customer_notified_at||'not sent'],['Note',b.admin_note||'']];
 $('#dc').innerHTML='<div class="row" style="justify-content:space-between"><h2 style="margin:0">'+H(b.ref)+'</h2><button class="b l" id="dx">Close</button></div><div class="kv" style="margin-top:12px">'+kv.map(([k,v])=>'<div>'+k+'</div><div>'+(k==='Status'?pill(b.status,b.is_test):H(v))+'</div>').join('')+'</div>'+
 '<div class="actions">'+
 (b.payment_method==='wise'&&['AWAITING_PAYMENT_VERIFICATION','EXPIRED'].includes(b.status)?'<fieldset><legend>Wise deposit received?</legend><div class="row"><label>Amount received (USD)<input id="wa" type="number" step="0.01" value="'+b.deposit_usd+'"></label><label>Wise reference<input id="wr"></label><label>Type VERIFIED<input id="wv" autocomplete="off"></label><button class="b g" data-a="confirm_wise">Confirm booking</button></div><small>Only after you have checked the money in your Wise account. This sends the confirmation emails.</small></fieldset>':'')+
 (!['CANCELED','REFUNDED','EXPIRED'].includes(b.status)?'<fieldset><legend>Cancel</legend><div class="row"><label>Reason (sent to customer if ticked)<input id="cr" size="40"></label><label><span><input type="checkbox" id="cn"> email the customer</span></label><label>Type CANCEL<input id="cc" autocomplete="off"></label><button class="b r" data-a="cancel">Cancel booking</button></div><small>A paid booking becomes REFUND_PENDING (refund it yourself in Stripe/Wise, then mark refunded).</small></fieldset>':'')+
 (['CONFIRMED','PAYMENT_EXCEPTION','REFUND_PENDING','CANCELED'].includes(b.status)?'<fieldset><legend>Refund status</legend><button class="b l" data-a="refund_pending">Mark refund pending</button> <button class="b l" data-a="refunded">Mark refunded</button></fieldset>':'')+
 (b.holds_slot?'<fieldset><legend>Change date</legend><div class="row"><input type="date" id="md"><button class="b l" data-a="move_date">Move</button></div></fieldset>':'')+
 (b.status==='CONFIRMED'?'<fieldset><legend>Customer email</legend><div class="row"><b style="user-select:all">'+H(b.email||'(none)')+'</b>'+(b.email?' <a class="b l" style="text-decoration:none" href="mailto:'+H(b.email)+'?subject='+encodeURIComponent(j.official?j.official.subject:'')+'&body='+encodeURIComponent(j.official?j.official.text:'')+'">Write official confirmation</a> <button class="b l" data-a="resend_confirmation">Resend deposit receipt</button>':'')+'</div>'+(j.official?'<details style="margin-top:8px"><summary>Official confirmation text (pre-filled, copy and send it yourself)</summary><pre style="white-space:pre-wrap;font-size:13px;user-select:all">'+H(j.official.text)+'</pre></details>':'')+'</fieldset>':'')+
 '<fieldset><legend>Note</legend><div class="row"><textarea id="nt" rows="2" cols="50">'+H(b.admin_note||'')+'</textarea><button class="b l" data-a="note">Save note</button></div></fieldset><p class="msg" id="dmsg"></p></div>'+
 '<h3>Payments</h3><table>'+(j.payments.map(p=>'<tr><td>'+H(p.created_at)+'</td><td>'+H(p.provider)+'</td><td>'+money(p.amount_cents)+' '+H(p.currency)+'</td><td>'+H(p.status)+'</td><td><small>'+H(p.external_id)+'</small></td></tr>').join('')||'<tr><td>None</td></tr>')+'</table>'+
 '<h3>Emails</h3><table>'+(j.emails.map(e=>'<tr><td>'+H(e.at)+'</td><td>'+H(e.kind)+'</td><td>'+H(e.recipient)+'</td><td>'+H(e.status)+'</td><td><details><summary>'+H(e.subject)+'</summary><pre style="white-space:pre-wrap;font-size:12px">'+H(e.body)+'</pre></details></td></tr>').join('')||'<tr><td>None</td></tr>')+'</table>'+
 '<h3>History</h3><table>'+j.audit.map(a=>'<tr><td>'+H(a.at)+'</td><td>'+H(a.actor)+'</td><td>'+H(a.action)+'</td><td><small>'+H(a.details)+'</small></td></tr>').join('')+'</table>';
 $('#detail').style.display='flex';$('#dx').onclick=()=>{$('#detail').style.display='none'};
 $('#dc').querySelectorAll('[data-a]').forEach(btn=>btn.onclick=async()=>{const a=btn.dataset.a,v=s=>($(s)||{}).value;
  const body={id:b.id,action:a,amount:v('#wa'),wiseRef:v('#wr'),confirm:a==='confirm_wise'?v('#wv'):v('#cc'),reason:v('#cr'),notify:($('#cn')||{}).checked,date:v('#md'),note:v('#nt')};
  const r=await api('action',body);if(r.ok){detail(b.id);list()}else{$('#dmsg').className='msg err';$('#dmsg').textContent=r.error}})}
$('#detail').onclick=e=>{if(e.target.id==='detail')e.target.style.display='none'};
async function cal(){$('#cmonth').textContent=month;const j=await api('calendar?month='+month);if(!j.ok)return;const days=[];for(let d=j.from;d<=j.to;d=new Date(Date.parse(d+'T00:00:00Z')+864e5).toISOString().slice(0,10))days.push(d);
 const by={};j.reservations.forEach(r=>{(by[r.boat_id+'|'+r.date]??=[]).push(r)});const bl={};j.blocks.forEach(x=>bl[x.boat_id+'|'+x.date]=x.reason||'blocked');
 $('#cal').innerHTML='<table><tr><th>Boat</th>'+days.map(d=>'<th>'+d.slice(8)+'</th>').join('')+'</tr><tr><td><b>All boats</b></td>'+days.map(d=>'<td class="c '+(bl['*|'+d]?'s-blocked':'')+'" data-b="*" data-d="'+d+'" title="'+H(bl['*|'+d]||'Block this day for every boat')+'">'+(bl['*|'+d]?'✕':'')+'</td>').join('')+'</tr>'+
 j.boats.map(b=>'<tr><td style="text-align:left;white-space:nowrap">#'+b.number+' '+H(b.name)+'</td>'+days.map(d=>{const st=j.states[b.id][d],rs=by[b.id+'|'+d]||[];const t=rs.map(r=>r.ref+' '+r.status+' '+r.first_name+' '+r.last_name).join(' · ');
  return '<td class="c s-'+st+(rs.some(r=>r.slot>0)?' x2':'')+'" data-b="'+b.id+'" data-d="'+d+'" data-r="'+(rs[0]?rs[0].id:'')+'" title="'+H(t||bl[b.id+'|'+d]||st)+'">'+(rs.length>1?rs.length:rs.length?'●':st==='blocked'?(/^MANUAL BOOKING/.test(bl[b.id+'|'+d]||'')?'M':'✕'):'')+'</td>'}).join('')+'</tr>').join('')+'</table>'}
$('#cal').onclick=async e=>{const td=e.target.closest('td.c');if(!td)return;if(td.dataset.r)return detail(td.dataset.r);const isB=td.classList.contains('s-blocked');
 if(!confirm((isB?'Unblock ':'Block ')+td.dataset.d+(td.dataset.b==='*'?' for ALL boats':' for this boat')+'?'))return;const reason=isB?'':prompt('Reason (optional)')||'';
 const r=await api('block',{boat:td.dataset.b,date:td.dataset.d,block:!isB,reason});if(r.warning)alert(r.warning);if(!r.ok)alert(r.error);cal()};
$('#cprev').onclick=()=>{const[y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);cal()};
$('#cnext').onclick=()=>{const[y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);cal()};
async function boatsTab(){const o=await api('overview');O=o;$('#brows').innerHTML=o.boats.map(b=>'<tr data-id="'+b.id+'"><td>'+b.number+'</td><td>'+H(b.name)+'</td>'+
 [['price6',b.p6],['price8',b.p8],['deposit',b.deposit_usd],['capacity',b.capacity]].map(([f,v])=>'<td><input type="number" min="0" step="1" style="width:110px" data-f="'+f+'" value="'+(v??'')+'" placeholder="on request"></td>').join('')+
 '<td><input type="checkbox" data-f="active" '+(b.active?'checked':'')+'></td></tr>').join('')}
$('#brows').onchange=async e=>{const i=e.target;const id=i.closest('tr').dataset.id;const r=await api('price',{boat:id,field:i.dataset.f,value:i.type==='checkbox'?(i.checked?1:0):i.value});
 $('#bmsg').className='msg '+(r.ok?'okm':'err');$('#bmsg').textContent=r.ok?'Saved.':r.error;if(!r.ok)boatsTab()};
async function settingsTab(){const o=await api('overview');$('#setf').innerHTML=Object.entries(SET_LABELS).map(([k,l])=>'<label>'+l+'<input type="number" name="'+k+'" value="'+o.settings[k]+'"></label>').join('')+'<button class="b">Save</button>'}
$('#setf').onsubmit=async e=>{e.preventDefault();const r=await api('settings',Object.fromEntries(new FormData(e.target)));$('#setmsg').className='msg '+(r.ok?'okm':'err');$('#setmsg').textContent=r.ok?'Saved.':r.error};
async function clientsTab(){const j=await api('clients');$('#crows').innerHTML=(j.clients||[]).map(c=>'<tr><td>'+H(c.name)+'</td><td style="user-select:all">'+H(c.email)+'</td></tr>').join('')||'<tr><td colspan="2">No clients yet.</td></tr>'}
async function auditTab(){const j=await api('audit');$('#arows').innerHTML=j.audit.map(a=>'<tr><td>'+H(a.at)+'</td><td>'+H(a.actor)+'</td><td>'+H(a.action)+'</td><td>'+H(a.ref||'')+'</td><td><small>'+H(a.details)+'</small></td></tr>').join('')}
$('#sf').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.hours=+f.hours;f.people=+f.people;
 if(!confirm('Record a SECOND trip for this boat on '+f.date+'? The customer will receive a deposit payment request.'))return;const r=await api('second-trip',f);
 $('#smsg').className='msg '+(r.ok?'okm':'err');$('#smsg').innerHTML=r.ok?'Recorded '+H(r.ref)+' (status '+H(r.status)+'). Payment request '+(r.emailSent?'emailed':'NOT emailed — send this link yourself')+': <a href="'+H(r.payUrl)+'">'+H(r.payUrl)+'</a>':H(r.error);if(r.ok)e.target.reset()};
$('#nav').onclick=e=>{const t=e.target.dataset&&e.target.dataset.t;if(t)tab(t)};$('#go').onclick=list;$('#q').onkeydown=e=>{if(e.key==='Enter')list()};
$('#csv').onclick=()=>{location.href='/api/admin/export.csv'};
if(!/(^|\\.)fish-cabo\\.com$/.test(location.hostname)){$('#runjob').classList.remove('hide');$('#runjob').onclick=async()=>{if(!confirm('STAGING: run the hourly job now?\\nOnly bookings already past their deadline are expired; each expiry notice is sent once.'))return;const r=await api('run-hourly-job',{});alert(r.ok?('Done.\\nExpired now: '+r.summary.expired+'\\nCustomer expiry emails: '+r.summary.customerExpiryEmails+'\\nOwner expiry emails: '+r.summary.ownerExpiryEmails+'\\nConfirmation retries: '+r.summary.confirmationRetries):('Error: '+(r.error||'unknown')));list()}}
$('#logout').onclick=async()=>{await api('logout',{});show(false)};
$('#lf').onsubmit=async e=>{e.preventDefault();const r=await api('login',{password:$('#pw').value});$('#pw').value='';if(r.ok)boot();else $('#lmsg').textContent=r.error};
function phoneTab(){phoneSync()}
function phoneSync(){const b=O.boats.find(x=>x.id===$('#pb').value)||O.boats[0];const cur=$('#ph').value;const ds=[6,8].filter(h=>(h===6?b.p6:b.p8)!=null);
 $('#ph').innerHTML=ds.map(h=>'<option value="'+h+'">'+h+' hours</option>').join('');if(ds.includes(+cur))$('#ph').value=cur;const h=+$('#ph').value,tot=h===6?b.p6:b.p8;
 $('#pprice').textContent=tot!=null?'Price '+tot+' USD · deposit '+b.deposit_usd+' USD · balance '+(tot-b.deposit_usd)+' USD cash on the day':'';if(!$('#pa').value)$('#pa').value=b.deposit_usd;
 document.querySelectorAll('#pf .rcv').forEach(x=>x.classList.toggle('hide',$('#pp').value!=='received'))}
$('#pb').onchange=()=>{$('#pa').value='';phoneSync()};$('#ph').onchange=phoneSync;$('#pp').onchange=phoneSync;
$('#pf').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.hours=+f.hours;f.people=+f.people;const r=await api('phone-booking',f);
 $('#pmsg').className='msg '+(r.ok?'okm':'err');$('#pmsg').innerHTML=r.ok?'Created '+H(r.ref)+' — '+H(r.status)+' · total '+r.total+' USD, balance '+r.balance+' USD.'+(r.payUrl?' Card payment link '+(r.emailSent?'emailed':'NOT emailed')+': <a href="'+H(r.payUrl)+'">'+H(r.payUrl)+'</a>':'')+(r.status==='CONFIRMED'?(r.emailSent?' Confirmation emailed.':' No customer email given.'):''):H(r.error);if(r.ok){e.target.reset();phoneSync()}};
boot();
</script></body></html>`;
