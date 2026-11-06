'use strict';
// Official hosted widgets. The strip moves only through the user's input.
const MARKET_ASSETS=Object.freeze([
 {name:'S&P500',symbol:'SP:SPX',url:'https://www.tradingview.com/symbols/SPX/'},
 {name:'나스닥100',symbol:'NASDAQ:NDX',url:'https://www.tradingview.com/symbols/NASDAQ-NDX/'},
 {name:'코스피',symbol:'INDEX:KSIC',url:'https://www.tradingview.com/symbols/KRX-KOSPI/'},
 {name:'원·달러',symbol:'FX_IDC:USDKRW',url:'https://www.tradingview.com/symbols/USDKRW/'}
]);
let marketScrollPosition=0,marketCleanup=()=>{};
function disposeMarket(){marketCleanup();marketCleanup=()=>{}}
function marketPanel(){return `<section class="market-panel" aria-label="주요 지수와 환율"><div class="panel-head"><h3>지수 · 환율</h3><span class="market-provider muted">시세 제공 TradingView</span></div><div class="market-viewport" tabindex="0" role="region" aria-label="지수와 환율 목록. 손으로 좌우로 밀거나 방향키로 이동하세요."><div class="market-track">${MARKET_ASSETS.map((a,i)=>`<article class="market-quote-card" aria-label="${a.name}"><a class="market-quote-title" href="${a.url}" target="_blank" rel="noopener noreferrer">${a.name}</a>${i===3?'<span class="market-unit">1달러당 원화</span>':''}<div class="market-widget" data-market-widget="${i}"><p class="muted market-loading">시세 불러오는 중…</p></div></article>`).join('')}</div></div><p class="market-note muted">제공처 기준 자동 갱신 · 지연 시세일 수 있습니다.</p><p class="market-offline muted" hidden>오프라인에서는 시세를 불러올 수 없습니다.</p></section>`}
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
  const wrap=document.createElement('div');wrap.className='tradingview-widget-container';
  wrap.innerHTML=`<div class="tradingview-widget-container__widget"><p class="muted market-loading">시세 불러오는 중…</p></div><div class="tradingview-widget-copyright"><a href="${MARKET_ASSETS[i].url}" rel="noopener nofollow" target="_blank"><span class="blue-text">${MARKET_ASSETS[i].name}</span></a><span class="trademark"> by TradingView</span></div>`;
  const fail=()=>{if(target.isConnected&&!target.querySelector('iframe'))target.innerHTML='<p class="muted market-unavailable">시세 연결을 확인해 주세요.</p><a class="text-link market-fallback" href="'+MARKET_ASSETS[i].url+'" target="_blank" rel="noopener noreferrer">상세 시세 ↗</a>'};
  const observer=new MutationObserver(()=>{const frame=target.querySelector('iframe');if(frame){frame.title=MARKET_ASSETS[i].name+' 시세';frame.tabIndex=-1;}});observer.observe(target,{childList:true,subtree:true});observers.push(observer);
  const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';script.async=true;
  script.textContent=JSON.stringify({symbol:MARKET_ASSETS[i].symbol,width:'100%',isTransparent:true,colorTheme:'light',locale:'kr'});script.onerror=fail;
  target.replaceChildren(wrap);wrap.append(script);timers.push(setTimeout(fail,20000));
 });
 marketCleanup=()=>{marketScrollPosition=viewport.scrollLeft;timers.forEach(clearTimeout);observers.forEach(o=>o.disconnect());window.removeEventListener('online',offline);window.removeEventListener('offline',offline)};
}
