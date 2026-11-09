'use strict';

let categoryOpen = false;

function subcategories(category) {
  return Array.isArray(category?.subcategories) ? category.subcategories : [];
}

function transactionSubcategory(record, category = catById(record.categoryId)) {
  return subcategories(category).find(child => child.id === record.subcategoryId);
}

function categoryPath(categoryId, subcategoryId) {
  const category = catById(categoryId);
  if (!category) return '';
  const child = transactionSubcategory({subcategoryId}, category);
  return child ? `${category.name} › ${child.name}` : category.name;
}

function categoryDialog(className, label) {
  const dialog = document.createElement('dialog');
  dialog.className = className;
  dialog.setAttribute('aria-label', label);
  dialog.addEventListener('close', () => dialog.remove(), {once: true});
  document.body.append(dialog);
  return dialog;
}

function categoryField() {
  return `<div class="field">
    <label for="chooseCategory">카테고리</label>
    <button id="chooseCategory" type="button" class="category-field-button">
      <span data-category-path>카테고리를 선택하세요</span><span aria-hidden="true">›</span>
    </button>
    <input type="hidden" name="categoryId"><input type="hidden" name="subcategoryId">
  </div>`;
}

function bindCategoryField(form, getType, record) {
  const parent = form.elements.namedItem('categoryId');
  const child = form.elements.namedItem('subcategoryId');
  const button = form.querySelector('#chooseCategory');
  function set(categoryId = '', subcategoryId = '') {
    parent.value = categoryId;
    child.value = subcategoryId;
    button.querySelector('[data-category-path]').textContent =
      categoryPath(categoryId, subcategoryId) || '카테고리를 선택하세요';
  }
  button.onclick = () => openCategorySelector(getType(), parent.value, child.value, set);
  set(record.categoryId, record.subcategoryId);
  return set;
}

function openCategorySelector(type, initialParent, initialChild, onSelect) {
  const dialog = categoryDialog('category-sheet', '카테고리 선택');
  let parentId = initialParent || '';
  let childId = initialChild || '';
  const allowedParents = () => db.categories.filter(category =>
    category.type === type &&
    ((!category.archived && category.active !== false) || category.id === initialParent)
  );

  function draw() {
    const columns = dialog.querySelectorAll('.category-column-list');
    const scroll = Array.from(columns, column => column.scrollTop);
    const parents = allowedParents();
    const parent = parents.find(category => category.id === parentId);
    const children = subcategories(parent).filter(child =>
      !child.archived || (parentId === initialParent && child.id === initialChild)
    );
    const child = children.find(item => item.id === childId);
    dialog.innerHTML = `
      <div class="category-sheet-grip" aria-hidden="true"></div>
      <div class="category-dialog-head">
        <h2>카테고리 선택</h2>
        <button type="button" data-edit-tree class="text-link">✎ 편집</button>
        <button type="button" data-close class="category-close" aria-label="닫기">×</button>
      </div>
      <div class="category-columns">
        <section class="category-column" aria-label="대분류">
          <h3>대분류</h3>
          <div class="category-column-list">${parents.map(item => `
            <button type="button" data-parent="${esc(item.id)}" aria-pressed="${item === parent}">
              <span class="category-row-icon" aria-hidden="true">${categoryIconMarkup(item)}</span>
              <span>${esc(item.name)}</span><span aria-hidden="true">›</span>
            </button>`).join('') || '<p class="muted">등록된 대분류가 없습니다.</p>'}</div>
        </section>
        <section class="category-column" aria-label="소분류">
          <h3>소분류</h3>
          <div class="category-column-list">${parent ? `
            <button type="button" data-child="" aria-pressed="${!child}">
              <span>대분류만 선택</span>${!child ? '<span aria-hidden="true">✓</span>' : ''}
            </button>
            ${children.map(item => `
              <button type="button" data-child="${esc(item.id)}" aria-pressed="${item === child}">
                <span>${esc(item.name)}</span>${item === child ? '<span aria-hidden="true">✓</span>' : ''}
              </button>`).join('')}`
            : '<p class="muted">대분류를 먼저 선택하세요.</p>'}</div>
        </section>
      </div>
      <p class="category-selection-preview" aria-live="polite">${esc(
        parent ? categoryPath(parent.id, child?.id) : '카테고리를 선택하세요.'
      )}</p>
      <div class="btnRow">
        <button type="button" class="primary" data-apply ${parent ? '' : 'disabled'}>선택</button>
        <button type="button" class="outline" data-close>취소</button>
      </div>`;
    dialog.querySelectorAll('.category-column-list').forEach((column, index) => {
      column.scrollTop = scroll[index] || 0;
    });
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => dialog.close());
    dialog.querySelector('[data-edit-tree]').onclick = () => openCategoryEditor(type, draw, parentId);
    dialog.querySelector('[data-apply]').onclick = () => {
      if (!parent) return;
      onSelect(parent.id, child?.id || '');
      dialog.close();
    };
    dialog.querySelectorAll('[data-parent]').forEach(button => button.onclick = () => {
      if (parentId !== button.dataset.parent) childId = '';
      parentId = button.dataset.parent;
      draw();
      Array.from(dialog.querySelectorAll('[data-parent]'))
        .find(item => item.dataset.parent === parentId)?.focus({preventScroll: true});
    });
    dialog.querySelectorAll('[data-child]').forEach(button => button.onclick = () => {
      childId = button.dataset.child;
      draw();
      dialog.querySelector('[data-child][aria-pressed="true"]')?.focus({preventScroll: true});
    });
  }

  draw();
  dialog.showModal();
}

function categoryEditorRows(rows, {parentRows, selectedId}) {
  return rows.map((entry, index) => {
    const name = esc(entry.name);
    const entryId = esc(entry.id);
    const select = parentRows ? `data-edit-parent="${entryId}" aria-pressed="${entry.id === selectedId}"` : '';
    return `<div class="category-editor-row" data-sort-id="${entryId}">
      <div class="category-editor-row-head">
        ${parentRows
          ? `<button type="button" class="category-editor-name" ${select}>
            <span class="category-row-icon" aria-hidden="true">${categoryIconMarkup(entry)}</span>
            <span>${name}</span><span aria-hidden="true">›</span>
          </button>`
          : `<b class="category-editor-name">${name}</b>`}
        <button type="button" class="category-sort-arrow" data-order="-1" aria-label="${name} 위로 이동" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="category-sort-arrow" data-order="1" aria-label="${name} 아래로 이동" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="category-drag-grip" aria-label="${name} 순서 변경, 위아래 방향키 사용">⠿</button>
      </div>
      <div class="category-editor-tools">
        ${parentRows ? '<button type="button" class="text-link" data-icon>아이콘</button>' : ''}
        <button type="button" class="text-link" data-rename>이름 변경</button>
        <button type="button" class="text-link red" data-archive>삭제</button>
      </div>
    </div>`;
  }).join('');
}

function bindCategoryReorder(list, items, refresh) {
  const active = () => items.filter(item => !item.archived && (!list.dataset.parentType || item.type === list.dataset.parentType));
  function move(sourceId, targetId) {
    if (!targetId || sourceId === targetId) return;
    const from = items.findIndex(item => item.id === sourceId);
    const to = items.findIndex(item => item.id === targetId);
    if (from < 0 || to < 0) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    const dialog = list.closest('dialog');
    refresh();
    Array.from(dialog.querySelectorAll('[data-sort-id]'))
      .find(row => row.dataset.sortId === sourceId)?.querySelector('.category-drag-grip')?.focus({preventScroll: true});
  }
  list.querySelectorAll('[data-sort-id]').forEach(row => {
    const sourceId = row.dataset.sortId;
    function step(direction) {
      const order = active();
      move(sourceId, order[order.findIndex(item => item.id === sourceId) + direction]?.id);
    }
    row.querySelectorAll('[data-order]').forEach(button => button.onclick = () => step(Number(button.dataset.order)));
    const grip = row.querySelector('.category-drag-grip');
    grip.onkeydown = event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      step(event.key === 'ArrowUp' ? -1 : 1);
    };
    let pointerId;
    let target = null;
    function clear() {
      row.classList.remove('category-dragging');
      target?.classList.remove('category-drop-target');
      target = null;
      pointerId = undefined;
    }
    grip.onpointerdown = event => {
      if (event.button !== 0 || pointerId !== undefined) return;
      pointerId = event.pointerId;
      grip.setPointerCapture(event.pointerId);
      row.classList.add('category-dragging');
    };
    grip.onpointermove = event => {
      if (pointerId !== event.pointerId) return;
      target?.classList.remove('category-drop-target');
      const candidate = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-sort-id]');
      target = candidate?.parentElement === list ? candidate : null;
      if (target !== row) target?.classList.add('category-drop-target');
    };
    grip.onpointerup = event => {
      if (pointerId !== event.pointerId) return;
      const targetId = target?.dataset.sortId;
      clear();
      move(sourceId, targetId);
    };
    grip.onpointercancel = clear;
    grip.onlostpointercapture = clear;
  });
}

function chooseCategoryIcon(category, onChange) {
  const dialog = categoryDialog('category-icon-dialog', '카테고리 아이콘 선택');
  dialog.innerHTML = `<div class="icon-picker">
    <div class="picker-head"><h2>${esc(category.name)} 아이콘 선택</h2>
    <button type="button" class="icon-picker-close" data-close aria-label="닫기">×</button></div>
    <div class="icon-choice-grid">${CATEGORY_ICONS.map(([key, label]) => `
      <button type="button" class="icon-choice ${categoryIconFor(category) === key ? 'selected' : ''}" data-icon-choice="${key}">
        <span class="ui-glyph blue">${uiIcon(key)}</span><span>${label}</span>
      </button>`).join('')}</div>
  </div>`;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-icon-choice]').forEach(button => button.onclick = () => {
    category.icon = button.dataset.iconChoice;
    dialog.close();
    onChange();
  });
  dialog.showModal();
}

function openCategoryEditor(initialType = 'expense', onSave = () => {}, initialParent = '') {
  const draft = db.categories.map(category => ({
    ...category,
    subcategories: subcategories(category).map(child => ({...child}))
  }));
  const dialog = categoryDialog('category-editor', '카테고리 편집');
  let type = initialType;
  const selected = {[initialType]: initialParent};
  const parentsFor = selectedType => draft.filter(item => item.type === selectedType && !item.archived);

  async function nameEntry(siblings, entry, parent) {
    const name = (await appPrompt(entry ? '카테고리 이름 변경' : '새 카테고리 이름', entry?.name || ''))?.trim();
    if (!name || !dialog.open) return;
    if (siblings.some(item => !item.archived && item !== entry && item.name === name)) {
      appAlert('같은 이름이 있습니다.');
      return;
    }
    if (entry) entry.name = name;
    else if (parent) parent.subcategories.push({id: id(), name});
    else {
      const category = {id: id(), name, type, active: true, subcategories: []};
      draft.push(category);
      selected[type] = category.id;
    }
    draw();
  }

  async function archive(entry, parent) {
    if (!parent && entry.active !== false && parentsFor(type).filter(item => item.active !== false).length < 2) {
      appAlert('수입과 지출에는 각각 대분류를 최소 한 개 남겨야 합니다.');
      return;
    }
    const used = db.transactions.filter(record =>
      parent ? record.categoryId === parent.id && record.subcategoryId === entry.id : record.categoryId === entry.id
    ).length;
    const note = used ? `\n과거 거래 ${used}건의 분류는 기록과 통계에 남습니다.` : '';
    if (!await appConfirm(`「${entry.name}」 카테고리를 삭제할까요?${note}`) || !dialog.open) return;
    entry.archived = true;
    draw();
  }

  function save() {
    for (const kind of ['income', 'expense']) {
      if (!parentsFor(kind).some(category => category.active !== false)) {
        appAlert('수입과 지출에는 각각 대분류를 최소 한 개 남겨야 합니다.');
        return;
      }
    }
    const recordsByParent = new Map();
    for (const record of db.transactions) {
      if (!recordsByParent.has(record.categoryId)) recordsByParent.set(record.categoryId, new Set());
      recordsByParent.get(record.categoryId).add(record.subcategoryId);
    }
    const categories = draft.filter(category => !category.archived || recordsByParent.has(category.id))
      .map(category => ({
        ...category,
        active: category.archived ? false : category.active,
        subcategories: subcategories(category).filter(child =>
          !child.archived || recordsByParent.get(category.id)?.has(child.id)
        )
      }));
    const available = new Map(categories.filter(category => !category.archived).map(category => [category.id, category]));
    const quickTemplates = db.quickTemplates.filter(entry => available.has(entry.categoryId)).map(entry => {
      const child = transactionSubcategory(entry, available.get(entry.categoryId));
      return entry.subcategoryId && (!child || child.archived) ? {...entry, subcategoryId: ''} : entry;
    });
    const next = {...db, categories, quickTemplates};
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      appAlert('카테고리를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
      return;
    }
    db = next;
    dialog.close();
    render();
    onSave();
  }

  function draw() {
    const scrollTop = dialog.querySelector('.category-editor-body')?.scrollTop || 0;
    const parents = parentsFor(type);
    const parent = parents.find(item => item.id === selected[type]) || parents[0];
    if (parent) selected[type] = parent.id;
    const children = subcategories(parent).filter(item => !item.archived);
    dialog.innerHTML = `
      <div class="category-dialog-head">
        <h2>카테고리 편집</h2>
        <button type="button" data-close class="category-close" aria-label="닫기">×</button>
      </div>
      <div class="category-editor-body">
        <div class="category-type-buttons" aria-label="수입·지출 선택">
          <button type="button" data-tree-type="income" class="${type === 'income' ? 'primary' : 'outline'}" aria-pressed="${type === 'income'}">수입</button>
          <button type="button" data-tree-type="expense" class="${type === 'expense' ? 'primary' : 'outline'}" aria-pressed="${type === 'expense'}">지출</button>
        </div>
        <p class="muted">손잡이를 끌거나 ↑ ↓ 버튼으로 순서를 바꿀 수 있어요.</p>
        <section class="category-editor-card">
          <h3>대분류</h3>
          <div data-parent-type="${type}">${categoryEditorRows(parents, {parentRows: true, selectedId: parent?.id})}</div>
          <button type="button" class="outline" data-add-parent>＋ 대분류 추가</button>
        </section>
        <section class="category-editor-card">
          <h3>${parent ? esc(parent.name) + '의 소분류' : '소분류'}</h3>
          <div data-sub-list>${categoryEditorRows(children, {}) || '<p class="muted">등록된 소분류가 없습니다.</p>'}</div>
          <button type="button" class="outline" data-add-child ${parent ? '' : 'disabled'}>＋ 소분류 추가</button>
        </section>
      </div>
      <div class="btnRow category-editor-actions">
        <button type="button" class="primary" data-save>저장</button>
        <button type="button" class="outline" data-close>취소</button>
      </div>`;
    dialog.querySelector('.category-editor-body').scrollTop = scrollTop;
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => dialog.close());
    dialog.querySelector('[data-save]').onclick = save;
    dialog.querySelectorAll('[data-tree-type]').forEach(button => button.onclick = () => {
      type = button.dataset.treeType;
      draw();
    });
    dialog.querySelectorAll('[data-edit-parent]').forEach(button => button.onclick = () => {
      selected[type] = button.dataset.editParent;
      draw();
    });
    dialog.querySelector('[data-add-parent]').onclick = () => nameEntry(parents);
    dialog.querySelector('[data-add-child]').onclick = () => nameEntry(children, null, parent);
    for (const [list, entries, siblings, owner] of [
      [dialog.querySelector('[data-parent-type]'), draft, parents, null],
      [dialog.querySelector('[data-sub-list]'), subcategories(parent), children, parent]
    ]) {
      bindCategoryReorder(list, entries, draw);
      list.querySelectorAll('[data-sort-id]').forEach(row => {
        const entry = siblings.find(item => item.id === row.dataset.sortId);
        row.querySelector('[data-rename]').onclick = () => nameEntry(siblings, entry, owner);
        row.querySelector('[data-archive]').onclick = () => archive(entry, owner);
        const icon = row.querySelector('[data-icon]');
        if (icon) icon.onclick = () => chooseCategoryIcon(entry, draw);
      });
    }
  }

  draw();
  dialog.showModal();
}

function categorySettingsPanel() {
  const visible = db.categories.filter(category => !category.archived);
  const list = type => visible.filter(category => category.type === type).map(category => {
    const children = subcategories(category).filter(child => !child.archived);
    return `<div class="row item category-admin-row">
      <span class="ui-glyph blue">${categoryIconMarkup(category)}</span>
      <div class="category-admin-main"><b>${esc(category.name)}</b>
      <div class="muted">${children.map(child => esc(child.name)).join(' · ') || '소분류 없음'}</div></div>
    </div>`;
  }).join('');
  return `<section class="card category-panel">
    <div class="section-inline category-header">
      <div><p class="eyebrow">분류 관리</p><h3>카테고리 관리</h3></div>
      <button type="button" class="outline" id="editCategories">편집</button>
    </div>
    <button type="button" class="category-toggle" id="toggleCategories" aria-expanded="${categoryOpen}">
      <span class="category-toggle-copy"><b>카테고리 목록</b>
      <small>지출 ${visible.filter(category => category.type === 'expense').length}개 · 수입 ${visible.filter(category => category.type === 'income').length}개</small></span>
      <span class="accordion-chevron" aria-hidden="true">${categoryOpen ? '⌃' : '⌄'}</span>
    </button>
    ${categoryOpen ? `<div class="category-list-content">
      <div class="category-subheading">지출 대분류</div>${list('expense')}
      <div class="category-subheading">수입 대분류</div>${list('income')}
    </div>` : ''}
  </section>`;
}

function categorySpending(rows) {
  const groups = new Map();
  for (const category of db.categories) {
    if (category.type === 'expense' && !category.archived && category.active !== false) {
      groups.set('id:' + category.id, {name: category.name, total: 0, category, amounts: new Map()});
    }
  }
  for (const record of rows) {
    if (record.type !== 'expense' || record.treatment === 'fixedPaid') continue;
    const category = catById(record.categoryId);
    const name = category?.name || record.category || '기타';
    const key = category ? 'id:' + category.id : 'name:' + name;
    if (!groups.has(key)) groups.set(key, {name, total: 0, category, amounts: new Map()});
    const group = groups.get(key);
    const subId = transactionSubcategory(record, category)?.id || '';
    const amount = amt(record.amount);
    group.total += amount;
    group.amounts.set(subId, (group.amounts.get(subId) || 0) + amount);
  }
  return groups;
}

function categoryStatsPanel(financials) {
  const groups = Array.from(categorySpending(financials.rows).values())
    .filter(group => group.total > 0)
    .sort((a, b) => b.total - a.total);
  const rows = groups.map(group => {
    const children = subcategories(group.category)
      .filter(child => !child.archived || group.amounts.has(child.id))
      .map(child => [child.name, group.amounts.get(child.id) || 0]);
    if (group.amounts.has('')) {
      children.push(['소분류 미지정', group.amounts.get('')]);
    }
    return `<details class="category-spending-group">
      <summary>
        <span class="category-row-icon" aria-hidden="true">${categoryIconMarkup(group.category || {name: group.name})}</span>
        <b class="category-spending-name">${esc(group.name)}</b>
        <strong>${won(group.total)}</strong>
        <span class="category-spending-chevron" aria-hidden="true">${uiIcon('chevron')}</span>
      </summary>
      <ul class="category-spending-children">
        ${children.map(([name, amount]) => `<li><span>${esc(name)}</span><b>${won(amount)}</b></li>`).join('')}
      </ul>
    </details>`;
  }).join('');
  return `<section class="card category-stats">
    <div class="section-inline"><div><p class="eyebrow">지출 비중</p><h3>카테고리별 지출</h3></div></div>
    ${rows || '<div class="empty">지출 내역이 없습니다.</div>'}
  </section>`;
}
