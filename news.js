'use strict';

// Public news and editor drafts never share the personal budget storage key.
const NEWS_CACHE_KEY='my-budget-shared-news-v1',NEWS_DRAFT_KEY='my-budget-news-draft-v1',NEWS_PREVIEW_KEY='my-budget-news-preview-v1';
const NEWS_UPLOAD_URL='https://github.com/dongbyH/my-budget-app/upload/HEAD';
const emptyNews=()=>({schemaVersion:1,updatedAt:null,featuredIds:[],items:[]});
let newsFeed=emptyNews(),newsDraft=null,newsPasteText='',newsBusy=false,newsError='',newsCheckedAt=0,newsRequest=null,newsDraftDirty=false,newsDraftBase=null,newsPreview=null;
function newsText(value,max=4000){if(typeof value!=='string')throw Error('뉴스의 텍스트 형식을 확인해 주세요.');if(value.length>max)throw Error('뉴스 내용이 너무 깁니다. 내용을 나누어 등록해 주세요.');return value.trim()}
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
  return {id,title,summary,category:item.category?newsText(item.category,40):'주식',publishedAt,highlights:newsList(item.highlights),relatedStocks:newsList(item.relatedStocks),watchPoints:newsList(item.watchPoints),sourceUrl:newsURL(item.sourceUrl),isExample:item.isExample===true};
 });
 let featuredIds=value.featuredIds===undefined?(items.length?[items[0].id]:[]):value.featuredIds;
 if(!Array.isArray(featuredIds)||featuredIds.length>3||featuredIds.some(x=>typeof x!=='string'||!used.has(x))||new Set(featuredIds).size!==featuredIds.length)throw Error('메인 뉴스는 등록된 뉴스 중 서로 다른 1~3개를 선택해 주세요.');
 if(requireFeatured&&items.length&&!featuredIds.length)throw Error('메인 뉴스를 최소 1개 선택해 주세요.');
 return {schemaVersion:1,updatedAt,featuredIds:[...featuredIds],items};
}
try{const stored=localStorage.getItem(NEWS_CACHE_KEY);if(stored)newsFeed=normalizeNews(JSON.parse(stored))}catch{}
try{const stored=JSON.parse(localStorage.getItem(NEWS_DRAFT_KEY)||'null');if(stored){newsDraft=normalizeNews(stored.feed,{requireFeatured:false});newsPasteText=typeof stored.paste==='string'?stored.paste:'';newsDraftDirty=typeof stored.dirty==='boolean'?stored.dirty:Boolean(newsDraft.items.length||newsPasteText.trim());newsDraftBase=typeof stored.base==='string'?stored.base:null}}catch{}
try{const stored=JSON.parse(localStorage.getItem(NEWS_PREVIEW_KEY)||'null');if(stored&&typeof stored.base==='string')newsPreview={feed:normalizeNews(stored.feed),base:stored.base}}catch{}
function newsSignature(feed){return JSON.stringify(feed)}
function activeNewsFeed(){return newsPreview?newsPreview.feed:newsFeed}
function clearNewsPreview(){newsPreview=null;try{localStorage.removeItem(NEWS_PREVIEW_KEY)}catch{}refreshNewsViews()}
function sortedNews(feed=activeNewsFeed()){return [...feed.items].sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0))}
function featuredNews(feed=activeNewsFeed()){return feed.featuredIds.map(id=>feed.items.find(x=>x.id===id)).filter(Boolean)}
function newsTime(date){if(!date)return '날짜 미지정';const d=new Date(date);return new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',...(date.length>10?{hour:'numeric',minute:'2-digit'}:{}),timeZone:'Asia/Seoul'}).format(d)}
function newsDay(date){if(!date)return '날짜 미지정';return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Seoul'}).format(new Date(date))}
function newsStatus(){if(newsPreview)return '내 기기 미리보기 · 다른 이용자 반영 전';return newsBusy?'뉴스를 불러오고 있습니다…':newsError?newsError:newsFeed.updatedAt?newsTime(newsFeed.updatedAt)+' 업데이트':'공유 뉴스'}
function newsRow(item,{main=false,large=false,preview=false}={}){
 const content=`<div class="news-meta"><span class="news-tag">${esc(item.category)}</span>${main?'<span class="news-main-badge">메인</span>':''}${item.isExample?'<span class="news-example-badge">예시</span>':''}<time>${esc(newsTime(item.publishedAt))}</time></div><h3>${esc(item.title)}</h3><p class="news-excerpt">${esc(item.summary)}</p>${large?'<span class="news-read-more">자세히 보기 ›</span>':''}`;
 return preview?`<article class="news-story ${large?'news-story-large':''}">${content}</article>`:`<button type="button" class="news-story ${large?'news-story-large':''}" data-news-open="${esc(item.id)}">${content}${!large?'<span class="news-chevron" aria-hidden="true">›</span>':''}</button>`;
}
function homeNews(){const list=featuredNews();return `<section id="homeNews" class="toss-card news-panel"><div class="panel-head"><h3>메인 뉴스</h3><button class="text-link" type="button" data-news-tab>전체 뉴스 보기 ›</button></div><p class="news-status muted" role="status">${esc(newsStatus())}</p>${newsPreview?'<button type="button" class="text-link" data-news-public>게시본으로 돌아가기</button>':''}${list.length?list.map(item=>newsRow(item,{main:true,large:list.length===1})).join(''):'<div class="news-empty muted">아직 등록된 뉴스가 없습니다.<br>공유 뉴스가 등록되면 여기에 표시됩니다.</div>'}</section>`}
function news(){const feed=activeNewsFeed();let previous='';const rows=sortedNews().map(item=>{const day=newsDay(item.publishedAt),heading=day!==previous?`<h3 class="news-day">${esc(day)}</h3>`:'';previous=day;return heading+newsRow(item,{main:feed.featuredIds.includes(item.id)})}).join('');return `<div class="screen-layout news-screen"><div class="news-heading"><div><h2>뉴스</h2><p class="muted">오늘의 소식을 한눈에 확인하세요.</p></div><button type="button" class="outline mini" data-news-refresh ${newsBusy?'disabled':''}>새로고침</button></div>${newsPreview?'<button type="button" class="outline mini" data-news-public>게시본으로 돌아가기</button>':''}<div class="news-list-status"><span class="news-status muted" role="status">${esc(newsStatus())}</span><b>전체 ${feed.items.length}건</b></div>${rows||'<section class="toss-card news-empty">아직 등록된 뉴스가 없습니다.<p class="muted">공유 뉴스가 등록되면 모든 이용자에게 같은 내용이 표시됩니다.</p></section>'}</div>`}
function wireNews(){
 document.querySelectorAll('[data-news-open]').forEach(b=>b.onclick=()=>openNewsDetail(b.dataset.newsOpen));
 document.querySelectorAll('[data-news-public]').forEach(b=>b.onclick=clearNewsPreview);
 document.querySelectorAll('[data-news-tab]').forEach(b=>b.onclick=()=>activeSection('news'));
 document.querySelectorAll('[data-news-refresh]').forEach(b=>b.onclick=()=>loadSharedNews());
}
function refreshNewsViews(){if(tab==='home'&&$('homeNews')){$('homeNews').outerHTML=homeNews();wireNews()}else if(tab==='news'){render()}else if(tab==='newsAdmin'){if(!newsDraftDirty&&!document.querySelector('dialog[open]'))render();else if($('newsDraftSyncStatus')){$('newsDraftSyncStatus').outerHTML=newsDraftStatus();wireNewsAdmin()}}}
function loadSharedNews(){
 if(newsRequest)return newsRequest;
 newsBusy=true;newsError='';refreshNewsViews();
 newsRequest=(async()=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('./news.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('뉴스 요청 실패');const text=await response.text();if(new TextEncoder().encode(text).length>1000000)throw Error('뉴스 파일 크기 초과');
   const feed=normalizeNews(JSON.parse(text.replace(/^\uFEFF/,'')));newsFeed=feed;const signature=newsSignature(feed);if(newsPreview&&(signature===newsSignature(newsPreview.feed)||signature!==newsPreview.base)){newsPreview=null;try{localStorage.removeItem(NEWS_PREVIEW_KEY)}catch{}}synchronizeNewsDraft();
   try{localStorage.setItem(NEWS_CACHE_KEY,JSON.stringify(feed))}catch{}
  }catch{newsError=newsFeed.items.length?'연결을 확인해 주세요. 저장된 뉴스를 표시합니다.':'뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'}
  finally{clearTimeout(timeout);newsBusy=false;newsCheckedAt=Date.now();newsRequest=null;refreshNewsViews()}
 })();return newsRequest;
}
function newsInit(){loadSharedNews();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-newsCheckedAt>60000)loadSharedNews()});window.addEventListener('focus',()=>{if(Date.now()-newsCheckedAt>60000)loadSharedNews()});setInterval(()=>{if(!document.hidden)loadSharedNews()},300000)}
function openNewsDetail(id,fromDraft=false){
 const item=(fromDraft?newsDraft:activeNewsFeed()).items.find(x=>x.id===id);if(!item)return;
 const list=(title,values)=>values.length?`<section class="news-detail-card"><h3>${title}</h3><ul>${values.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:'';
 const dialog=$('txDialog');dialog.innerHTML=`<div class="news-detail"><div class="news-heading"><h2>뉴스 상세</h2><button type="button" class="text-link" id="closeNewsTop" aria-label="뉴스 상세 닫기">✕</button></div><div class="news-meta"><span class="news-tag">${esc(item.category)}</span>${item.isExample?'<span class="news-example-badge">예시 뉴스</span>':''}<time>${esc(newsTime(item.publishedAt))}</time></div><h2 class="news-detail-title">${esc(item.title)}</h2><section class="news-summary"><h3>핵심 요약</h3><p>${esc(item.summary)}</p></section>${list('주요 내용',item.highlights)}${item.relatedStocks.length?`<section class="news-detail-card"><h3>관련 종목·분야</h3><div class="news-chips">${item.relatedStocks.map(x=>`<span class="news-tag">${esc(x)}</span>`).join('')}</div></section>`:''}${list('확인할 사항',item.watchPoints)}<div class="btnRow ${item.sourceUrl?'':'single-action'}">${item.sourceUrl?`<a class="primary news-source" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 보기</a>`:''}<button type="button" class="${item.sourceUrl?'outline':'primary'}" id="closeNewsDetail">닫기</button></div></div>`;
 $('closeNewsDetail').onclick=$('closeNewsTop').onclick=()=>dialog.close();dialog.showModal();
}
function synchronizeNewsDraft(){
 if(!newsDraft)return;
 const signature=newsSignature(newsFeed);
 if(newsSignature(newsDraft)===signature){newsDraftDirty=false;newsDraftBase=signature;saveNewsDraft({edited:false});return;}
 if(!newsDraftDirty){newsDraft=JSON.parse(JSON.stringify(newsFeed));newsDraftBase=signature;saveNewsDraft({edited:false});}
}
function ensureNewsDraft(){if(!newsDraft){newsDraft=JSON.parse(JSON.stringify(newsFeed));newsDraftBase=newsSignature(newsFeed);newsDraftDirty=false;}synchronizeNewsDraft()}
function saveNewsDraft({edited=true}={}){if(edited)newsDraftDirty=true;try{localStorage.setItem(NEWS_DRAFT_KEY,JSON.stringify({feed:newsDraft,paste:newsPasteText,dirty:newsDraftDirty,base:newsDraftBase}))}catch{appAlert('뉴스 초안을 기기에 저장하지 못했습니다. 뉴스 파일로 저장해 두세요.')}}
function newsDraftStatus(){const changed=newsDraftDirty&&newsDraftBase!==newsSignature(newsFeed);return `<div class="notice" id="newsDraftSyncStatus"><b>${newsBusy?'게시된 뉴스를 확인하고 있습니다…':changed?'게시본과 초안이 다릅니다. 편집 내용을 보존하고 있습니다.':newsDraftDirty?'기기에 저장된 변경 내용이 있습니다.':'최신 게시본에서 편집 중입니다.'}</b><div class="muted">게시본 ${newsFeed.items.length}건 · 초안 ${newsDraft.items.length}건</div><div class="gap space"><button type="button" class="outline mini" id="newsManageRefresh">게시본 새로고침</button><button type="button" class="outline mini" id="newsLoadPublished">게시된 뉴스로 다시 불러오기</button></div></div>`}

function newsAdmin(){
 ensureNewsDraft();const selected=featuredNews(newsDraft);
 return `<div class="screen-layout news-admin-screen"><div><button type="button" class="outline mini" data-move="settings">‹ 설정</button></div><div class="news-heading"><div><h2>공유 뉴스 관리</h2><p class="muted">홈 메인 뉴스 1~3개를 선택하세요.</p></div><span class="news-tag">운영자용</span></div><div class="notice">선택·삭제한 뒤 아래의 <b>내 앱 적용·공유 파일 저장</b>을 누르면 내 기기에 먼저 반영됩니다. <b>모두에게 공유하려면 저장된 파일을 GitHub에 올려야 합니다.</b> 게시는 저장소 쓰기 권한이 있는 계정으로 진행합니다.</div>${newsDraftStatus()}<section class="toss-card news-import"><h3>정리된 뉴스 불러오기</h3><p class="muted">ChatGPT에서 정리한 뉴스 JSON을 붙여넣거나 파일로 불러오세요. 텔레그램 원문을 넣어 자동으로 AI 분석하는 기능은 포함되지 않습니다.</p><div class="field"><label for="newsPaste">뉴스 JSON 붙여넣기</label><textarea id="newsPaste" rows="5" placeholder='{"schemaVersion":1,"items":[...]}' spellcheck="false">${esc(newsPasteText)}</textarea></div><button type="button" class="outline" id="newsImportPaste">목록에 추가·갱신</button><div class="field space"><label for="newsImportFile">뉴스 JSON 파일 불러오기</label><input id="newsImportFile" type="file" accept=".json,application/json"></div></section><div class="news-heading"><h3>뉴스 목록 · 메인 ${selected.length}/3개</h3><button type="button" class="outline mini" id="newsAddItem">+ 뉴스 추가</button></div>${sortedNews(newsDraft).map(item=>`<section class="toss-card news-admin-item"><label class="news-feature-choice"><input type="checkbox" data-news-feature="${esc(item.id)}" ${newsDraft.featuredIds.includes(item.id)?'checked':''}><span><span class="news-meta"><span class="news-tag">${esc(item.category)}</span><span>${esc(newsTime(item.publishedAt))}</span>${newsDraft.featuredIds.includes(item.id)?'<span class="news-main-badge">홈 메인 '+(newsDraft.featuredIds.indexOf(item.id)+1)+'</span>':''}</span><b>${esc(item.title)}</b><small>${esc(item.summary)}</small></span></label><div class="news-admin-actions"><button type="button" class="text-link" data-news-preview="${esc(item.id)}">상세 보기</button><button type="button" class="outline mini" data-news-edit="${esc(item.id)}">수정</button><button type="button" class="danger mini" data-news-delete="${esc(item.id)}">삭제</button></div></section>`).join('')||'<div class="toss-card news-empty muted">등록할 뉴스를 불러오거나 직접 추가해 주세요.</div>'}<section class="toss-card"><h3>홈 미리보기</h3>${selected.length?selected.map(item=>newsRow(item,{main:true,large:selected.length===1,preview:true})).join(''):'<p class="muted">뉴스가 있다면 메인을 최소 1개 선택해 주세요.</p>'}</section><div class="btnRow"><button type="button" class="primary" id="newsExport">내 앱 적용·공유 파일 저장</button><button type="button" class="outline" data-move="settings">닫기</button></div><a class="outline news-upload-link" href="${NEWS_UPLOAD_URL}" target="_blank" rel="noopener noreferrer">GitHub 업로드 화면 열기 ↗</a><p class="muted">초안은 이 기기에 자동 저장됩니다. 적용 후에는 내 기기 미리보기로 표시되며, GitHub 게시가 완료되면 공통 뉴스로 전환됩니다.</p><button type="button" class="text-link" id="newsResetDraft">게시된 뉴스로 초안 초기화</button></div>`;
}
function importNewsDraft(raw){
 const value=typeof raw==='string'?JSON.parse(raw.replace(/^\uFEFF/,'')):raw,feed=normalizeNews(value);
 const items=[...new Map([...newsDraft.items,...feed.items].map(item=>[item.id,item])).values()];
 const featuredIds=Array.isArray(value.featuredIds)?feed.featuredIds:newsDraft.featuredIds.length?newsDraft.featuredIds:feed.featuredIds;
 const next=normalizeNews({...newsDraft,items,featuredIds});newsDraft=next;saveNewsDraft();render();
}
function wireNewsAdmin(){
 $('newsManageRefresh').onclick=async()=>{await loadSharedNews();ensureNewsDraft();render()};
 $('newsLoadPublished').onclick=async()=>{if(newsDraftDirty&&!await appConfirm('현재 초안을 게시된 뉴스로 교체할까요? 저장하지 않은 변경은 사라집니다.'))return;await loadSharedNews();if(newsError)return appAlert('게시된 뉴스를 불러오지 못해 현재 초안을 보존했습니다. 연결을 확인하고 다시 시도해 주세요.');newsDraft=JSON.parse(JSON.stringify(newsFeed));newsDraftBase=newsSignature(newsFeed);newsDraftDirty=false;newsPasteText='';saveNewsDraft({edited:false});render()};
 $('newsPaste').oninput=e=>{newsPasteText=e.target.value;saveNewsDraft()};
 $('newsImportPaste').onclick=()=>{try{importNewsDraft(newsPasteText)}catch(e){appAlert('뉴스를 불러오지 못했습니다. '+(e instanceof SyntaxError?'JSON 형식을 확인해 주세요.':e.message))}};
 $('newsImportFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('1MB 이하의 파일을 선택해 주세요.');importNewsDraft(await file.text())}catch(error){appAlert('뉴스를 불러오지 못했습니다. '+(error instanceof SyntaxError?'JSON 형식을 확인해 주세요.':error.message))}};
 $('newsAddItem').onclick=()=>openNewsEditor();
 document.querySelectorAll('[data-news-feature]').forEach(box=>box.onchange=()=>{
  const id=box.dataset.newsFeature;
  if(box.checked&&newsDraft.featuredIds.length>=3){box.checked=false;return appAlert('메인 뉴스는 최대 3개까지 선택할 수 있습니다. 기존 선택을 하나 해제한 뒤 새 뉴스를 선택해 주세요.')}
  if(!box.checked&&newsDraft.featuredIds.length===1){box.checked=true;return appAlert('메인 뉴스는 최소 1개를 선택해 주세요.')}
  newsDraft.featuredIds=box.checked?[...newsDraft.featuredIds,id]:newsDraft.featuredIds.filter(x=>x!==id);saveNewsDraft();render();
 });
 document.querySelectorAll('[data-news-preview]').forEach(b=>b.onclick=()=>openNewsDetail(b.dataset.newsPreview,true));
 document.querySelectorAll('[data-news-edit]').forEach(b=>b.onclick=()=>openNewsEditor(newsDraft.items.find(x=>x.id===b.dataset.newsEdit)));
 document.querySelectorAll('[data-news-delete]').forEach(b=>b.onclick=async()=>{
  if(!await appConfirm('이 뉴스를 게시용 초안에서 삭제할까요? 마지막 메인 뉴스를 삭제하면 남은 첫 뉴스가 메인으로 선택됩니다.'))return;
  newsDraft.items=newsDraft.items.filter(x=>x.id!==b.dataset.newsDelete);newsDraft.featuredIds=newsDraft.featuredIds.filter(x=>x!==b.dataset.newsDelete);
  if(!newsDraft.featuredIds.length&&newsDraft.items.length)newsDraft.featuredIds=[sortedNews(newsDraft)[0].id];saveNewsDraft();render();
 });
 $('newsResetDraft').onclick=$('newsLoadPublished').onclick;
 $('newsExport').onclick=()=>{
  try{const next=normalizeNews({...newsDraft,updatedAt:new Date().toISOString()}),text=JSON.stringify(next,null,2);if(new TextEncoder().encode(text).length>1000000)throw Error('공유 뉴스 파일은 1MB까지 저장할 수 있습니다. 오래된 뉴스를 정리해 주세요.');newsDraft=next;saveNewsDraft();newsPreview={feed:JSON.parse(JSON.stringify(next)),base:newsSignature(newsFeed)};try{localStorage.setItem(NEWS_PREVIEW_KEY,JSON.stringify(newsPreview))}catch{}download('news.json',text,'application/json');appAlert('내 기기에 메인 뉴스·삭제 내용을 적용하고 news.json 파일을 저장했습니다. 다른 이용자에게 반영하려면 이 파일을 GitHub에 올려 Commit changes를 눌러 주세요.')}catch(e){appAlert(e.message)}
 };
}
function newsLocalDateTime(date){const d=date?new Date(date):new Date();return iso(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function openNewsEditor(item={}){
 const dialog=$('txDialog');dialog.innerHTML=`<form id="newsEditorForm"><div class="title">${item.id?'뉴스 수정':'뉴스 추가'}</div><div class="field"><label>제목</label><input name="title" required maxlength="180" value="${esc(item.title||'')}"></div><div class="field"><label>핵심 요약</label><textarea name="summary" rows="4" required maxlength="4000">${esc(item.summary||'')}</textarea></div><div class="split"><div class="field"><label>분류</label><input name="category" maxlength="40" value="${esc(item.category||'주식')}"></div><div class="field"><label>뉴스 날짜</label><input name="publishedAt" type="datetime-local" value="${esc(newsLocalDateTime(item.publishedAt))}"></div></div><div class="field"><label>주요 내용 (줄마다 하나씩)</label><textarea name="highlights" rows="3">${esc((item.highlights||[]).join('\n'))}</textarea></div><div class="field"><label>관련 종목·분야 (줄마다 하나씩)</label><textarea name="relatedStocks" rows="2">${esc((item.relatedStocks||[]).join('\n'))}</textarea></div><div class="field"><label>확인할 사항 (줄마다 하나씩)</label><textarea name="watchPoints" rows="3">${esc((item.watchPoints||[]).join('\n'))}</textarea></div><div class="field"><label>원문 링크 (선택)</label><input name="sourceUrl" type="url" value="${esc(item.sourceUrl||'')}"></div><div class="btnRow"><button type="submit" class="primary">초안에 저장</button><button type="button" class="outline" id="cancelNewsEditor">취소</button></div></form>`;
 $('cancelNewsEditor').onclick=()=>dialog.close();
 $('newsEditorForm').onsubmit=e=>{
  e.preventDefault();const form=new FormData(e.target),lines=name=>String(form.get(name)||'').split('\n').map(x=>x.trim()).filter(Boolean);
  try{
   const entry={...item,id:item.id||id(),title:String(form.get('title')||''),summary:String(form.get('summary')||''),category:String(form.get('category')||'주식'),publishedAt:form.get('publishedAt')?new Date(String(form.get('publishedAt'))).toISOString():'',highlights:lines('highlights'),relatedStocks:lines('relatedStocks'),watchPoints:lines('watchPoints'),sourceUrl:String(form.get('sourceUrl')||'')};
   const items=item.id?newsDraft.items.map(x=>x.id===item.id?entry:x):[entry,...newsDraft.items];
   newsDraft=normalizeNews({...newsDraft,items,featuredIds:newsDraft.featuredIds.length?newsDraft.featuredIds:[entry.id]});saveNewsDraft();dialog.close();render();
  }catch(error){appAlert(error.message)}
 };dialog.showModal();
}
