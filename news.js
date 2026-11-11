'use strict';

// Read-only public news. Personal finance data and news stay separate.
const NEWS_CACHE_KEY='my-budget-shared-news-v1';
const emptyNews=()=>({schemaVersion:1,updatedAt:null,featuredIds:[],items:[]});
let newsFeed=emptyNews(),newsBusy=false,newsError='',newsCheckedAt=0,newsRequest=null;
function newsText(value,max=4000){if(typeof value!=='string')throw Error('뉴스의 텍스트 형식을 확인해 주세요.');if(value.length>max)throw Error('뉴스 내용이 너무 깁니다. 내용을 나누어 등록해 주세요.');return value.trim()}
function newsOriginal(value){if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>200000)throw Error('등록 원문은 20만 자 이하의 텍스트여야 합니다.');return value}
function newsList(value){if(value===undefined)return [];if(!Array.isArray(value)||value.length>20)throw Error('주요 내용·관련 종목·확인할 사항은 각각 20개 이하의 목록이어야 합니다.');return value.map(x=>newsText(x,500)).filter(Boolean)}
function newsURL(value){if(!value)return '';let url;try{url=new URL(newsText(value,2000))}catch{throw Error('원문 링크를 https://로 시작하는 전체 주소로 입력해 주세요.')}if(!['http:','https:'].includes(url.protocol))throw Error('원문 링크는 http 또는 https 주소를 사용해 주세요.');return url.href}
function newsDate(value){if(value===undefined||value===null||value==='')return '';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==value.slice(0,10))throw Error('뉴스 날짜는 YYYY-MM-DD 또는 시간대가 포함된 ISO 형식으로 입력해 주세요.');return value}
function newsID(title,date){let h=2166136261;for(const c of title+'|'+date){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return 'news-'+(h>>>0).toString(36)}
function normalizeNews(value,{requireFeatured=true}={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.items)||value.items.length>500)throw Error('items 목록이 있는 뉴스 JSON 파일을 넣어 주세요. 뉴스는 최대 500개까지 보관할 수 있습니다.');
 if(value.schemaVersion!==undefined&&value.schemaVersion!==1)throw Error('지원하지 않는 뉴스 파일 버전입니다.');
 const updatedAt=newsDate(value.updatedAt)||null,used=new Set();
 const items=value.items.map((item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error(`${index+1}번째 뉴스를 확인해 주세요.`);
  const title=newsText(item.title,180),summary=newsText(item.summary,4000),publishedAt=newsDate(item.publishedAt);
  if(!title||!summary)throw Error(`${index+1}번째 뉴스의 제목과 요약을 입력해 주세요.`);
  const id=item.id===undefined?newsID(title,publishedAt):newsText(item.id,180);
  if(!id||used.has(id))throw Error('뉴스 ID가 비어 있거나 중복되어 있습니다.');used.add(id);
  return {id,title,summary,category:item.category?newsText(item.category,40):'주식',publishedAt,highlights:newsList(item.highlights),relatedStocks:newsList(item.relatedStocks),watchPoints:newsList(item.watchPoints),sourceUrl:newsURL(item.sourceUrl),originalText:newsOriginal(item.originalText),isExample:item.isExample===true};
 });
 let featuredIds=value.featuredIds===undefined?(items.length?[items[0].id]:[]):value.featuredIds;
 if(!Array.isArray(featuredIds)||featuredIds.length>3||featuredIds.some(x=>typeof x!=='string'||!used.has(x))||new Set(featuredIds).size!==featuredIds.length)throw Error('메인 뉴스는 등록된 뉴스 중 서로 다른 1~3개를 선택해 주세요.');
 if(requireFeatured&&items.length&&!featuredIds.length)throw Error('메인 뉴스를 최소 1개 선택해 주세요.');
 return {schemaVersion:1,updatedAt,featuredIds:[...featuredIds],items};
}
try{const stored=localStorage.getItem(NEWS_CACHE_KEY);if(stored)newsFeed=normalizeNews(JSON.parse(stored))}catch{}
function activeNewsFeed(){return newsFeed}
function sortedNews(feed=activeNewsFeed()){return [...feed.items].sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0))}
function featuredNews(feed=activeNewsFeed()){return feed.featuredIds.map(id=>feed.items.find(x=>x.id===id)).filter(Boolean)}
function newsTime(date){if(!date)return '날짜 미지정';const d=new Date(date);return new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',...(date.length>10?{hour:'numeric',minute:'2-digit'}:{}),timeZone:'Asia/Seoul'}).format(d)}
function newsDay(date){if(!date)return '날짜 미지정';return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Seoul'}).format(new Date(date))}
function newsStatus(){return newsBusy?'뉴스를 불러오고 있습니다…':newsError?newsError:newsFeed.updatedAt?newsTime(newsFeed.updatedAt)+' 업데이트':'공유 뉴스'}
function newsRow(item,{main=false,large=false,preview=false}={}){
 const content=`<div class="news-meta"><span class="news-tag">${esc(item.category)}</span>${main?'<span class="news-main-badge">메인</span>':''}${item.isExample?'<span class="news-example-badge">예시</span>':''}<time>${esc(newsTime(item.publishedAt))}</time></div><h3>${esc(item.title)}</h3><p class="news-excerpt">${esc(item.summary)}</p>${large?'<span class="news-read-more">자세히 보기 ›</span>':''}`;
 return preview?`<article class="news-story ${large?'news-story-large':''}">${content}</article>`:`<button type="button" class="news-story ${large?'news-story-large':''}" data-news-open="${esc(item.id)}">${content}${!large?'<span class="news-chevron" aria-hidden="true">›</span>':''}</button>`;
}
function homeNews(){const list=featuredNews();return `<section id="homeNews" class="toss-card news-panel"><div class="panel-head"><h3>메인 뉴스</h3><button class="text-link" type="button" data-news-tab>전체 뉴스 보기 ›</button></div><p class="news-status muted" role="status">${esc(newsStatus())}</p>${list.length?list.map(item=>newsRow(item,{main:true,large:list.length===1})).join(''):'<div class="news-empty muted">아직 등록된 뉴스가 없습니다.<br>공유 뉴스가 등록되면 여기에 표시됩니다.</div>'}</section>`}
function newsContent() {
 const feed = activeNewsFeed();
 const groups = new Map();
 for (const item of sortedNews()) {
  const day = newsDay(item.publishedAt);
  if (!groups.has(day)) groups.set(day, []);
  groups.get(day).push(newsRow(item, {main: feed.featuredIds.includes(item.id)}));
 }
 const rows = [...groups].map(([day, cards]) =>
  `<h3 class="news-day">${esc(day)}</h3><div class="news-day-stories">${cards.join('')}</div>`
 ).join('');
 return `<div id="newsContent">
  <div class="news-heading"><div><h2>전체 뉴스</h2></div><button type="button" class="outline mini" data-news-refresh ${newsBusy?'disabled':''}>새로고침</button></div>
  <div class="news-list-status"><span class="news-status muted" role="status">${esc(newsStatus())}</span><b>전체 ${feed.items.length}건</b></div>
  ${rows || '<section class="toss-card news-empty">아직 등록된 뉴스가 없습니다.</section>'}
 </div>`;
}
function news(){return `<div class="screen-layout news-screen"><button type="button" class="text-link" data-news-back>‹ 홈으로</button>${marketPanel()}${newsContent()}</div>`}
function wireNews(){
 document.querySelectorAll('[data-news-back]').forEach(b=>b.onclick=()=>activeSection('home'));
 document.querySelectorAll('[data-news-open]').forEach(b=>b.onclick=()=>openNewsDetail(b.dataset.newsOpen));
 document.querySelectorAll('[data-news-tab]').forEach(b=>b.onclick=()=>activeSection('news'));
 document.querySelectorAll('[data-news-refresh]').forEach(b=>b.onclick=()=>loadSharedNews());
}
function refreshNewsViews(){if(tab==='home'&&$('homeNews')){$('homeNews').outerHTML=homeNews();wireNews()}else if(tab==='news'&&$('newsContent')){$('newsContent').outerHTML=newsContent();wireNews()}}
function loadSharedNews(){
 if(newsRequest)return newsRequest;
 newsBusy=true;newsError='';refreshNewsViews();
 newsRequest=(async()=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('./news.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('뉴스 요청 실패');const text=await response.text();if(new TextEncoder().encode(text).length>3000000)throw Error('뉴스 파일 크기 초과');
   const feed=normalizeNews(JSON.parse(text.replace(/^\uFEFF/,'')));newsFeed=feed;
   try{localStorage.setItem(NEWS_CACHE_KEY,JSON.stringify(feed))}catch{}
  }catch{newsError=newsFeed.items.length?'연결을 확인해 주세요. 저장된 뉴스를 표시합니다.':'뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'}
  finally{clearTimeout(timeout);newsBusy=false;newsCheckedAt=Date.now();newsRequest=null;refreshNewsViews()}
 })();return newsRequest;
}
function newsInit(){loadSharedNews();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-newsCheckedAt>60000)loadSharedNews()});window.addEventListener('focus',()=>{if(Date.now()-newsCheckedAt>60000)loadSharedNews()});setInterval(()=>{if(!document.hidden)loadSharedNews()},300000)}
function openNewsDetail(id){
 const item=newsFeed.items.find(x=>x.id===id);if(!item)return;
 const list=(title,values)=>values.length?`<section class="news-detail-card"><h3>${title}</h3><ul>${values.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:'';
 const hasOriginal=Boolean(item.originalText?.trim()),dialog=$('txDialog');
 dialog.innerHTML=`<div class="news-detail"><div class="news-heading"><h2>뉴스 상세</h2><button type="button" class="text-link" id="closeNewsTop" aria-label="뉴스 상세 닫기">✕</button></div><div class="news-meta"><span class="news-tag">${esc(item.category)}</span><time>${esc(newsTime(item.publishedAt))}</time></div><h2 class="news-detail-title">${esc(item.title)}</h2><section class="news-summary"><h3>핵심 요약</h3><p>${esc(item.summary)}</p></section>${list('주요 내용',item.highlights)}${item.relatedStocks.length?`<section class="news-detail-card"><h3>관련 종목·분야</h3><div class="news-chips">${item.relatedStocks.map(x=>`<span class="news-tag">${esc(x)}</span>`).join('')}</div></section>`:''}${list('확인할 사항',item.watchPoints)}${!hasOriginal?'<p class="muted news-original-missing">등록된 전체 원문이 없습니다.</p>':''}<div class="btnRow ${hasOriginal?'':'single-action'}">${hasOriginal?'<button type="button" class="primary" id="openNewsOriginal">등록 원문 보기</button>':''}<button type="button" class="${hasOriginal?'outline':'primary'}" id="closeNewsDetail">닫기</button></div></div>`;
 if(hasOriginal)$('openNewsOriginal').onclick=()=>openNewsOriginal(id);
 $('closeNewsDetail').onclick=$('closeNewsTop').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
}
function openNewsOriginal(id){
 const item=newsFeed.items.find(x=>x.id===id);if(!item?.originalText?.trim())return;
 const dialog=$('txDialog');dialog.innerHTML=`<div class="news-detail"><div class="news-heading"><h2>등록 원문</h2><button type="button" class="text-link" id="closeOriginalTop" aria-label="등록 원문 닫기">✕</button></div><h3 class="news-detail-title">${esc(item.title)}</h3><p class="muted">등록된 전체 내용입니다.</p><div class="news-original-text">${esc(item.originalText)}</div><div class="btnRow"><button type="button" class="primary" id="backNewsSummary">요약으로 돌아가기</button><button type="button" class="outline" id="closeNewsOriginal">닫기</button></div></div>`;
 $('backNewsSummary').onclick=()=>openNewsDetail(id);$('closeNewsOriginal').onclick=$('closeOriginalTop').onclick=()=>dialog.close();dialog.scrollTop=0;if(!dialog.open)dialog.showModal();
}
