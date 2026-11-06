'use strict';
// Official hosted widgets. The strip moves only through the user's input.
const MARKET_ASSETS=Object.freeze([
 {name:'S&P500',symbol:'SP:SPX',url:'https://vunelix.com/symbols/SP-SPX'},
 {name:'나스닥100',symbol:'NASDAQ:NDX',url:'https://vunelix.com/symbols/NASDAQ-NDX'},
 {name:'코스피',symbol:'KRX:KOSPI',url:'https://vunelix.com/symbols/KRX-KOSPI'},
 {name:'원·달러',symbol:'FX:USDKRW',url:'https://vunelix.com/symbols/FX-USDKRW'}
]);
// Official widget custom CSS: keep each signed change on a single line.
// Price precision, font sizes and quote data stay untouched.
const MARKET_CHANGE_CSS=`
.st-price-change{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;gap:8px!important;min-width:max-content!important;margin-left:0!important}
.st-change{display:inline-flex!important;align-items:baseline!important;flex-wrap:nowrap!important;white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important;flex-shrink:0!important}
.st-change .sign{display:inline!important;flex:0 0 auto!important;width:auto!important;white-space:nowrap!important}
`;
let marketScrollPosition=0,marketCleanup=()=>{},vunelixModuleRequest=null,marketBrandingFallback=false;
const VUNELIX_MODULE='https://vunelix.com/assets/bundles/js/widgets/ticker/vunelix-single-ticker.js?v=5.5.7';
function loadVunelixModule(){
 if(customElements.get('vunelix-single-ticker'))return Promise.resolve();
 if(vunelixModuleRequest)return vunelixModuleRequest;
 vunelixModuleRequest=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.type='module';script.src=VUNELIX_MODULE;
  const timeout=setTimeout(()=>{script.remove();vunelixModuleRequest=null;reject(Error('시세 연결 시간이 초과되었습니다.'))},15000);
  script.onload=()=>{clearTimeout(timeout);if(customElements.get('vunelix-single-ticker'))resolve();else{script.remove();vunelixModuleRequest=null;reject(Error('시세 위젯을 준비하지 못했습니다.'))}};
  script.onerror=()=>{clearTimeout(timeout);script.remove();vunelixModuleRequest=null;reject(Error('시세 위젯 연결 실패'))};
  document.head.append(script);
 });return vunelixModuleRequest;
}

function disposeMarket(){marketCleanup();marketCleanup=()=>{}}
function marketPanel(){return `<section class="market-panel" aria-label="주요 지수와 환율"><div class="panel-head"><h3>지수 · 환율</h3></div><div class="market-viewport" tabindex="0" role="region" aria-label="지수와 환율 목록. 손으로 좌우로 밀거나 방향키로 이동하세요."><div class="market-track">${MARKET_ASSETS.map((a,i)=>`<article class="market-quote-card" aria-label="${a.name}"><a class="market-quote-title" href="${a.url}" target="_blank" rel="noopener noreferrer">${a.name}</a><div class="market-widget" data-market-widget="${i}"><p class="muted market-loading">시세 불러오는 중…</p></div></article>`).join('')}</div></div><p class="market-offline muted" hidden>오프라인에서는 시세를 불러올 수 없습니다.</p></section>`}
function wireMarket(){
 disposeMarket();const panel=document.querySelector('.market-panel');if(!panel)return;
 const viewport=panel.querySelector('.market-viewport'),targets=[...panel.querySelectorAll('[data-market-widget]')],timers=[],observers=[];
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let drag=null,suppressClickUntil=0;
 viewport.scrollLeft=marketScrollPosition;
 viewport.onscroll=()=>{marketScrollPosition=viewport.scrollLeft};
 viewport.onkeydown=e=>{
  // Keep normal link/keyboard activation intact. Only the strip itself pans.
  if(e.target!==viewport||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();const step=Math.max(120,viewport.clientWidth*.65);
  const left=e.key==='Home'?0:e.key==='End'?viewport.scrollWidth:e.key==='ArrowRight'?viewport.scrollLeft+step:viewport.scrollLeft-step;
  viewport.scrollTo({left,behavior:reduced.matches?'auto':'smooth'});
 };
 // Touch uses native momentum scrolling; mouse users can drag the same strip.
 viewport.onpointerdown=e=>{
  if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('a'))return;
  drag={id:e.pointerId,x:e.clientX,start:viewport.scrollLeft,moved:false};
 };
 viewport.onpointermove=e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;
  if(Math.abs(dx)>6){drag.moved=true;viewport.setPointerCapture?.(e.pointerId);e.preventDefault();viewport.classList.add('is-dragging');viewport.scrollLeft=drag.start-dx;marketScrollPosition=viewport.scrollLeft;}
 };
 const endDrag=()=>{if(drag?.moved)suppressClickUntil=performance.now()+350;drag=null;viewport.classList.remove('is-dragging')};
 viewport.onpointerup=viewport.onpointercancel=viewport.onlostpointercapture=endDrag;
 viewport.addEventListener('click',e=>{if(performance.now()<suppressClickUntil){e.preventDefault();e.stopPropagation()}},true);
 const offline=()=>{panel.querySelector('.market-offline').hidden=navigator.onLine!==false};
 window.addEventListener('online',offline);window.addEventListener('offline',offline);offline();
 targets.forEach((target,i)=>{
  const asset=MARKET_ASSETS[i];target.dataset.provider='vunelix';
  const status=document.createElement('p');status.className='muted market-loading';status.textContent='시세 연결 중…';status.setAttribute('role','status');
  // Use the provider's supported preference. Do not hide/remove its branding DOM.
  // If the provider rejects the option, preserve quotes with its default mode.
  const createQuote=requestRemoval=>{
   const widget=document.createElement('vunelix-single-ticker');
   for(const [key,value] of Object.entries({'data-symbol':asset.symbol,'data-theme':'light','data-show-symbol':'false','data-show-full-name':'false','data-show-flag':'false','data-show-change':'true','data-show-update-time':'false','data-animation-mode':'none','data-custom-css':MARKET_CHANGE_CSS,...(requestRemoval?{'data-remove-branding':'true'}:{})}))widget.setAttribute(key,value);
   widget.setAttribute('aria-label',asset.name+' 지수 시세');return widget;
  };
  const requestRemoval=!marketBrandingFallback,widget=createQuote(requestRemoval);
  target.replaceChildren(status,widget);
  const fail=()=>{if(!target.isConnected)return;status.hidden=false;status.textContent='시세 연결을 확인해 주세요.';status.className='muted market-unavailable';};
  loadVunelixModule().then(()=>{
   if(!target.isConnected)return;status.hidden=true;
   const root=widget.shadowRoot;if(!requestRemoval||!root)return;
   let reverted=false;
   const observer=new MutationObserver(()=>{
    if(reverted||!target.isConnected||!root.querySelector('.widget-error'))return;
    reverted=true;observer.disconnect();marketBrandingFallback=true;
    widget.replaceWith(createQuote(false));
   });
   observer.observe(root,{childList:true,subtree:true});observers.push(observer);
   // Covers a synchronous error rendered before the observer was connected.
   if(root.querySelector('.widget-error')){reverted=true;observer.disconnect();marketBrandingFallback=true;widget.replaceWith(createQuote(false));}
  }).catch(fail);
 });

 marketCleanup=()=>{marketScrollPosition=viewport.scrollLeft;timers.forEach(clearTimeout);observers.forEach(o=>o.disconnect());window.removeEventListener('online',offline);window.removeEventListener('offline',offline)};
}
