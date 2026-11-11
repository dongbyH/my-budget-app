'use strict';

const SHOPPING_UNITS = {
  g: {group: 'weight', size: 1, base: 100, label: '100g'},
  kg: {group: 'weight', size: 1000, base: 100, label: '100g'},
  mL: {group: 'volume', size: 1, base: 100, label: '100mL'},
  L: {group: 'volume', size: 1000, base: 100, label: '100mL'},
  개: {group: 'count', size: 1, base: 1, label: '1개'}
};
const shoppingQuantity = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 3});
let shoppingView = 'list';
let shoppingEditor = '';
let shoppingHistoryKey = '';
let shoppingUndo = null;
let shoppingUndoTimer;

function shoppingData() {
  const items = Array.isArray(db.shopping?.items) ? db.shopping.items : [];
  const prices = Array.isArray(db.shopping?.prices) ? db.shopping.prices : [];
  const validEntry = entry => typeof entry?.id === 'string' && typeof entry.name === 'string';
  return {items: items.filter(validEntry), prices: prices.filter(validEntry)};

}

function shoppingName(name) {
  return String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function shoppingKey(name) {
  return shoppingName(name).toLocaleLowerCase('ko-KR');
}

function shoppingPrices(key) {
  return shoppingData().prices.filter(price =>
    shoppingKey(price.name) === key && Object.prototype.hasOwnProperty.call(SHOPPING_UNITS, price.unit)
      && Number.isFinite(price.quantity) && price.quantity > 0
      && Number.isSafeInteger(price.amount) && price.amount > 0
  ).sort((a, b) => b.createdAt - a.createdAt);
}

function shoppingUnitPrice(price) {
  const unit = SHOPPING_UNITS[price.unit];
  return price.amount / (price.quantity * unit.size) * unit.base;
}

function shoppingUnitLabel(price) {
  return SHOPPING_UNITS[price.unit].label + '당 ' + won(shoppingUnitPrice(price));
}

function shoppingPurchaseLabel(price) {
  return shoppingQuantity.format(price.quantity) + price.unit + ' · ' + won(price.amount);
}

function shoppingPriceForm(item, previous) {
  return `<form class="shopping-price-form" data-shopping-price-form="${esc(item.id)}">
    <div class="shopping-fields">
      <label>구매량<input name="quantity" type="number" inputmode="decimal" min="0.001" max="1000000" step="0.001" placeholder="1" required></label>
      <label>단위<select name="unit">${Object.keys(SHOPPING_UNITS).map(unit => `<option ${unit === (previous?.unit || '개') ? 'selected' : ''}>${unit}</option>`).join('')}</select></label>
      <label>결제 금액 (원)<input name="amount" type="number" inputmode="numeric" min="1" max="10000000000" step="1" placeholder="10,000" required></label>
    </div>
    <output class="shopping-unit-preview" aria-live="polite">구매량과 금액을 넣으면 단가를 보여드려요.</output>
    <div class="shopping-actions"><button class="primary" type="submit">저장하고 완료</button><button class="outline" type="button" data-shopping-cancel="${esc(item.id)}">취소</button></div>
  </form>`;
}

function shoppingList() {
  const {items} = shoppingData();
  return `<form id="shoppingAdd" class="shopping-add card">
    <input name="name" aria-label="살 물건" placeholder="살 물건 추가" maxlength="60" autocomplete="off" required>
    <button class="primary" type="submit">추가</button>
  </form>
  <div class="shopping-list">${items.length ? items.map(item => {
    const previous = shoppingPrices(shoppingKey(item.name))[0];
    return `<article class="card shopping-item">
      <div class="shopping-item-top">
        <div><h3>${esc(item.name)}</h3>${previous ? `<p class="muted shopping-last">지난번 ${shoppingPurchaseLabel(previous)}<br>${shoppingUnitLabel(previous)}</p><button class="text-link" type="button" data-shopping-history="${esc(shoppingKey(item.name))}">가격 기록 보기 ›</button>` : ''}</div>
        <div class="shopping-actions"><button class="outline" type="button" data-shopping-done="${esc(item.id)}">구매 완료</button><button class="secondary" type="button" data-shopping-edit="${esc(item.id)}" aria-expanded="${shoppingEditor === item.id}">가격 기록</button></div>
      </div>
      ${shoppingEditor === item.id ? shoppingPriceForm(item, previous) : ''}
    </article>`;
  }).join('') : '<div class="card empty">살 물건을 추가해 보세요.</div>'}</div>`;
}

function shoppingHistory() {
  const {prices} = shoppingData();
  if (!shoppingHistoryKey) {
    const names = new Set(prices.map(price => shoppingKey(price.name)).filter(Boolean));
    const recent = [...names].map(key => shoppingPrices(key)[0]).filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt);
    return `<div class="shopping-list">${recent.length ? recent.map(price => `<button class="card shopping-history-item" type="button" data-shopping-history="${esc(shoppingKey(price.name))}"><span><b>${esc(price.name)}</b><small>지난번 ${shoppingPurchaseLabel(price)} · ${shoppingUnitLabel(price)}</small></span><span aria-hidden="true">›</span></button>`).join('') : '<div class="card empty">장보기에서 가격을 기록하면 여기에 모여요.</div>'}</div>`;
  }
  const records = shoppingPrices(shoppingHistoryKey);
  if (!records.length) {
    shoppingHistoryKey = '';
    return shoppingHistory();
  }
  const latest = records[0];
  const lowestByGroup = new Map();
  for (const price of records) {
    const group = SHOPPING_UNITS[price.unit].group;
    const lowest = lowestByGroup.get(group);
    if (!lowest || shoppingUnitPrice(price) < shoppingUnitPrice(lowest)) lowestByGroup.set(group, price);
  }
  return `<button class="text-link" type="button" data-shopping-history="">‹ 전체 가격 기록</button>
    <section class="card shopping-history-summary">
      <h3>${esc(latest.name)}</h3>
      <p>최근 구매 <b>${shoppingPurchaseLabel(latest)}</b> · ${shoppingUnitLabel(latest)}</p>
      ${[...lowestByGroup.values()].map(price => `<p>최저 단가 <b>${shoppingUnitLabel(price)}</b></p>`).join('')}
    </section>
    <div class="shopping-list">${records.map(price => `<div class="card shopping-history-item"><span><b>${shoppingPurchaseLabel(price)}</b><small>${esc(price.date)} · ${shoppingUnitLabel(price)}</small></span><button class="text-link shopping-remove" type="button" data-shopping-remove-price="${esc(price.id)}" aria-label="${esc(price.date)} 가격 기록 삭제">삭제</button></div>`).join('')}</div>`;
}

function shopping() {
  return `<section class="page-shell shopping-page">
    <div class="page-head page-top"><h2>장보기</h2></div>
    <div class="shopping-switch" role="group" aria-label="장보기 메뉴">
      <button type="button" data-shopping-view="list" aria-pressed="${shoppingView === 'list'}">살 목록</button>
      <button type="button" data-shopping-view="history" aria-pressed="${shoppingView === 'history'}">가격 기록</button>
    </div>
    <div id="shoppingUndo" role="status" ${shoppingUndo ? '' : 'hidden'}>${shoppingUndo ? `<span>${esc(shoppingUndo.item.name)} 구매 완료</span><button class="text-link" type="button" id="shoppingUndoButton">되돌리기</button>` : ''}</div>
    ${shoppingView === 'list' ? shoppingList() : shoppingHistory()}
  </section>`;
}

function saveShopping(next) {
  const previous = db.shopping;
  db.shopping = next;
  if (persist()) return true;
  db.shopping = previous;
  return false;
}

function completeShoppingItem(itemId, price) {
  const current = shoppingData();
  const position = current.items.findIndex(item => item.id === itemId);
  if (position < 0) return;
  const item = current.items[position];
  const previousUndo = shoppingUndo;
  const previousEditor = shoppingEditor;
  shoppingUndo = {item, position, priceId: price?.id};
  shoppingEditor = '';
  if (!saveShopping({
    items: current.items.filter(entry => entry.id !== itemId),
    prices: price ? [...current.prices, price] : current.prices
  })) {
    shoppingUndo = previousUndo;
    shoppingEditor = previousEditor;
    return;
  }
  clearTimeout(shoppingUndoTimer);
  shoppingUndoTimer = setTimeout(() => {
    shoppingUndo = null;
    const notice = document.getElementById('shoppingUndo');
    if (notice) {
      notice.hidden = true;
      notice.replaceChildren();
    }
  }, 6500);
}

function undoShoppingItem() {
  if (!shoppingUndo) return;
  const action = shoppingUndo;
  const current = shoppingData();
  const items = [...current.items];
  if (!items.some(item => shoppingKey(item.name) === shoppingKey(action.item.name))) {
    items.splice(action.position, 0, action.item);
  }
  shoppingUndo = null;
  if (!saveShopping({items, prices: current.prices.filter(price => price.id !== action.priceId)})) {
    shoppingUndo = action;
    return;
  }
  clearTimeout(shoppingUndoTimer);
}

function shoppingFormValues(form) {
  const quantity = form.elements.quantity.valueAsNumber;
  const amount = form.elements.amount.valueAsNumber;
  const unit = form.elements.unit.value;
  if (!Object.prototype.hasOwnProperty.call(SHOPPING_UNITS, unit) || !Number.isFinite(quantity)
      || quantity < .001 || quantity > 1000000 || !Number.isSafeInteger(amount)
      || amount < 1 || amount > 10000000000) return null;
  return {quantity, amount, unit};
}

function wireShopping() {
  const page = document.querySelector('.shopping-page');
  for (const button of page.querySelectorAll('[data-shopping-view]')) {
    button.onclick = () => {
      shoppingView = button.dataset.shoppingView;
      shoppingHistoryKey = '';
      shoppingEditor = '';
      render();
    };
  }
  for (const button of page.querySelectorAll('[data-shopping-history]')) {
    button.onclick = () => {
      shoppingView = 'history';
      shoppingHistoryKey = button.dataset.shoppingHistory;
      shoppingEditor = '';
      render();
    };
  }
  for (const button of page.querySelectorAll('[data-shopping-done]')) {
    button.onclick = () => completeShoppingItem(button.dataset.shoppingDone);
  }
  for (const button of page.querySelectorAll('[data-shopping-edit], [data-shopping-cancel]')) {
    button.onclick = () => {
      const itemId = button.dataset.shoppingEdit || button.dataset.shoppingCancel;
      shoppingEditor = shoppingEditor === itemId ? '' : itemId;
      render();
      if (shoppingEditor) {
        document.querySelector('.shopping-price-form input')?.focus();
      } else {
        [...document.querySelectorAll('[data-shopping-edit]')]
          .find(control => control.dataset.shoppingEdit === itemId)?.focus({preventScroll: true});
      }
    };
  }
  for (const button of page.querySelectorAll('[data-shopping-remove-price]')) {
    button.onclick = async () => {
      if (!await appConfirm('이 가격 기록을 삭제할까요?')) return;
      const current = shoppingData();
      saveShopping({...current, prices: current.prices.filter(price => price.id !== button.dataset.shoppingRemovePrice)});
    };
  }
  const undo = document.getElementById('shoppingUndoButton');
  if (undo) undo.onclick = undoShoppingItem;

  const add = document.getElementById('shoppingAdd');
  if (add) add.onsubmit = event => {
    event.preventDefault();
    const name = shoppingName(add.elements.name.value);
    if (!name || name.length > 60) return;
    const current = shoppingData();
    if (current.items.some(item => shoppingKey(item.name) === shoppingKey(name))) {
      appAlert('이미 살 목록에 있는 물건이에요.');
      return;
    }
    if (saveShopping({...current, items: [...current.items, {id: id(), name}]})) {
      document.querySelector('#shoppingAdd input')?.focus({preventScroll: true});
    }
  };

  const form = page.querySelector('[data-shopping-price-form]');
  if (!form) return;
  form.oninput = () => {
    const price = shoppingFormValues(form);
    form.querySelector('output').textContent = price ? shoppingUnitLabel(price) : '구매량과 금액을 넣으면 단가를 보여드려요.';
  };
  form.onsubmit = event => {
    event.preventDefault();
    const price = shoppingFormValues(form);
    const item = shoppingData().items.find(entry => entry.id === form.dataset.shoppingPriceForm);
    if (!price || !item || !form.checkValidity()) return;
    const now = new Date();
    completeShoppingItem(item.id, {...price, id: id(), name: item.name, date: iso(now), createdAt: now.getTime()});
  };
}
