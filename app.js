'use strict';
// v2 deliberately preserves the original localStorage key so upgrades retain v1 records.
const KEY='my-budget-v1';let today=new Date(),month=ym(today),ledgerMonth=ym(today),tab='home',calOpen=false,selected=iso(today),editing=null;
const initial=()=>({settings:{mode:'calendar',payday:25},months:{},transactions:[],fixedTemplates:[{id:'savings',name:'저축',amount:0},{id:'maintenance',name:'관리비',amount:0},{id:'interest',name:'이자비용',amount:0}],installments:[]});
let db;try{db=Object.assign(initial(),JSON.parse(localStorage.getItem(KEY)||'{}'));if(!db.settings||!db.months||!Array.isArray(db.transactions))throw Error('Invalid data');db.installments=Array.isArray(db.installments)?db.installments:[];db.fixedTemplates=Array.isArray(db.fixedTemplates)?db.fixedTemplates:initial().fixedTemplates}catch{db=initial()}
const $=id=>document.getElementById(id),num=x=>Number(x)||0,amt=x=>Math.max(0,Math.round(num(x))),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),won=x=>Math.round(num(x)).toLocaleString('ko-KR')+'원';
// App-owned dialogs keep confirm/save on the left on every browser. A separate
// modal preserves any transaction form underneath, including on cancellation.
let messageQueue=Promise.resolve();
function appMessage(message,{kind='alert',value=''}={}){
 const result=messageQueue.then(()=>new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.id='appMessageDialog';dialog.className='app-message-dialog';
  dialog.setAttribute('aria-labelledby','appMessageTitle');dialog.setAttribute('aria-describedby','appMessageText');
  const prompt=kind==='prompt',canCancel=kind!=='alert';
  dialog.innerHTML=`<form><h2 class="title" id="appMessageTitle">${prompt?'이름 변경':canCancel?'확인':'안내'}</h2><p class="app-message-text" id="appMessageText">${esc(message)}</p>${prompt?`<div class="field"><label for="appMessageInput">이름</label><input id="appMessageInput" value="${esc(value)}" autocomplete="off" autofocus></div>`:''}<div class="btnRow${canCancel?'':' single-action'}"><button type="submit" class="primary" data-message-accept ${prompt?'':'autofocus'}>확인</button>${canCancel?'<button type="button" class="outline" data-message-cancel>취소</button>':''}</div></form>`;
  document.body.appendChild(dialog);let finished=false;
  const cancelValue=prompt?null:false;
  const finish=answer=>{if(finished)return;finished=true;dialog.close();dialog.remove();resolve(answer)};
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();finish(prompt?dialog.querySelector('input').value:true)};
  const cancel=dialog.querySelector('[data-message-cancel]');if(cancel)cancel.onclick=()=>finish(cancelValue);
  dialog.oncancel=e=>{e.preventDefault();finish(cancelValue)};
  dialog.onclose=()=>finish(cancelValue);
  dialog.showModal();
 }));
 messageQueue=result.catch(()=>{});return result;
}
function appAlert(message){return appMessage(message)}
function appConfirm(message){return appMessage(message,{kind:'confirm'})}
function appPrompt(message,value=''){return appMessage(message,{kind:'prompt',value})}
function ym(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};function iso(d){return ym(d)+'-'+String(d.getDate()).padStart(2,'0')};function fromISO(s){return new Date(Number(s.slice(0,4)),Number(s.slice(5,7))-1,Number(s.slice(8,10)))}function first(m){return fromISO(m+'-01')};function plusM(m,k){let d=first(m);d.setMonth(d.getMonth()+k);return ym(d)};function diff(a,b){let a0=Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()),b0=Date.UTC(b.getFullYear(),b.getMonth(),b.getDate());return Math.round((b0-a0)/86400000)};function daysOf(m){let d=first(m);return new Date(d.getFullYear(),d.getMonth()+1,0).getDate()};function id(){return globalThis.crypto?.randomUUID?.()||'id_'+Date.now()+'_'+Math.random().toString(36).slice(2)}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(db));render()}catch(e){appAlert('저장 공간이 부족하거나 브라우저 저장이 차단됐습니다. 백업 후 저장 상태를 확인하세요.')}}
function mData(m){return db.months[m]||{income:0,fixed:db.fixedTemplates.map(x=>({...x}))}}
function ensure(m){if(!db.months[m]){let prev=plusM(m,-1);let source=db.months[prev]?.fixed||db.fixedTemplates;db.months[m]={income:db.months[prev]?.income||0,fixed:source.map(x=>({...x}))}}return db.months[m]}
function period(m){let d=first(m),y=d.getFullYear(),mo=d.getMonth(),p=Math.max(1,Math.min(31,Math.round(num(db.settings.payday)||25)));if(db.settings.mode!=='payday')return [new Date(y,mo,1),new Date(y,mo+1,0)];let current=new Date(y,mo,Math.min(p,daysOf(m))),nextM=plusM(m,1),next=new Date(y,mo+1,Math.min(p,daysOf(nextM)));return[current,new Date(next.getFullYear(),next.getMonth(),next.getDate()-1)]}
// A payday budget is named for the month in which its period starts.
// On dates before this month's payday, today's active period began last month.
function activeBudgetMonth(date=new Date()){
 const calendarMonth=ym(date);
 if(db.settings.mode!=='payday')return calendarMonth;
 const payday=Math.max(1,Math.min(31,Math.round(num(db.settings.payday)||25)));
 const startDay=Math.min(payday,daysOf(calendarMonth));
 return date.getDate()<startDay?plusM(calendarMonth,-1):calendarMonth;
}
// Preserve the currently viewed calendar month separately from the budget period.
month=activeBudgetMonth(today);
function installSchedule(i){let out=[],count=Math.max(1,Math.min(240,Math.round(num(i.months)))),total=amt(i.total),base=Math.floor(total/count),extra=total-base*count;for(let j=0;j<count;j++){let mon=plusM(i.start,j);if(i.stop&&mon>i.stop)break;out.push({id:i.id+'-'+mon,date:mon+'-01',name:i.name,amount:base+(j===count-1?extra:0),category:i.category||'할부',installmentId:i.id,number:j+1,months:count})}return out}
// Derive installment fixed costs instead of copying them into editable monthly
// fixed rows. This prevents double deductions and recurrence after completion.
function installmentsForPeriod(m){
 const [start,end]=period(m),from=iso(start),to=iso(end);
 return db.installments.flatMap(i=>installSchedule(i).filter(t=>i.budgetBasis==='period'?t.date.slice(0,7)===m:t.date>=from&&t.date<=to));
}
// Keep only legacy calendar entries already visible at the time of upgrading.
function installmentRows(){return db.installments.flatMap(i=>i.ledgerThrough?installSchedule(i).filter(t=>t.date<=i.ledgerThrough):[])}
function migrateInstallmentFixedCosts(){
 for(const i of db.installments){
  if(i.budgetBasis!=='period'&&i.budgetBasis!=='legacy-date'){
   i.budgetBasis='legacy-date';i.ledgerThrough=iso(new Date());
  }
 }
}
function finance(m){const [start,end]=period(m),key=iso(start),last=iso(end),count=diff(start,end)+1,details=mData(m),normal=details.fixed.reduce((s,x)=>s+amt(x.amount),0);let installments=installmentsForPeriod(m),instTotal=installments.reduce((s,t)=>s+t.amount,0);let rows=db.transactions.filter(t=>t.date>=key&&t.date<=last);let exp=rows.filter(t=>t.type==='expense'&&t.treatment!=='fixedPaid').reduce((s,t)=>s+amt(t.amount),0),extra=rows.filter(t=>t.type==='income').reduce((s,t)=>s+amt(t.amount),0);let earn=amt(details.income)+extra,available=earn-normal-instTotal;const live=fromISO(iso(new Date())),elapsed=Math.min(count,Math.max(0,diff(start,live)+1));return{start,end,count,elapsed,details,normal,installments,instTotal,rows,exp,extra,earn,available,daily:available/count,pace:available/count*elapsed-exp,remaining:available-exp}}
function isViewed(m){return ym(new Date())===m}
const TAB_ORDER=['home','ledger','stats','news','settings'];
let swipeDirection=0;
let budgetEdit=false,budgetDraft=null,budgetOpen={fixed:false,installments:false};
function cloneBudgetData(){let src=mData(month);return {income:amt(src.income),fixed:src.fixed.map(x=>({...x}))};}
function closeBudgetEdit(){budgetEdit=false;budgetDraft=null;}

function activeSection(name){
  if(![...TAB_ORDER,'budget','newsAdmin'].includes(name)||name===tab)return;
  if(tab==='budget'&&budgetEdit){appAlert('수정완료 또는 취소 후 화면을 이동해 주세요.');return;}
  const a=TAB_ORDER.indexOf(tab),b=TAB_ORDER.indexOf(name);
  swipeDirection=a>=0&&b>=0?Math.sign(b-a):0;
  if(name==='ledger')calOpen=false;
  if(name==='newsAdmin')ensureNewsDraft();
  tab=name;render();window.scrollTo(0,0);
}
function changeMonth(k){if(budgetEdit){appAlert('예산 수정완료 또는 취소 후 기간을 변경해 주세요.');return;}if(tab==='ledger'){ledgerMonth=plusM(ledgerMonth,k);selected=ledgerMonth+'-01'}else{month=plusM(month,k)}render()}
async function txAdd(e){e.preventDefault();let f=new FormData(e.target),amount=amt(f.get('amount')),date=String(f.get('date')||''),type=String(f.get('type')||'expense'),catid=String(f.get('categoryId')||''),c=db.categories.find(x=>x.id===catid);if(!amount||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||iso(fromISO(date))!==date||!c||c.type!==type)return appAlert('날짜·금액·카테고리를 확인해 주세요.');let data={date,amount,type,categoryId:c.id,category:c.name,memo:String(f.get('memo')||'').trim(),treatment:type==='expense'?String(f.get('treatment')||'living'):'living'};if(editing){let t=db.transactions.find(t=>t.id===editing);if(t)Object.assign(t,data)}else{let duplicate=db.transactions.some(t=>t.date===date&&t.amount===amount&&t.type===type&&t.memo===data.memo&&t.categoryId===catid);if(duplicate&&!await appConfirm('같은 날짜·금액·내용의 거래가 있습니다. 그래도 등록할까요?'))return;db.transactions.push({id:id(),...data})}editing=null;$('txDialog').close();selected=date;if(tab==='ledger')ledgerMonth=ym(fromISO(date));else month=activeBudgetMonth(fromISO(date));persist()}
function editTx(txid){let t=db.transactions.find(x=>x.id===txid);if(!t)return;editing=txid;openTx(t)}async function removeTx(txid){if(!await appConfirm('이 거래를 삭제하시겠습니까?'))return;db.transactions=db.transactions.filter(t=>t.id!==txid);persist()}
const legacyCategories=['식비','카페','교통','쇼핑','생활','취미','의료','경조사','기타'];
function openTx(t={}){editing=t.id||null;const dialog=$('txDialog'),type=t.type||'expense',cat=t.categoryId||db.categories.find(x=>x.name===t.category&&x.type===type)?.id||'';dialog.innerHTML=`<form id="txForm"><div class="title">${t.id?'거래 수정':'거래 등록'}</div><div class="split"><div class="field"><label>날짜</label><input name="date" type="date" value="${esc(t.date||selected||iso(today))}" required></div><div class="field"><label>구분</label><select name="type" id="txType"><option value="expense" ${type==='expense'?'selected':''}>지출</option><option value="income" ${type==='income'?'selected':''}>추가 수입</option></select></div></div><div class="split"><div class="field"><label>금액</label><input type="number" name="amount" min="1" required value="${t.amount||''}"></div><div class="field"><label>카테고리</label><select name="categoryId" id="txCategory" required></select></div></div><div class="field"><label>내용</label><input name="memo" value="${esc(t.memo||'')}" placeholder="예: 점심, 중고판매"></div><div class="field" id="txTreatWrap"><label>생활비 계산</label><select name="treatment"><option value="living" ${t.treatment!=='fixedPaid'?'selected':''}>일반 생활비 지출</option><option value="fixedPaid" ${t.treatment==='fixedPaid'?'selected':''}>이미 고정비·할부로 차감한 결제 (중복 차감 제외)</option></select></div><div class="btnRow"><button type="submit" class="primary">${t.id?'수정 저장':'거래 저장'}</button><button type="button" class="outline" id="cancelTx">취소</button></div></form>`;dialog.showModal();let refreshCat=()=>{let ty=$('txType').value;let opts=db.categories.filter(c=>c.type===ty&&!c.archived&&(c.active||c.id===cat));$('txCategory').innerHTML=opts.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.active?'':' (사용 중지)'}</option>`).join('');$('txCategory').value=opts.some(c=>c.id===cat)?cat:(opts[0]?.id||'');$('txTreatWrap').hidden=ty!=='expense'};$('txType').onchange=refreshCat;refreshCat();$('cancelTx').onclick=()=>{editing=null;dialog.close()};$('txForm').onsubmit=txAdd}
function rowsHTML(rows){if(!rows.length)return '<div class="empty muted">등록된 내역이 없습니다.</div>';return [...rows].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map((t,i)=>`<div class="toss-transaction"><span class="ui-glyph ${t.type==='income'?'green-tone':['blue','amber','pink','violet'][i%4]}">${uiIcon(uiTxKind(t))}</span><div class="transaction-main"><b>${esc(t.memo||t.name||catName(t)||'거래')}</b><small>${esc(t.date)} · ${esc(catName(t))}${t.installmentId?' · '+t.number+'/'+t.months+'회차 할부':''}${t.treatment==='fixedPaid'?' · 이미 예산 차감':''}</small></div><div class="transaction-tail"><b class="${t.type==='income'?'blue-text':''}">${t.type==='income'?'+':'−'}${won(t.amount)}</b>${t.installmentId?'<span class="tiny-badge">할부 자동</span>':`<span class="edit-actions"><button class="text-link" data-edit="${esc(t.id)}">수정</button><button class="text-link red" data-delete="${esc(t.id)}">삭제</button></span>`}</div></div>`).join('')}


const uiIcon=(kind)=>{
 const paths={
  wallet:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 9V6a3 3 0 0 1 3-3h13M16 13h5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  chart:'<path d="M4 20h16M6 17v-6M11 17V7M16 17V4M21 17V9"/>',
  coins:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v11c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  receipt:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
  sliders:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="white"/><circle cx="16" cy="17" r="2" fill="white"/>',
  pig:'<circle cx="11" cy="12" r="7"/><ellipse cx="10" cy="14" rx="3.5" ry="2.2"/><path d="M6 6 4 3l-1 5M16 7l3-3 1 5M17 14c2 0 4-1 4-3"/>',
  coffee:'<path d="M5 7h12v8a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V7ZM17 9h2a3 3 0 0 1 0 6h-2M3 21h17"/>',
  food:'<path d="M5 3v7M8 3v7M11 3v7M8 10v11M17 3v18M17 3c-4 4-4 9 0 10"/>',
  house:'<path d="m3 11 9-8 9 8v9h-7v-6h-4v6H3z"/>',
  phone:'<path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM10 18h4"/>',
  card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  pencil:'<path d="m4 16-.7 4.7L8 20l12-12-4-4L4 16ZM14 6l4 4"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  shopping:'<path d="M4 8h16l-1 13H5L4 8ZM8 9V6a4 4 0 0 1 8 0v3"/>',
  bus:'<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2M16 19v2M8 7h3M14 7h2"/>',
  heart:'<path d="M20 7c-3-4-7-2-8 0-1-2-5-4-8 0-3 5 4 10 8 13 4-3 11-8 8-13Z"/>',
  gift:'<rect x="3" y="10" width="18" height="11" rx="1"/><path d="M12 10v11M3 14h18M12 10C5 10 5 4 9 4c2 0 3 3 3 6Zm0 0c7 0 7-6 3-6-2 0-3 3-3 6Z"/>',
  game:'<path d="M8 8h8c3 0 4 3 5 8 .5 3-2 4-4 2l-2-2H9l-2 2c-2 2-4 .5-4-2 1-5 2-8 5-8Z"/><path d="M8 11v5M5.5 13.5h5M16 12h.1M18 14h.1"/>',
  book:'<path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15"/>',
  plane:'<path d="m3 21 6-7-6-3 2-2 7 2 7-8c3-2 4 1 2 3l-8 7 2 7-2 2-3-6-7 5Z"/>',
  paw:'<circle cx="7" cy="7" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="17" cy="7" r="1"/><circle cx="20" cy="11" r="1"/><path d="M12 11c3 0 4 3 6 5 2 4-2 6-6 4-4 2-8 0-6-4 2-2 3-5 6-5Z"/>',
  shirt:'<path d="m9 4 3 2 3-2 5 3 2 5-4 2-1-2v9H7v-9l-1 2-4-2 2-5 5-3Z"/>',
  sparkles:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  cart:'<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 4h3l3 12h11l3-9H6"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
 };
 return `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]||paths.wallet}</svg>`;
};

// Category icon catalog. Only icon keys are persisted; historical transaction amounts are untouched.
// Settings category controls are intentionally hidden until the user enters edit mode.
let categoryEdit=false, categoryOpen=false, categoryDraft=null;
function viewCategories(){return categoryEdit&&categoryDraft?categoryDraft:db.categories;}
function findCategoryDraft(cid){return categoryDraft?.find(c=>c.id===cid);}
function categoryCancel(){categoryEdit=false;categoryDraft=null;render();}
function categorySave(){
 if(!categoryEdit||!categoryDraft)return;
 for(const type of ['expense','income']){
  const active=categoryDraft.filter(c=>c.type===type&&c.active!==false&&!c.archived);
  if(!active.length)return appAlert(type==='expense'?'지출 카테고리는 최소 1개 필요합니다.':'수입 카테고리는 최소 1개 필요합니다.');
  const names=active.map(c=>c.name.trim());
  if(new Set(names).size!==names.length||names.some(n=>!n))return appAlert('카테고리 이름이 중복되거나 비어 있습니다.');
 }
 const keep=[];
 for(const item of categoryDraft){
  if(item.archived){
   const used=db.transactions.some(t=>t.categoryId===item.id);
   if(used){keep.push({...item,active:false,archived:true})}
   continue;
  }
  keep.push({...item});
 }
 const liveIds=new Set(keep.filter(c=>!c.archived).map(c=>c.id));
 db.quickTemplates=db.quickTemplates.filter(q=>liveIds.has(q.categoryId));
 db.categories=keep;
 categoryEdit=false;categoryDraft=null;persist();
}
const CATEGORY_ICONS=[
 ['food','식비'],['coffee','카페'],['card','카드'],['house','주거'],['phone','통신'],['wallet','급여'],
 ['pig','저축'],['coins','금융'],['receipt','기타'],['calendar','정기'],['chart','투자'],['shopping','쇼핑'],
 ['bus','교통'],['heart','의료'],['gift','선물'],['game','취미'],['book','교육'],['plane','여행'],
 ['paw','반려동물'],['shirt','의류'],['sparkles','미용'],['cart','마트']
];
function categoryIconFor(cat){
 if(cat?.icon&&CATEGORY_ICONS.some(([key])=>key===cat.icon))return cat.icon;
 const name=String(cat?.name||'');
 if(/카페|커피/.test(name))return 'coffee';
 if(/식비|식사|음식|외식|배달/.test(name))return 'food';
 if(/교통|택시|버스|지하철|주유/.test(name))return 'bus';
 if(/쇼핑|구매|물품|생활용품/.test(name))return 'shopping';
 if(/월세|주거|관리비|집/.test(name))return 'house';
 if(/통신|휴대폰|인터넷/.test(name))return 'phone';
 if(/저축|적금/.test(name))return 'pig';
 if(/투자|주식/.test(name))return 'chart';
 if(/의료|병원|약/.test(name))return 'heart';
 if(/보험|이자|금융/.test(name))return 'coins';
 if(/취미|여가/.test(name))return 'game';
 if(/여행|숙박/.test(name))return 'plane';
 if(/급여|수입|월급/.test(name))return 'wallet';
 if(/선물|경조/.test(name))return 'gift';
 return 'receipt';
}
function categoryIconMarkup(cat){return uiIcon(categoryIconFor(cat));}
function openCategoryIconPicker(categoryId){
 if(!categoryEdit||!categoryDraft)return;
 const cat=findCategoryDraft(categoryId);if(!cat)return;
 const dialog=$('txDialog');
 dialog.innerHTML=`<div class="icon-picker"><div class="picker-head"><h2>${esc(cat.name)} 아이콘 선택</h2><button class="icon-picker-close" id="closeIconPicker" type="button" aria-label="닫기">✕</button></div><p class="muted">수정완료를 누르면 아이콘 변경이 저장됩니다. 기존 거래금액은 유지됩니다.</p><div class="icon-choice-grid">${CATEGORY_ICONS.map(([key,label])=>`<button type="button" class="icon-choice ${categoryIconFor(cat)===key?'selected':''}" data-pick-icon="${key}" aria-label="${label} 아이콘" aria-pressed="${categoryIconFor(cat)===key}"><span class="ui-glyph blue">${uiIcon(key)}</span><span>${label}</span></button>`).join('')}</div></div>`;
 dialog.showModal();
 $('closeIconPicker').onclick=()=>dialog.close();
 dialog.querySelectorAll('[data-pick-icon]').forEach(b=>b.onclick=()=>{cat.icon=b.dataset.pickIcon;dialog.close();render()});
}

const uiTxKind=t=>{const chosen=catById(t.categoryId);if(chosen)return categoryIconFor(chosen);const c=String(catName(t)+' '+(t.memo||'')).toLowerCase();return t.type==='income'?'wallet':/카페|커피|스타벅스|투썸/.test(c)?'coffee':/식비|점심|저녁|아침|음식|식당/.test(c)?'food':/월세|주거|관리비|집/.test(c)?'house':/교통|버스|택시/.test(c)?'card':'receipt'};
const uiTag=(name,symbol='wallet',tint='blue')=>`<span class="ui-glyph ${tint}">${uiIcon(symbol)}</span><span>${esc(name)}</span>`;

function home(){
 const c=finance(month),label=iso(c.start)+' ~ '+iso(c.end);
 const now=iso(new Date()),past=c.rows.filter(t=>t.type==='expense'&&t.treatment!=='fixedPaid'&&t.date<=now).reduce((s,t)=>s+amt(t.amount),0),future=c.rows.filter(t=>t.type==='expense'&&t.treatment!=='fixedPaid'&&t.date>now).reduce((s,t)=>s+amt(t.amount),0),pred=c.elapsed>0?c.available-past/c.elapsed*c.count:c.available,forecast=c.elapsed>0?Math.min(pred,c.available-past-future):c.available-future;
 const ratio=c.available>0?Math.min(100,Math.max(0,c.exp/c.available*100)):0;
 const recent=[...c.rows].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4);
 return `<div class="screen-layout home-screen">
 <section class="hero-blue"><div class="hero-copy"><span class="hero-label">오늘 기준 사용 가능 금액 ⓘ</span><strong class="hero-number">${c.pace>=0?'+':'−'}${won(Math.abs(c.pace))}</strong><span class="hero-dates">${label} (${c.count}일)</span></div><img class="hero-pig" src="./pig-hero.png" alt="돼지저금통"></section>
 <div class="budget-summary-head"><h3>예산 요약</h3><button type="button" class="outline mini" id="openBudget" data-move="budget">예산 관리 ›</button></div>
 <section class="compact-metrics">
  <article class="metric-mini"><div class="metric-ico blue">${uiIcon('calendar')}</div><div class="metric-caption">하루 예산</div><strong>${won(c.daily)}</strong></article>
  <article class="metric-mini"><div class="metric-ico amber">${uiIcon('coins')}</div><div class="metric-caption">남은 생활비</div><strong class="metric-em">${won(c.remaining)}</strong></article>
  <article class="metric-mini"><div class="metric-ico violet">${uiIcon('chart')}</div><div class="metric-caption">월말 예상 잔액</div><strong class="blue-text">${forecast>=0?'+':'−'}${won(Math.abs(forecast))}</strong></article>
 </section>
 <section class="toss-card spend-panel"><div class="panel-head"><h3>생활비 사용현황</h3><b>${won(c.exp)} <span>/ ${won(c.available)}</span></b></div><div class="bar big-progress"><div style="width:${ratio}%"></div></div><div class="panel-foot"><span class="spend-rate">${ratio.toFixed(1)}% 사용</span><span class="spend-remain">${won(c.remaining)} 남음</span></div></section>
 <div class="home-actions"><button class="outline" data-add="income">+ 수입 입력</button><button class="primary" data-add="expense">+ 지출 입력</button></div>
 <section class="toss-card quick-panel"><div class="panel-head"><h3>빠른 입력</h3><button class="text-link" id="quickManage">더보기 ›</button></div><div class="quick-controls">${db.quickTemplates.length?`<div class="quick-row">${db.quickTemplates.map((q,i)=>`<button class="quick-chip" data-quick="${esc(q.id)}"><span class="quick-ico ${['blue','amber','violet'][i%3]}">${uiIcon(['food','coffee','house'][i%3])}</span><span>${esc(q.name)}<small>${won(q.amount)}</small></span></button>`).join('')}</div>`:''}<button type="button" class="quick-chip quick-add" id="quickAdd"><span class="quick-ico blue">${uiIcon('plus')}</span><span class="quick-add-label">추가하기</span></button></div></section>
 ${homeNews()}
 <section class="toss-card recent-panel"><div class="panel-head"><h3>최근 거래</h3><button class="text-link" data-move="ledger">전체보기 ›</button></div>${rowsHTML(recent)}</section>
 </div>`;
}

function budget(){
 const c=finance(month),current=budgetEdit&&budgetDraft?budgetDraft:c.details;
 const fixedTotal=current.fixed.reduce((s,x)=>s+amt(x.amount),0)+c.instTotal,avail=amt(current.income)+c.extra-fixedTotal;
 const fixedRows=budgetEdit?current.fixed.map(x=>`<div class="edit-fixed-row"><div class="field"><label>항목명</label><input data-fname="${esc(x.id)}" value="${esc(x.name)}"></div><div class="field"><label>금액</label><input type="number" min="0" data-famount="${esc(x.id)}" value="${amt(x.amount)}"></div><button class="danger mini" data-rfixed="${esc(x.id)}">삭제</button></div>`).join(''):current.fixed.map((x,i)=>`<div class="fixed-entry"><span class="fixed-name"><span class="ui-glyph ${['pink','blue','amber','violet'][i%4]}">${uiIcon(categoryIconFor({name:x.name}))}</span>${esc(x.name)}</span><b>${won(x.amount)}</b></div>`).join('');
 const automaticFixedRows=c.installments.map(t=>`<div class="fixed-entry installment-fixed-entry"><span class="fixed-name"><span class="ui-glyph blue">${uiIcon('card')}</span><span><b>${esc(t.name)}</b><small>할부 자동 · ${t.number}/${t.months}회차 · 이후 ${t.months-t.number}회 남음</small></span></span><b>${won(t.amount)}</b></div>`).join('');
 const instRows=db.installments.map(i=>{let due=c.installments.filter(t=>t.installmentId===i.id);let schedule=installSchedule(i),periods=schedule.map(t=>i.budgetBasis==='period'?t.date.slice(0,7):activeBudgetMonth(fromISO(t.date))),status=due.length?'고정지출 반영 중':periods.every(p=>p<month)?'종료 · 지난 내역 보관':'반영 예정';return `<div class="fixed-entry"><span class="fixed-name"><span class="ui-glyph blue">${uiIcon('card')}</span><span><b>${esc(i.name)}</b><small>${won(i.total)} · ${i.months}개월 · ${esc(i.start)}부터 · ${status}</small></span></span><span><b>${won(due.reduce((s,x)=>s+x.amount,0))}</b>${budgetEdit?`<button class="mini secondary" data-einst="${esc(i.id)}">수정</button><button class="mini danger" data-rinst="${esc(i.id)}">삭제</button>`:''}</span></div>`}).join('')||'<p class="muted empty-state">등록된 할부가 없습니다.</p>';
 return `<div class="screen-layout budget-screen">
 <div><button type="button" class="outline mini" data-move="home">‹ 홈</button></div>
 <section class="budget-heading"><div><h2>예산 관리</h2><p class="muted">수입과 지출을 한눈에 관리하세요.</p></div><img class="budget-pig" src="./pig-hero.png" alt=""></section>
 <section class="budget-snapshot" aria-label="이번 기간 예산 요약"><div class="budget-snapshot-top"><span class="budget-snapshot-label">이번 기간 생활비 예산</span><strong class="budget-snapshot-amount">${won(avail)}</strong></div><div class="budget-snapshot-bottom"><span>오늘 기준 여유금</span><b class="${c.pace<0?'red':'green'}">${c.pace>=0?'+':'−'}${won(Math.abs(c.pace))}</b></div></section>
 <div class="budget-controls">${budgetEdit?`<button class="primary" id="saveBudget">${uiIcon('check')} 수정완료</button><button class="outline" id="addFixedTop">${uiIcon('plus')} 항목 추가</button><button class="outline" id="cancelBudget">취소</button>`:`<button class="outline" id="editBudget">${uiIcon('pencil')} 수정</button>`}</div>
 <section class="toss-card income-box"><div class="income-row"><span class="ui-glyph blue">${uiIcon('wallet')}</span><div class="income-main"><span>기본 월수입</span>${budgetEdit?`<input type="number" id="income" min="0" value="${amt(current.income)}">`:`<strong>${won(current.income)}</strong>`}</div></div><div class="income-secondary"><span>추가 수입</span><b class="blue-text">+${won(c.extra)}</b></div>${budgetEdit?`<button class="text-link" data-add="income">+ 추가 수입 등록</button>`:''}</section>
 <section class="toss-card accordion-box"><button class="fold-head" id="toggleFixed" aria-expanded="${budgetOpen.fixed}"><span class="ui-glyph blue">${uiIcon('calendar')}</span><span class="fold-title"><b>고정지출</b><small>${current.fixed.length+c.installments.length}개 항목 · ${won(fixedTotal)}</small></span><span class="fold-arrow ${budgetOpen.fixed?'up':''}">${uiIcon('chevron')}</span></button>${budgetOpen.fixed?`<div class="fold-body">${fixedRows}${automaticFixedRows}${!current.fixed.length&&!c.installments.length?'<p class="muted">등록된 고정지출이 없습니다.</p>':''}${budgetEdit?`<button class="soft-add" id="addFixed">+ 항목 추가</button>`:''}</div>`:''}</section>
 <section class="toss-card accordion-box"><button class="fold-head" id="toggleInst" aria-expanded="${budgetOpen.installments}"><span class="ui-glyph blue">${uiIcon('card')}</span><span class="fold-title"><b>할부 관리</b><small>고정지출에 포함 · ${won(c.instTotal)}</small></span><span class="fold-arrow ${budgetOpen.installments?'up':''}">${uiIcon('chevron')}</span></button>${budgetOpen.installments?`<div class="fold-body">${instRows}${budgetEdit?`<button class="soft-add" id="addInst">+ 할부 등록</button>`:''}</div>`:''}</section>
 
 </div>`;
}

function calendarData(m){let count=daysOf(m),date=first(m),firstWeek=date.getDay(),cells=[];let beginning=new Date(date.getFullYear(),date.getMonth(),1-firstWeek);let records=db.transactions.map(t=>({...t}));let paid=installmentRows().map(t=>({...t,type:'expense'}));let byDate={};for(let t of [...records,...paid]){(byDate[t.date]??=[]).push(t)}for(let i=0;i<Math.ceil((firstWeek+count)/7)*7;i++){let d=new Date(beginning.getFullYear(),beginning.getMonth(),beginning.getDate()+i),key=iso(d),t=byDate[key]||[];let exp=t.filter(x=>x.type==='expense').reduce((s,x)=>s+amt(x.amount),0),income=t.filter(x=>x.type==='income').reduce((s,x)=>s+amt(x.amount),0);cells.push({key,day:d.getDate(),other:ym(d)!==m,exp,income})}return{cells,byDate,count}}
function ledger(){const month=ledgerMonth;
 let {cells,byDate}=calendarData(month),chosen=byDate[selected]||[],monthRows=Object.entries(byDate).filter(([d])=>d.startsWith(month)).flatMap(([,r])=>r),inTotal=monthRows.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0),outTotal=monthRows.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);let firstRow=Math.floor(cells.findIndex(x=>x.key===selected)/7);if(firstRow<0)firstRow=0;let display=calOpen?cells:cells.slice(firstRow*7,firstRow*7+7);
 return `<div class="screen-layout ledger-screen"><section class="ledger-heading"><h2>내역</h2><button class="icon-button" id="openSearch" aria-label="검색 및 필터">${uiIcon('search')}</button></section>
 <section class="toss-card calendar-box"><div class="calendar-top"><button class="month-mini" id="calPrev">‹</button><b>${month.replace('-','년 ')}월</b><button class="month-mini" id="calNext">›</button></div><div class="cal-month-totals"><span class="blue-text">수입 +${won(inTotal)}</span><span class="red">지출 −${won(outTotal)}</span></div><div class="calendar clean-calendar">${['일','월','화','수','목','금','토'].map(w=>`<div class="weekday">${w}</div>`).join('')}${display.map(d=>`<button class="calDay ${d.other?'other':''} ${d.key===selected?'selected':''} ${d.key===iso(today)?'today':''}" data-day="${d.key}" aria-label="${d.key} 수입 ${won(d.income)} 지출 ${won(d.exp)}"><span class="calNum">${d.day}</span>${d.income?`<span class="calAmt blue">+${formatShort(d.income)}</span>`:''}${d.exp?`<span class="calAmt red">−${formatShort(d.exp)}</span>`:''}</button>`).join('')}</div><button id="toggleCal" class="cal-toggle" aria-expanded="${calOpen}">${uiIcon('chevron')}<span>${calOpen?'달력 접기':'달력 펼치기'}</span></button></section>
 <section class="toss-card day-box"><div class="panel-head"><h3>${Number(selected.slice(5,7))}월 ${Number(selected.slice(8,10))}일 내역</h3><button class="ledger-add-button" data-add="expense">+ 거래 등록</button></div>${rowsHTML(chosen)}</section>
 <section id="searchArea" class="toss-card search-box" hidden><div class="panel-head"><h3>거래 검색 · 필터</h3><button id="closeSearch" class="text-link">닫기</button></div><div class="field"><label>내용·카테고리</label><input id="searchText" value="${esc(searchState.text)}" placeholder="스타벅스, 식비 등"></div><div class="split"><div class="field"><label>구분</label><select id="searchType"><option value="all">전체</option><option value="expense" ${searchState.type==='expense'?'selected':''}>지출</option><option value="income" ${searchState.type==='income'?'selected':''}>수입</option></select></div><div class="field"><label>카테고리</label><select id="searchCat"><option value="all">전체</option>${db.categories.map(c=>`<option value="${esc(c.id)}" ${searchState.cat===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div></div><div class="split"><div class="field"><label>시작일</label><input type="date" id="searchFrom" value="${esc(searchState.from)}"></div><div class="field"><label>종료일</label><input type="date" id="searchTo" value="${esc(searchState.to)}"></div></div><div class="split"><div class="field"><label>최소 금액</label><input type="number" id="searchMin" min="0" value="${esc(searchState.min)}"></div><div class="field"><label>최대 금액</label><input type="number" id="searchMax" min="0" value="${esc(searchState.max)}"></div></div><button class="outline mini" id="searchReset">검색 초기화</button><div class="panel-head space"><h3>검색 결과 <span id="searchCount"></span></h3></div><div id="searchResults"></div></section>
 <section class="toss-card csv-box"><div class="panel-head"><h3>CSV 거래내역 업로드</h3><button class="outline mini" id="csvExport">CSV 내보내기</button></div><p class="muted">날짜, 구분, 금액, 카테고리, 내용 컬럼을 사용합니다.</p><input id="csvInput" type="file" accept=".csv,text/csv"></section>
 </div>`;
}

function formatShort(v){return Math.abs(v)>=1000000?(v/10000).toFixed(0)+'만':Math.round(v).toLocaleString('ko-KR')}
function stats(){let c=finance(month),by={};c.rows.filter(t=>t.type==='expense'&&t.treatment!=='fixedPaid').forEach(t=>{let k=catName(t);by[k]=(by[k]||0)+amt(t.amount)});return `<div class="page-shell"><section class="page-head page-top"><div><p class="eyebrow">이번 달 소비 분석</p><h2>통계</h2><p class="muted">지출 흐름과 비중을 한눈에 확인하세요.</p></div></section><section class="metrics-grid stats-grid"><article class="card metric-card"><div class="metric-label">생활비 지출</div><div class="metric-value">${won(c.exp)}</div><div class="metric-note">이번 예산 기간 기준</div></article><article class="card metric-card"><div class="metric-label">하루 평균</div><div class="metric-value">${won(c.elapsed?c.exp/c.elapsed:0)}</div><div class="metric-note">현재까지 평균</div></article><article class="card metric-card"><div class="metric-label">하루 예산</div><div class="metric-value">${won(c.daily)}</div><div class="metric-note">목표 예산</div></article></section><section class="card"><div class="section-inline"><div><p class="eyebrow">지출 비중</p><h3>카테고리별 지출</h3></div></div>${Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="item"><div class="row"><b>${esc(k)}</b><b>${won(v)}</b></div><div class="bar space"><div style="width:${c.exp?100*v/c.exp:0}%"></div></div></div>`).join('')||'<div class="empty">지출 내역이 없습니다.</div>'}</section><section class="card"><div class="section-inline"><div><p class="eyebrow">구성 요약</p><h3>고정비 분석</h3></div></div><div class="overview-list"><div class="overview-row"><span>일반 고정지출</span><b>${won(c.normal)}</b></div><div class="overview-row"><span>할부 자동반영</span><b>${won(c.instTotal)}</b></div><div class="overview-row"><span>추가 수입</span><b class="blue">+${won(c.extra)}</b></div></div></section></div>`}
function settings(){return `<div class="page-shell"><section class="page-head page-top"><div><p class="eyebrow">앱 관리</p><h2>설정</h2><p class="muted">카테고리, 빠른 입력, 백업을 관리할 수 있습니다.</p></div></section><section class="card"><div class="section-inline"><div><p class="eyebrow">기본 설정</p><h3>예산 계산 방식</h3></div></div><div class="field"><label>예산 계산 기간</label><select id="mode"><option value="calendar" ${db.settings.mode==='calendar'?'selected':''}>매월 1일 ~ 말일</option><option value="payday" ${db.settings.mode==='payday'?'selected':''}>월급일 ~ 다음 월급일 전날</option></select></div><div class="field"><label>월급일</label><select id="payday">${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${num(db.settings.payday)===i+1?'selected':''}>${i+1}일</option>`).join('')}</select></div><div class="notice">할부는 매월 고정지출에 자동 포함되고 종료 후 자동 제외됩니다. 기존 할부의 기간별 금액은 유지됩니다. 기본 월수입은 기간당 한 번만 계산됩니다.</div></section><section class="card category-panel"><div class="section-inline category-header"><div><p class="eyebrow">분류 관리</p><h3>카테고리 관리</h3><p class="muted category-help">설정한 카테고리를 펼쳐 확인할 수 있습니다.</p></div>${categoryEdit?`<div class="gap category-head-actions"><button class="primary mini" id="saveCategories">수정완료</button><button class="outline mini" id="newCat">+ 추가</button><button class="ghost mini" id="cancelCategories">취소</button></div>`:`<button class="outline" id="editCategories">수정</button>`}</div><button type="button" class="category-toggle" id="toggleCategories" aria-expanded="${categoryOpen}"><span class="category-toggle-copy"><b>카테고리 목록</b><small>지출 ${viewCategories().filter(c=>c.type==='expense'&&!c.archived).length}개 · 수입 ${viewCategories().filter(c=>c.type==='income'&&!c.archived).length}개</small></span><span class="accordion-chevron">${categoryOpen?'⌃':'⌄'}</span></button>${categoryOpen?`<div class="category-list-content"><div class="category-subheading">지출 카테고리</div>${categoryList('expense')}<div class="category-subheading">수입 카테고리</div>${categoryList('income')}${categoryEdit?'<p class="muted category-archive-note">삭제된 카테고리의 과거 거래는 그대로 남으며 통계에도 유지됩니다.</p>':''}</div>`:''}</section><section class="card"><div class="section-inline"><div><p class="eyebrow">빠른 등록</p><h3>빠른 지출 관리</h3></div><button class="outline" id="addQuick">+ 추가</button></div>${db.quickTemplates.length?db.quickTemplates.map(q=>`<div class="row item"><div><b>${esc(q.name)}</b><div class="muted">${won(q.amount)} · ${esc(catById(q.categoryId)?.name||'기타')}</div></div><div class="gap"><button class="secondary mini" data-qedit="${esc(q.id)}">수정</button><button class="danger mini" data-qdel="${esc(q.id)}">삭제</button></div></div>`).join(''):'<div class="empty">저장된 빠른 지출이 없습니다.</div>'}</section><section class="card"><div class="section-inline"><div><p class="eyebrow">백업</p><h3>전체 데이터 백업 · 복원</h3></div></div><p class="muted">기록은 이 기기에만 저장됩니다. 업데이트·기기 변경 전에 백업하세요.</p><button class="primary" id="backup">JSON 전체 백업</button><div class="space"><label>백업 복원 (기존 기록 교체)</label><input id="restore" type="file" accept=".json,application/json"></div></section><section class="card"><div class="section-inline"><div><p class="eyebrow">운영자용</p><h3>공유 뉴스 관리</h3></div></div><p class="muted">뉴스를 정리하고 홈에 표시할 메인 뉴스 1~3개를 선택합니다. 모든 이용자에게 게시하려면 GitHub 업로드가 필요합니다.</p><button type="button" class="outline" data-move="newsAdmin">공유 뉴스 관리 열기</button></section><section class="card"><div class="section-inline"><div><p class="eyebrow">앱 정보</p><h3>업데이트 확인</h3></div></div><button id="checkUpdate" class="outline">업데이트 확인</button><div id="updateStatus" class="update-status" aria-live="polite"></div><p class="muted">꿀꿀가계부 · 데이터는 기기별 보관 · 자동 동기화 없음</p></section></div>`}
function render(){let disp=$('screen');$('monthLabel').textContent=(tab==='ledger'?ledgerMonth:month).replace('-','년 ')+'월';$('prev').closest('.monthnav').hidden=['news','newsAdmin'].includes(tab);const currentNav=tab==='budget'?'home':tab==='newsAdmin'?'settings':tab;$('tabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentNav));disp.innerHTML=({home,budget,ledger,stats,news,settings,newsAdmin})[tab]();if(swipeDirection){disp.classList.remove('screen-from-left','screen-from-right');void disp.offsetWidth;disp.classList.add(swipeDirection>0?'screen-from-right':'screen-from-left');swipeDirection=0;}wire()}
function wire(){document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openTx({type:b.dataset.add,date:tab==='ledger'?selected:iso(new Date())}));document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editTx(b.dataset.edit));document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeTx(b.dataset.delete));document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>activeSection(b.dataset.move));if(tab==='home'){document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{let q=db.quickTemplates.find(x=>x.id===b.dataset.quick);if(q)openTx({type:'expense',date:iso(new Date()),amount:q.amount,memo:q.name,categoryId:q.categoryId,category:catById(q.categoryId)?.name||'기타'})});$('quickManage').onclick=()=>activeSection('settings');$('quickAdd').onclick=()=>openQuick()}if(tab==='budget')wireBudget();if(tab==='ledger')wireLedger();if(tab==='settings')wireSettings();wireNews();if(tab==='newsAdmin')wireNewsAdmin()}
function wireBudget(){
 const toggle=(name)=>{budgetOpen[name]=!budgetOpen[name];render()};
 $('toggleFixed').onclick=()=>toggle('fixed');$('toggleInst').onclick=()=>toggle('installments');
 const edit=$('editBudget')||$('editBudgetInner');if(edit)edit.onclick=()=>{budgetDraft=cloneBudgetData();budgetEdit=true;budgetOpen.fixed=true;render()};
 if(!budgetEdit)return;
 const income=$('income');income.oninput=e=>{budgetDraft.income=amt(e.target.value)};
 const save=$('saveBudget');save.onclick=()=>{
   const valid=budgetDraft.fixed.every(x=>x.name.trim()&&amt(x.amount)>=0);
   if(!valid)return appAlert('고정지출의 항목명과 금액을 확인해 주세요.');
   const data=ensure(month);data.income=amt(budgetDraft.income);data.fixed=budgetDraft.fixed.map(x=>({...x,name:x.name.trim(),amount:amt(x.amount)}));
   closeBudgetEdit();persist();
 };
 $('cancelBudget').onclick=()=>{closeBudgetEdit();render()};
 document.querySelectorAll('[data-fname]').forEach(x=>x.oninput=e=>{let item=budgetDraft.fixed.find(z=>String(z.id)===x.dataset.fname);if(item)item.name=e.target.value});
 document.querySelectorAll('[data-famount]').forEach(x=>x.oninput=e=>{let item=budgetDraft.fixed.find(z=>String(z.id)===x.dataset.famount);if(item)item.amount=amt(e.target.value)});
 document.querySelectorAll('[data-rfixed]').forEach(x=>x.onclick=async()=>{if(await appConfirm('수정 중인 항목을 제외할까요? 수정완료 전까지는 저장되지 않습니다.')){budgetDraft.fixed=budgetDraft.fixed.filter(t=>String(t.id)!==x.dataset.rfixed);render()}});
 const add=$('addFixed');const addTop=$('addFixedTop');const doAdd=()=>{budgetOpen.fixed=true;budgetDraft.fixed.push({id:id(),name:'새 항목',amount:0});render()};if(add)add.onclick=doAdd;if(addTop)addTop.onclick=doAdd;
 const addInst=$('addInst');if(addInst)addInst.onclick=()=>openInstallment();
 document.querySelectorAll('[data-einst]').forEach(x=>x.onclick=()=>openInstallment(db.installments.find(i=>i.id===x.dataset.einst)));
 document.querySelectorAll('[data-rinst]').forEach(x=>x.onclick=async()=>{if(await appConfirm('할부를 삭제하면 모든 예정 회차 표시가 사라집니다. 삭제할까요?')){db.installments=db.installments.filter(i=>i.id!==x.dataset.rinst);persist()}});
}
function openInstallment(i={}){let d=$('txDialog');d.innerHTML=`<form id="instForm"><div class="title">${i.id?'할부 수정':'새 할부 등록'}</div><div class="field"><label>결제 내용</label><input name="name" value="${esc(i.name||'')}" required placeholder="예: 노트북"></div><div class="split"><div class="field"><label>총 할부 금액</label><input name="total" type="number" min="1" required value="${i.total||''}"></div><div class="field"><label>할부 개월 수</label><input name="months" type="number" min="2" max="240" required value="${i.months||3}"></div></div><div class="split"><div class="field"><label>첫 예산 월</label><input name="start" type="month" required value="${esc(i.start||month)}"></div><div class="field"><label>카테고리</label><input name="category" value="${esc(i.category||'할부')}"></div></div><div class="notice">선택한 첫 예산 월부터 매월 고정지출에 한 회차씩 자동 포함됩니다. 마지막 회차 이후에는 자동 제외되며 지난 기록은 보존됩니다. 나머지 금액은 마지막 회차에 합산합니다. 월급일 기준에서는 해당 월에 시작하는 예산 기간에 반영합니다. 기존 할부는 이전 기간 배정을 유지합니다. 할부 원금 기준이며 카드사 이자·수수료는 별도입니다.</div><div class="btnRow space"><button type="submit" class="primary">저장</button><button type="button" class="outline" id="cancelInst">취소</button></div></form>`;d.showModal();$('cancelInst').onclick=()=>d.close();$('instForm').onsubmit=e=>{e.preventDefault();let f=new FormData(e.target),v={id:i.id||id(),name:String(f.get('name')).trim(),total:amt(f.get('total')),months:Math.floor(num(f.get('months'))),start:String(f.get('start')),category:String(f.get('category')||'할부')};if(!v.name||!v.total||v.months<2||v.months>240||!/^[0-9]{4}-[0-9]{2}$/.test(v.start))return appAlert('할부 내용을 확인하세요.');if(i.id)Object.assign(i,v);else db.installments.push({...v,budgetBasis:'period'});d.close();persist()}}
function wireLedger(){$('calPrev').onclick=()=>changeMonth(-1);$('calNext').onclick=()=>changeMonth(1);$('openSearch').onclick=()=>{$('searchArea').hidden=false;$('searchArea').scrollIntoView({behavior:'smooth',block:'start'})};$('closeSearch').onclick=()=>{$('searchArea').hidden=true};$('toggleCal').onclick=()=>{calOpen=!calOpen;render()};document.querySelectorAll('[data-day]').forEach(x=>x.onclick=()=>{selected=x.dataset.day;if(!selected.startsWith(ledgerMonth))ledgerMonth=selected.slice(0,7);render()});$('csvExport').onclick=exportCsv;$('csvInput').onchange=e=>importCsv(e.target.files[0]);let ids=['searchText','searchType','searchCat','searchFrom','searchTo','searchMin','searchMax'];ids.forEach((x,i)=>{let el=$(x);el.oninput=()=>{searchState[['text','type','cat','from','to','min','max'][i]]=el.value;refreshSearch()}});$('searchReset').onclick=()=>{searchState={text:'',type:'all',cat:'all',from:'',to:'',min:'',max:''};render()};refreshSearch()}
function download(filename,contents,type){let blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportCsv(){let rows=[['날짜','구분','금액','카테고리','내용'],...db.transactions.map(t=>[t.date,t.type==='income'?'수입':'지출',t.amount,t.category,t.memo])];download('가계부-거래내역.csv','\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8')}
function parseCsv(text){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(Boolean))rows.push(row);return rows}
async function importCsv(file){if(!file)return;let rows=parseCsv((await file.text()).replace(/^\ufeff/,'')),heads=rows.shift()?.map(x=>x.trim())||[];let find=(...xs)=>heads.findIndex(x=>xs.includes(x)),di=find('날짜','거래일자','거래일'),ai=find('금액','거래금액'),ti=find('구분','수입지출'),ci=find('카테고리','분류'),mi=find('내용','메모','거래내용','가맹점명');if(di<0||ai<0)return appAlert('날짜,금액 열이 필요합니다.');let imported=[],pendingCats=[];for(let r of rows){let date=String(r[di]||'').trim().replace(/[./]/g,'-'),mat=date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(!mat)continue;date=mat[1]+'-'+mat[2].padStart(2,'0')+'-'+mat[3].padStart(2,'0');if(iso(fromISO(date))!==date)continue;let v=Number(String(r[ai]||'').replace(/[,₩원\s]/g,''));if(!Number.isFinite(v)||!v)continue;let type=ti>=0?(['수입','income'].includes(String(r[ti]||'').trim().toLowerCase())?'income':'expense'):(v>0?'income':'expense'),name=ci>=0?String(r[ci]||'기타'):'기타',cat=[...db.categories,...pendingCats].find(c=>c.type===type&&c.name===name);if(!cat){cat={id:id(),name,type,active:false};pendingCats.push(cat)}imported.push({id:id(),date,type,amount:amt(v),categoryId:cat.id,category:name,memo:mi>=0?r[mi]||'':'',treatment:'living'})}let signature=t=>[t.date,t.type,t.amount,catName(t),t.memo].join('|'),existing=new Set(db.transactions.map(signature)),seen=new Set(existing);let fresh=imported.filter(x=>{let s=signature(x);if(seen.has(s))return false;seen.add(s);return true});if(!fresh.length)return appAlert('새로운 거래가 없습니다.');if(await appConfirm(`${imported.length}건 중 신규 ${fresh.length}건을 가져올까요?`)){db.categories.push(...pendingCats);db.transactions.push(...fresh);persist()}}
function openCategoryCreate(){
 const dialog=$('txDialog');let type='income';
 dialog.innerHTML=`<form id="categoryCreateForm"><div class="title">카테고리 추가</div><div class="category-type-buttons" role="group" aria-label="카테고리 구분"><button type="button" class="primary" data-category-type="income" aria-pressed="true">수입</button><button type="button" class="outline" data-category-type="expense" aria-pressed="false">지출</button></div><div class="field"><label for="newCategoryName">카테고리 이름</label><input id="newCategoryName" name="name" required autocomplete="off" placeholder="이름을 입력해 주세요"></div><div class="btnRow"><button type="submit" class="primary">추가</button><button type="button" class="outline" id="cancelCategoryCreate">취소</button></div></form>`;
 dialog.querySelectorAll('[data-category-type]').forEach(button=>button.onclick=()=>{
  type=button.dataset.categoryType;
  dialog.querySelectorAll('[data-category-type]').forEach(b=>{const chosen=b===button;b.className=chosen?'primary':'outline';b.setAttribute('aria-pressed',String(chosen))});
 });
 $('cancelCategoryCreate').onclick=()=>dialog.close();
 $('categoryCreateForm').onsubmit=e=>{
  e.preventDefault();const name=$('newCategoryName').value.trim();
  if(!name)return appAlert('카테고리 이름을 입력해 주세요.');
  if(categoryDraft.some(c=>!c.archived&&c.type===type&&c.name===name))return appAlert('같은 이름의 카테고리가 있습니다.');
  categoryDraft.push({id:id(),name,type,active:true});categoryOpen=true;dialog.close();render();
 };
 dialog.showModal();
}
function wireSettings(){
 $('mode').onchange=e=>{db.settings.mode=e.target.value;month=activeBudgetMonth();persist()};
 $('payday').onchange=e=>{db.settings.payday=num(e.target.value);month=activeBudgetMonth();persist()};
 $('checkUpdate').onclick=checkForUpdates;
 $('backup').onclick=()=>download('꿀꿀가계부-백업-'+iso(new Date())+'.json',JSON.stringify(db,null,2),'application/json');
 $('restore').onchange=async e=>{let file=e.target.files[0];if(!file)return;try{let obj=JSON.parse(await file.text());if(!obj||!obj.months||!Array.isArray(obj.transactions)||!obj.settings)throw Error();if(await appConfirm('기존 기록이 백업 내용으로 교체됩니다. 현재 기록을 백업했나요?')){db=Object.assign(initial(),obj);db.installments=Array.isArray(db.installments)?db.installments:[];migrateV4();migrateInstallmentFixedCosts();categoryEdit=false;categoryDraft=null;closeBudgetEdit();today=new Date();month=activeBudgetMonth(today);ledgerMonth=ym(today);selected=iso(today);persist()}}catch{appAlert('유효한 가계부 JSON 백업 파일이 아닙니다.')}};
 $('toggleCategories').onclick=()=>{categoryOpen=!categoryOpen;render()};
 const edit=$('editCategories');if(edit)edit.onclick=()=>{categoryEdit=true;categoryOpen=true;categoryDraft=db.categories.map(c=>({...c}));render()};
 const cancel=$('cancelCategories');if(cancel)cancel.onclick=categoryCancel;
 const save=$('saveCategories');if(save)save.onclick=categorySave;
 const add=$('newCat');if(add)add.onclick=openCategoryCreate;
 document.querySelectorAll('[data-cicon]').forEach(b=>b.onclick=()=>openCategoryIconPicker(b.dataset.cicon));
 document.querySelectorAll('[data-crename]').forEach(b=>b.onclick=async()=>{
  const c=findCategoryDraft(b.dataset.crename);if(!c)return;
  const name=await appPrompt('카테고리 이름 변경',c.name);if(!name?.trim())return;
  if(categoryDraft.some(x=>!x.archived&&x.id!==c.id&&x.type===c.type&&x.name===name.trim()))return appAlert('같은 이름이 있습니다.');
  c.name=name.trim();render();
 });
 document.querySelectorAll('[data-cdelete]').forEach(b=>b.onclick=async()=>{
  const c=findCategoryDraft(b.dataset.cdelete);if(!c)return;
  const remaining=categoryDraft.filter(x=>x.type===c.type&&!x.archived&&x.active!==false&&x.id!==c.id);
  if(c.active!==false&&!remaining.length)return appAlert('최소 한 개의 카테고리는 남겨야 합니다.');
  const used=db.transactions.filter(t=>t.categoryId===c.id).length;
  const message=used?`「${c.name}」 카테고리를 삭제할까요?\n과거 거래 ${used}건은 원래 카테고리로 계속 표시되고 신규 입력 목록에서는 사라집니다.`:`「${c.name}」 카테고리를 삭제할까요?`;
  if(!await appConfirm(message))return;
  c.archived=true;c.active=false;render();
 });
 $('addQuick').onclick=()=>openQuick();
 document.querySelectorAll('[data-qedit]').forEach(b=>b.onclick=()=>openQuick(db.quickTemplates.find(q=>q.id===b.dataset.qedit)));
 document.querySelectorAll('[data-qdel]').forEach(b=>b.onclick=async()=>{if(await appConfirm('이 빠른 입력 항목을 삭제할까요?')){db.quickTemplates=db.quickTemplates.filter(q=>q.id!==b.dataset.qdel);persist()}});
}

// v4 migration: preserve the existing localStorage key and all historical transactions.
function migrateV4(){if(!Array.isArray(db.categories)){db.categories=[];const predefined={expense:['식비','카페','교통','쇼핑','생활','취미','의료','경조사','기타'],income:['급여','부수입','기타 수입']};for(let type of ['expense','income'])for(let name of predefined[type])db.categories.push({id:id(),name,type,active:true});}
 for(let t of db.transactions){if(t.type!=='income')t.type='expense';if(!t.id)t.id=id();let c=db.categories.find(c=>c.id===t.categoryId&&c.type===t.type);if(!c){c=db.categories.find(c=>c.name===(t.category||'기타')&&c.type===t.type);if(!c){c={id:id(),name:t.category||'기타',type:t.type,active:false};db.categories.push(c)}t.categoryId=c.id}if(!t.treatment)t.treatment='living'}
 if(!Array.isArray(db.quickTemplates))db.quickTemplates=[];
 for(let q of db.quickTemplates){if(!q.id)q.id=id()}
}
function catById(v){return db.categories.find(c=>c.id===v)}
function catName(t){return catById(t.categoryId)?.name||t.category||'기타'}
let searchState={text:'',type:'all',cat:'all',from:'',to:'',min:'',max:''};
function refreshSearch(){let query=searchState.text.trim().toLowerCase(),list=db.transactions.filter(t=>(searchState.type==='all'||t.type===searchState.type)&&(searchState.cat==='all'||t.categoryId===searchState.cat)&&(!searchState.from||t.date>=searchState.from)&&(!searchState.to||t.date<=searchState.to)&&(!searchState.min||amt(t.amount)>=amt(searchState.min))&&(!searchState.max||amt(t.amount)<=amt(searchState.max))&&(!query||(t.memo||'').toLowerCase().includes(query)||catName(t).toLowerCase().includes(query)));list.sort((a,b)=>b.date.localeCompare(a.date));$('searchCount').textContent=`${list.length}건`;$('searchResults').innerHTML=rowsHTML(list.slice(0,150));$('searchResults').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editTx(b.dataset.edit));$('searchResults').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeTx(b.dataset.delete));if(list.length>150)$('searchResults').insertAdjacentHTML('beforeend','<div class="notice">검색 결과는 최근 150건까지 표시합니다. 날짜·카테고리로 범위를 좁혀 주세요.</div>')}
function categoryList(type){return viewCategories().filter(c=>c.type===type&&!c.archived).map(c=>`<div class="row item category-admin-row"><span class="ui-glyph blue">${categoryIconMarkup(c)}</span><div class="category-admin-main"><b>${esc(c.name)}</b>${!c.active?'<span class="badge">사용 안 함</span>':''}<div class="muted">기존 거래 ${db.transactions.filter(t=>t.categoryId===c.id).length}건</div></div>${categoryEdit?`<div class="gap category-admin-actions"><button class="outline mini" data-cicon="${esc(c.id)}">아이콘</button><button class="secondary mini" data-crename="${esc(c.id)}">이름변경</button><button class="danger mini" data-cdelete="${esc(c.id)}">삭제</button></div>`:''}</div>`).join('')||'<p class="muted empty">카테고리가 없습니다.</p>'}
function openQuick(q={}){let d=$('txDialog'),active=db.categories.filter(c=>(c.type==='expense'&&c.active&&!c.archived)||c.id===q.categoryId);d.innerHTML=`<form id="quickForm"><div class="title">${q.id?'빠른 지출 수정':'빠른 지출 추가'}</div><div class="field"><label>이름</label><input name="name" required value="${esc(q.name||'')}" placeholder="예: 회사 점심"></div><div class="field"><label>금액</label><input name="amount" type="number" min="1" required value="${q.amount||''}"></div><div class="field"><label>카테고리</label><select name="categoryId">${active.map(c=>`<option value="${esc(c.id)}" ${q.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="btnRow"><button type="submit" class="primary">저장</button><button type="button" class="outline" id="cancelQuick">취소</button></div></form>`;d.showModal();$('cancelQuick').onclick=()=>d.close();$('quickForm').onsubmit=e=>{e.preventDefault();let f=new FormData(e.target),entry={id:q.id||id(),name:String(f.get('name')||'').trim(),amount:amt(f.get('amount')),categoryId:String(f.get('categoryId')||'')};if(!entry.name||!entry.amount||!catById(entry.categoryId))return appAlert('빠른 입력 항목을 확인해 주세요.');if(q.id)Object.assign(q,entry);else db.quickTemplates.push(entry);d.close();persist()}}
// Do not mark migration complete in local storage until there is valid data to save.
migrateV4();migrateInstallmentFixedCosts();
try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){console.warn('기존 데이터 저장 실패: 백업을 확인해 주세요.',e)}

$('prev').onclick=()=>changeMonth(-1);$('next').onclick=()=>changeMonth(1);$('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>activeSection(b.dataset.tab));let d=document.createElement('dialog');d.id='txDialog';document.body.appendChild(d);render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

// v3 update manager: service worker keeps the same origin and localStorage key.
let swRegistration=null;
let updateDismissed=false;
function notifyUpdate(){
  if(updateDismissed)return;
  const banner=$('updateBanner');if(banner)banner.hidden=false;
}
function checkForUpdates(){
  const status=$('updateStatus');
  if(!('serviceWorker' in navigator)){if(status)status.textContent='이 브라우저는 자동 업데이트 확인을 지원하지 않습니다.';return;}
  if(status)status.textContent='업데이트를 확인하고 있습니다…';
  navigator.serviceWorker.getRegistration().then(reg=>{
    if(!reg){if(status)status.textContent='현재 앱은 새 버전 확인을 준비 중입니다.';return null;}
    return reg.update().then(()=>{
      if(reg.waiting){notifyUpdate();if(status)status.textContent='새 버전이 준비됐습니다.';}
      else if(status)status.textContent='확인 완료. 새 버전이 있으면 상단 알림으로 안내됩니다.';
    });
  }).catch(()=>{if(status)status.textContent='네트워크 상태를 확인하고 다시 시도해 주세요.';});
}
const hadServiceWorkerController=Boolean('serviceWorker' in navigator && navigator.serviceWorker.controller);
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadServiceWorkerController)notifyUpdate();});
  navigator.serviceWorker.ready.then(reg=>{swRegistration=reg; if(reg.waiting)notifyUpdate();}).catch(()=>{});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)navigator.serviceWorker.getRegistration().then(reg=>reg?.update()).catch(()=>{});});
}
$('applyUpdate').onclick=()=>location.reload();
$('dismissUpdate').onclick=()=>{updateDismissed=true;$('updateBanner').hidden=true;};


// v4.2: responsive, consecutive horizontal swipes with live drag feedback.
// Vertical scrolling and typing controls retain their normal behavior;
// horizontal gestures also work over calendar dates without triggering a tap.
(function enableTabSwipe(){
 const surface=$('screen');
 let gesture=null;
 let suppressClickUntil=0;
 // Inputs and calendar cells have their own gestures; ordinary buttons/cards can
 // start a horizontal swipe without losing their normal tap behavior.
 const blocked='input,select,textarea,[contenteditable],dialog,[role="slider"],.bar,.quick-row';
 const clearVisual=()=>{
   surface.style.transform='';
   surface.style.opacity='';
   surface.style.transition='';
   surface.style.willChange='';
 };
 surface.addEventListener('touchstart',e=>{
   if(!TAB_ORDER.includes(tab)||e.touches.length!==1||e.target.closest(blocked)||document.querySelector('dialog[open]')){
     gesture=null;return;
   }
   const t=e.touches[0];
   gesture={x:t.clientX,y:t.clientY,start:performance.now(),axis:null,dx:0};
 },{passive:true});
 surface.addEventListener('touchmove',e=>{
   if(!gesture||e.touches.length!==1)return;
   const t=e.touches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
   if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>10){
     gesture.axis=Math.abs(dx)>Math.abs(dy)*1.18?'horizontal':'vertical';
   }
   if(gesture.axis==='vertical'){gesture=null;clearVisual();return;}
   if(gesture.axis!=='horizontal')return;
   gesture.dx=dx;
   const nextIndex=TAB_ORDER.indexOf(tab)+(dx<0?1:-1);
   const atEnd=nextIndex<0||nextIndex>=TAB_ORDER.length;
   const offset=Math.max(-42,Math.min(42,dx*(atEnd?.10:.36)));
   surface.style.willChange='transform';
   surface.style.transition='none';
   surface.style.transform=`translate3d(${offset}px,0,0)`;
   surface.style.opacity=String(1-Math.min(Math.abs(offset)/500,.08));
 },{passive:true});
 surface.addEventListener('touchcancel',()=>{gesture=null;clearVisual()},{passive:true});
 surface.addEventListener('touchend',e=>{
   const g=gesture;gesture=null;
   if(!g){clearVisual();return;}
   const t=e.changedTouches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
   const horizontal=g.axis==='horizontal'||(Math.abs(dx)>Math.abs(dy)*1.18);
   const valid=horizontal&&Math.abs(dx)>=44&&Math.abs(dx)>Math.abs(dy)*1.18;
   clearVisual();
   if(!valid||document.querySelector('dialog[open]'))return;
   const nextIndex=TAB_ORDER.indexOf(tab)+(dx<0?1:-1);
   if(nextIndex<0||nextIndex>=TAB_ORDER.length)return;
   // A swipe starting on a button must not also activate its click action.
   suppressClickUntil=performance.now()+450;
   activeSection(TAB_ORDER[nextIndex]);
 },{passive:true});
 surface.addEventListener('click',e=>{
   if(performance.now()<suppressClickUntil){
     e.preventDefault();e.stopImmediatePropagation();suppressClickUntil=0;
   }
 },true);
})();

// Refresh the active period after midnight or resuming the installed app.
// Keep historical browsing and unfinished edits intact.
function refreshDateContext(){
 const now=new Date();if(iso(now)===iso(today))return;
 if(budgetEdit||categoryEdit||document.querySelector('dialog[open]')||document.activeElement?.matches('input,select,textarea,[contenteditable]'))return;
 const oldActive=activeBudgetMonth(today),oldCalendar=ym(today),oldDate=iso(today);
 if(month===oldActive)month=activeBudgetMonth(now);
 if(ledgerMonth===oldCalendar)ledgerMonth=ym(now);
 if(selected===oldDate)selected=iso(now);
 today=now;render();
}
window.addEventListener('focus',refreshDateContext);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDateContext()});
setInterval(()=>{if(!document.hidden)refreshDateContext()},30000);
window.addEventListener('beforeunload',e=>{if(budgetEdit){e.preventDefault();e.returnValue='';}});

// Shared news stays separate from personal budget records.
newsInit();
