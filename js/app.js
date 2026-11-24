/**
 * app.js — 화면 렌더링과 사용자 상호작용.
 * 의존: Storage(storage.js), Nutrition(nutrition.js), Search(search.js)
 */
(() => {
  'use strict';

  const MEALS = Nutrition.MEALS;
  const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.key, m.label]));
  const MACROS = [
    { key: 'carbs', label: '탄수화물' },
    { key: 'protein', label: '단백질' },
    { key: 'fat', label: '지방' },
  ];
  const LIMITS = { maxGrams: 5000, maxServings: 50, maxBase: 5000 };
  const CUSTOM_CATEGORY = '내 음식';
  const CUSTOM_SOURCE = '사용자 직접 입력';

  const state = {
    date: todayKey(),
    dbFoods: [],
    categories: [],
    foods: [],
    foodMap: new Map(),
    indexed: [],
    dbLoaded: false,
    dbError: null,
  };

  // ---------------- 유틸 ----------------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const fmtKcal = (n) => Math.round(n).toLocaleString('ko-KR');
  const fmtNum = (n, d = 1) => {
    const r = Nutrition.round(n, d);
    return r.toLocaleString('ko-KR', { maximumFractionDigits: d });
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayKey() { return toKey(new Date()); }
  function fromKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function shiftKey(k, delta) { const d = fromKey(k); d.setDate(d.getDate() + delta); return toKey(d); }
  function isValidKey(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(fromKey(k)) === k; }

  function dateLabel(k) {
    const d = fromKey(k);
    const wd = '일월화수목금토'[d.getDay()];
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return `${sameYear ? '' : d.getFullYear() + '년 '}${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
  }
  function relativeLabel(k) {
    const t = todayKey();
    if (k === t) return '오늘';
    if (k === shiftKey(t, -1)) return '어제';
    if (k === shiftKey(t, 1)) return '내일';
    return '';
  }

  /** 문자열 입력을 숫자로. 빈칸/숫자 아님 → NaN */
  function parseNum(v) {
    const s = String(v ?? '').trim().replace(/,/g, '');
    if (s === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
    return Number(s);
  }

  /** 받침 유무에 따라 조사 선택: josa("김치", "을") → "를" */
  function josa(word, type) {
    const pairs = { 을: ["을", "를"], 은: ["은", "는"], 이: ["이", "가"] };
    const [withB, withoutB] = pairs[type];
    const ch = String(word).replace(/[^가-힣a-zA-Z0-9]+$/, "").slice(-1);
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) return code % 28 ? withB : withoutB;
    return /[0-9lmnLMN]$/.test(ch) ? withB : withoutB;
  }

  const perOf = (food) => ({ base: food.baseAmount, kcal: food.kcal, carbs: food.carbs, protein: food.protein, fat: food.fat });
  const kcalPer100 = (food) => (food.kcal / food.baseAmount) * 100;

  function icon(name) {
    const paths = {
      prev: '<path d="M15 18l-6-6 6-6"/>',
      next: '<path d="M9 18l6-6-6-6"/>',
      menu: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
      star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
      back: '<path d="M15 18l-6-6 6-6"/>',
      calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
      chevron: '<path d="M9 18l6-6-6-6"/>',
      spark: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    };
    return `<svg class="icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  // ---------------- 음식 DB ----------------
  function rebuildFoods() {
    const custom = Storage.getCustomFoods().map((f) => ({
      ...f, aliases: [], category: CUSTOM_CATEGORY, custom: true, source: CUSTOM_SOURCE, servingLabel: '1회',
    }));
    state.foods = [...custom, ...state.dbFoods];
    state.foodMap = new Map(state.foods.map((f) => [f.id, f]));
    state.indexed = Search.index(state.foods);
  }

  async function loadFoods() {
    try {
      const res = await fetch('data/foods.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.dbFoods = Array.isArray(data.foods) ? data.foods : [];
      state.categories = Array.isArray(data.categories) ? data.categories : [...new Set(state.dbFoods.map((f) => f.category))];
      state.dbLoaded = true;
    } catch (e) {
      console.error(e);
      state.dbError = '음식 데이터를 불러오지 못했습니다. 파일을 직접 열었다면 로컬 웹 서버로 실행하세요 (README 참고). 직접 등록한 음식은 사용할 수 있습니다.';
    }
    rebuildFoods();
    renderCoach();
    if (sheet.isOpen() && sheet.refresh) sheet.refresh();
  }

  // ---------------- 메인 화면 ----------------
  function render() {
    renderHeader();
    renderSummary();
    renderMeals();
    renderCoach();
  }

  // ---------------- AI 식단 코치 (예시 응답) ----------------
  function currentRecommendation() {
    const log = Nutrition.buildDailyLog(state.date, Storage.getDay(state.date), Storage.getGoals());
    return Recommend.getRecommendation(log);
  }

  function servingNutrition(food) {
    return Nutrition.calc(perOf(food), food.servingSize > 0 ? food.servingSize : food.baseAmount);
  }

  function coachFoods(rec) {
    return rec.foodIds.map((id) => state.foodMap.get(id)).filter(Boolean);
  }

  function renderCoach() {
    const el = $('#coach');
    if (!el) return;
    if (Recommend.hasError()) { el.hidden = true; return; }
    if (!Recommend.isReady() || !state.dbLoaded) {
      el.hidden = false;
      el.innerHTML = `<div class="coach-head"><span class="coach-badge">${icon('spark')}AI 식단 코치</span></div><p class="coach-msg muted">오늘 기록을 분석하고 있어요…</p>`;
      return;
    }
    const rec = currentRecommendation();
    if (!rec) { el.hidden = true; return; }
    el.hidden = false;
    const foods = coachFoods(rec).slice(0, 4);
    el.innerHTML = `
      <div class="coach-head">
        <span class="coach-badge">${icon('spark')}AI 식단 코치</span>
        <button class="text-btn small" data-action="coach">자세히</button>
      </div>
      <h3 class="coach-headline">${esc(rec.headline)}</h3>
      <p class="coach-msg">${esc(rec.message)}</p>
      ${foods.length ? `
        <div class="coach-sub">${esc(rec.mealLabel)} 추천 메뉴 <small>· 누르면 ${MEAL_LABEL[rec.targetMeal]}에 추가</small></div>
        <ul class="coach-foods">${foods.map((f) => `
          <li><button class="coach-food" data-action="coach-add" data-food="${esc(f.id)}">
            <span class="cf-name">${esc(f.name)}</span>
            <span class="cf-meta">${esc(f.servingLabel || '1회')} · ${fmtKcal(servingNutrition(f).kcal)}kcal</span>
          </button></li>`).join('')}
        </ul>` : ''}
      <p class="coach-note">예시 응답 · 실제 AI는 연결되어 있지 않습니다</p>`;
  }

  function addFromCoach(foodId, fromDetail) {
    const rec = currentRecommendation();
    const food = state.foodMap.get(foodId);
    if (!rec || !food) return;
    openAmount({ mode: 'add', meal: rec.targetMeal, food, onBack: fromDetail ? openCoach : sheet.close });
  }

  function openCoach() {
    const rec = currentRecommendation();
    if (!rec) return;
    const r = rec.energyRatio;
    const hasData = r.carbs + r.protein + r.fat > 0;
    const foods = coachFoods(rec);
    sheet.show(`
      ${sheetHeader('AI 식단 코치')}
      <div class="coach-detail">
        <span class="coach-badge">${icon('spark')}${esc(rec.mealLabel)} 추천</span>
        <h3 class="coach-headline big">${esc(rec.headline)}</h3>
        <p class="coach-msg full">${esc(rec.message)}</p>
        ${hasData ? `
        <div class="ratio">
          <div class="ratio-title">오늘 열량 구성 <small>권장 예시 탄 50 · 단 20 · 지 30</small></div>
          <div class="ratio-bar">
            <span class="c-carbs" style="width:${r.carbs}%"></span><span class="c-protein" style="width:${r.protein}%"></span><span class="c-fat" style="width:${r.fat}%"></span>
          </div>
          <div class="ratio-legend">
            <span><i class="dot c-carbs"></i>탄수화물 ${fmtNum(r.carbs, 0)}%</span>
            <span><i class="dot c-protein"></i>단백질 ${fmtNum(r.protein, 0)}%</span>
            <span><i class="dot c-fat"></i>지방 ${fmtNum(r.fat, 0)}%</span>
          </div>
        </div>` : ''}
        ${rec.tips.length ? `<h4>코치의 팁</h4><ol class="coach-tips">${rec.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
        ${foods.length ? `<h4>${esc(rec.mealLabel)} 추천 메뉴 <small>누르면 ${MEAL_LABEL[rec.targetMeal]}에 추가</small></h4>
        <ul class="food-list coach-list">${foods.map((f) => {
          const n = servingNutrition(f);
          return `<li class="food-row"><button class="food-select" data-coach-food="${esc(f.id)}">
            <span class="food-main"><span class="food-name">${esc(f.name)}</span>
            <span class="food-meta">${esc(f.servingLabel || '1회')} ${fmtNum(f.servingSize, 0)}g · 탄 ${fmtNum(n.carbs)} · 단 ${fmtNum(n.protein)} · 지 ${fmtNum(n.fat)}g</span></span>
            <span class="food-kcal">${fmtKcal(n.kcal)}<small> kcal</small></span>
          </button><span class="add-mini" aria-hidden="true">${icon('plus')}</span></li>`;
        }).join('')}</ul>` : ''}
        <p class="source-note">${esc(rec.disclaimer)}<br>향후 AI API를 연결하면 같은 자리에 실제 분석 결과가 표시됩니다.</p>
      </div>
    `, { label: 'AI 식단 코치', refresh: openCoach });
    wireSheetNav();
    $$('[data-coach-food]', $('#sheet-content')).forEach((b) => b.addEventListener('click', () => addFromCoach(b.dataset.coachFood, true)));
  }

  function renderHeader() {
    $('#date-text').textContent = dateLabel(state.date);
    const rel = relativeLabel(state.date);
    const badge = $('#date-badge');
    badge.textContent = rel;
    badge.hidden = !rel;
    $('#btn-today').hidden = state.date === todayKey();
    $('#date-picker').value = state.date;
  }

  function progressBar(value, goal, cls) {
    const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
    const over = goal > 0 && value > goal;
    return `<div class="bar ${over ? 'is-over' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.round(goal)}" aria-valuenow="${Math.round(value)}"><div class="bar-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>`;
  }

  function renderSummary() {
    const day = Storage.getDay(state.date);
    const { total } = Nutrition.dayTotals(day);
    const goals = Storage.getGoals();
    const diff = goals.kcal - Math.round(total.kcal);
    const remainText = diff >= 0
      ? `<b>${fmtKcal(diff)}</b> kcal 남음`
      : `<b class="over-text">${fmtKcal(-diff)}</b> kcal 초과`;

    $('#summary').innerHTML = `
      <div class="summary-head">
        <span class="summary-label">섭취 칼로리</span>
        <button class="text-btn small" data-action="goals">목표 설정</button>
      </div>
      <div class="kcal-row">
        <span class="kcal-value" id="total-kcal">${fmtKcal(total.kcal)}</span>
        <span class="kcal-goal">/ ${fmtKcal(goals.kcal)} kcal</span>
      </div>
      ${progressBar(total.kcal, goals.kcal, 'c-kcal')}
      <div class="kcal-remain">${remainText}</div>
      <div class="macro-grid">
        ${MACROS.map(({ key, label }) => {
          const v = total[key], g = goals[key];
          const pct = g > 0 ? Math.round((v / g) * 100) : 0;
          return `
          <div class="macro">
            <div class="macro-label"><span class="dot c-${key}"></span>${label}</div>
            <div class="macro-value"><span data-total="${key}">${fmtNum(v)}</span><small>/${fmtNum(g, 0)}g</small></div>
            ${progressBar(v, g, 'c-' + key)}
            <div class="macro-pct ${v > g ? 'over-text' : ''}">${pct}%</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function macroLine(n) {
    return `<span class="ml"><i class="dot c-carbs"></i>탄 ${fmtNum(n.carbs)}g</span>` +
      `<span class="ml"><i class="dot c-protein"></i>단 ${fmtNum(n.protein)}g</span>` +
      `<span class="ml"><i class="dot c-fat"></i>지 ${fmtNum(n.fat)}g</span>`;
  }

  function amountText(e) {
    const g = `${fmtNum(e.grams)}g`;
    if (e.unit === 'serving' && e.servingSize) return `${fmtNum(e.grams / e.servingSize, 2)}인분 · ${g}`;
    return g;
  }

  function renderMeals() {
    const day = Storage.getDay(state.date);
    const { meals } = Nutrition.dayTotals(day);
    $('#meals').innerHTML = MEALS.map(({ key, label }) => {
      const list = day[key];
      const t = meals[key];
      const items = list.length
        ? `<ul class="entry-list">${list.map((e) => {
            const n = Nutrition.entryNutrition(e);
            return `<li><button class="entry" data-action="edit-entry" data-meal="${key}" data-id="${esc(e.id)}">
              <span class="entry-main"><span class="entry-name">${esc(e.name)}</span><span class="entry-amount">${amountText(e)}</span></span>
              <span class="entry-kcal">${fmtKcal(n.kcal)}<small> kcal</small></span>
              ${icon('chevron')}
            </button></li>`;
          }).join('')}</ul>`
        : `<p class="empty">아직 기록된 음식이 없습니다.</p>`;
      return `
      <section class="card meal" data-meal-card="${key}">
        <header class="meal-head">
          <h2>${label}</h2>
          <span class="meal-kcal"><b data-meal-kcal="${key}">${fmtKcal(t.kcal)}</b> kcal</span>
        </header>
        <div class="meal-macros">${macroLine(t)}</div>
        ${items}
        <button class="add-btn" data-action="add" data-meal="${key}">${icon('plus')}음식 추가</button>
      </section>`;
    }).join('');
  }

  function setDate(k) {
    if (!isValidKey(k)) return;
    state.date = k;
    render();
  }

  // ---------------- Bottom Sheet ----------------
  const sheet = (() => {
    let lastFocus = null;
    const api = {
      refresh: null,
      isOpen: () => !$('#sheet-root').hidden,
      show(html, { refresh = null, label = '' } = {}) {
        const root = $('#sheet-root');
        if (root.hidden) {
          lastFocus = document.activeElement;
          root.hidden = false;
          document.body.classList.add('no-scroll');
        }
        $('#sheet').setAttribute('aria-label', label);
        $('#sheet-content').innerHTML = html;
        $('#sheet-content').scrollTop = 0;
        api.refresh = refresh;
      },
      close() {
        const root = $('#sheet-root');
        if (root.hidden) return;
        root.hidden = true;
        $('#sheet-content').innerHTML = '';
        document.body.classList.remove('no-scroll');
        api.refresh = null;
        if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
      },
    };
    return api;
  })();

  function sheetHeader(title, { back = null, right = '' } = {}) {
    const left = back
      ? `<button class="icon-btn" data-sheet-back aria-label="뒤로">${icon('back')}</button>`
      : `<button class="text-btn" data-sheet-close>닫기</button>`;
    return `<header class="sheet-header"><div class="sh-left">${left}</div><h2>${esc(title)}</h2><div class="sh-right">${right}</div></header>`;
  }

  /** sheet 공통 버튼(닫기/뒤로) 연결 */
  function wireSheetNav(onBack) {
    $$('[data-sheet-close]', $('#sheet-content')).forEach((b) => b.addEventListener('click', sheet.close));
    $$('[data-sheet-back]', $('#sheet-content')).forEach((b) => b.addEventListener('click', onBack || sheet.close));
  }

  function isTouchDevice() { return window.matchMedia('(hover: none)').matches; }

  // ---------------- 음식 검색 ----------------
  let searchCtx = { meal: 'breakfast', query: '', tab: 'recent', category: null };

  function foodRow(food, favSet) {
    const fav = favSet.has(food.id);
    const serving = food.servingLabel && /\d+\s*(g|mL)\)/i.test(food.servingLabel)
      ? food.servingLabel
      : food.servingLabel && `${food.servingLabel} ${fmtNum(food.servingSize, 0)}g`;
    const meta = [food.category, serving].filter(Boolean).join(' · ');
    return `<li class="food-row">
      <button class="food-select" data-food="${esc(food.id)}">
        <span class="food-main"><span class="food-name">${esc(food.name)}</span><span class="food-meta">${esc(meta)}</span></span>
        <span class="food-kcal">${fmtKcal(kcalPer100(food))}<small> kcal/100g</small></span>
      </button>
      <button class="star-btn ${fav ? 'is-on' : ''}" data-fav="${esc(food.id)}" aria-pressed="${fav}" aria-label="${fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${icon('star')}</button>
    </li>`;
  }

  function openSearch(meal, keepContext = false) {
    if (!keepContext) searchCtx = { meal, query: '', tab: Storage.getRecent().length ? 'recent' : 'category', category: null };
    const tabs = [['recent', '최근'], ['favorites', '즐겨찾기'], ['custom', '내 음식'], ['category', '카테고리']];
    sheet.show(`
      ${sheetHeader(`${MEAL_LABEL[searchCtx.meal]}에 음식 추가`)}
      <div class="search-box">
        ${icon('search')}
        <input id="food-query" type="search" placeholder="음식 이름 검색 (예: 계란, 김밥)" autocomplete="off" enterkeyhint="search" aria-label="음식 이름 검색" value="${esc(searchCtx.query)}">
      </div>
      <div class="browse" id="browse">
        <div class="segmented" role="tablist">
          ${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${searchCtx.tab === k}">${l}</button>`).join('')}
        </div>
        <div class="chips" id="cat-chips"></div>
      </div>
      ${state.dbError ? `<p class="notice error-notice">${esc(state.dbError)}</p>` : ''}
      <ul class="food-list" id="food-results"></ul>
      <button class="link-btn" id="btn-new-custom">${icon('plus')}찾는 음식이 없나요? 직접 등록하기</button>
    `, { refresh: () => openSearch(searchCtx.meal, true), label: '음식 검색' });
    wireSheetNav();

    const input = $('#food-query');
    input.addEventListener('input', () => { searchCtx.query = input.value; updateSearchResults(); });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const first = $('#food-results .food-select');
        if (first) first.click();
      }
    });
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { searchCtx.tab = b.dataset.tab; updateSearchResults(); }));
    $('#food-results').addEventListener('click', onFoodListClick);
    $('#btn-new-custom').addEventListener('click', () => openCustomForm({ from: 'search', presetName: searchCtx.query.trim() }));
    updateSearchResults();
    if (!isTouchDevice()) input.focus();
  }

  function onFoodListClick(ev) {
    const favBtn = ev.target.closest('[data-fav]');
    if (favBtn) {
      const on = Storage.toggleFavorite(favBtn.dataset.fav);
      favBtn.classList.toggle('is-on', on);
      favBtn.setAttribute('aria-pressed', on);
      favBtn.setAttribute('aria-label', on ? '즐겨찾기 해제' : '즐겨찾기 추가');
      if (searchCtx.tab === 'favorites' && !searchCtx.query.trim()) updateSearchResults();
      return;
    }
    const sel = ev.target.closest('[data-food]');
    if (sel) {
      const food = state.foodMap.get(sel.dataset.food);
      if (food) openAmount({ mode: 'add', meal: searchCtx.meal, food });
    }
  }

  function updateSearchResults() {
    const q = searchCtx.query.trim();
    const list = $('#food-results');
    if (!list) return;
    const favs = Storage.getFavorites();
    const favSet = new Set(favs);
    $('#browse').hidden = !!q;
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === searchCtx.tab)));

    let foods = [];
    let empty = '';
    const chips = $('#cat-chips');
    chips.innerHTML = '';
    if (q) {
      foods = Search.search(state.indexed, q, favs);
      empty = `'${esc(q)}'에 해당하는 음식이 없습니다.<br>아래에서 직접 등록할 수 있어요.`;
    } else if (searchCtx.tab === 'recent') {
      foods = Storage.getRecent().map((id) => state.foodMap.get(id)).filter(Boolean);
      empty = '최근 추가한 음식이 없습니다.<br>음식 이름을 검색해 보세요.';
    } else if (searchCtx.tab === 'favorites') {
      foods = favs.map((id) => state.foodMap.get(id)).filter(Boolean);
      empty = '즐겨찾기한 음식이 없습니다.<br>음식 옆 ☆를 눌러 추가하세요.';
    } else if (searchCtx.tab === 'custom') {
      foods = state.foods.filter((f) => f.custom);
      empty = '직접 등록한 음식이 없습니다.';
    } else {
      const cats = state.categories;
      if (!searchCtx.category || !cats.includes(searchCtx.category)) searchCtx.category = cats[0] || null;
      chips.innerHTML = cats.map((c) => `<button class="chip ${c === searchCtx.category ? 'is-on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
      $$('[data-cat]', chips).forEach((b) => b.addEventListener('click', () => { searchCtx.category = b.dataset.cat; updateSearchResults(); }));
      foods = state.dbFoods.filter((f) => f.category === searchCtx.category);
      empty = state.dbLoaded ? '음식이 없습니다.' : '음식 데이터를 불러오는 중입니다…';
    }
    chips.hidden = !chips.innerHTML;
    list.innerHTML = foods.length ? foods.map((f) => foodRow(f, favSet)).join('') : `<li class="empty">${empty}</li>`;
  }

  // ---------------- 섭취량 입력 (추가/수정) ----------------
  /**
   * opts.mode: 'add' | 'edit'
   * add: { meal, food }   edit: { meal, entry }
   */
  function openAmount(opts) {
    const { mode, meal } = opts;
    const entry = opts.entry || null;
    // 수정 시에는 기록 당시 스냅샷을 사용 (DB가 바뀌어도 기록 일관성 유지)
    const food = entry
      ? {
          id: entry.foodId, name: entry.name, baseAmount: entry.per.base, kcal: entry.per.kcal, carbs: entry.per.carbs,
          protein: entry.per.protein, fat: entry.per.fat, servingSize: entry.servingSize, servingLabel: entry.servingLabel,
          category: state.foodMap.get(entry.foodId)?.category || '', source: state.foodMap.get(entry.foodId)?.source || '',
        }
      : opts.food;
    const servingSize = food.servingSize > 0 ? food.servingSize : food.baseAmount;
    const per = perOf(food);
    const fav = food.id && state.foodMap.has(food.id) ? Storage.isFavorite(food.id) : null;

    let unit = entry ? entry.unit : 'serving';
    let amount = entry ? (unit === 'serving' ? Nutrition.round(entry.grams / servingSize, 2) : Nutrition.round(entry.grams)) : 1;

    const star = fav === null ? '' :
      `<button class="star-btn ${fav ? 'is-on' : ''}" id="amount-fav" aria-pressed="${fav}" aria-label="${fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${icon('star')}</button>`;
    const title = mode === 'add' ? `${MEAL_LABEL[meal]}에 추가` : `${MEAL_LABEL[meal]} 기록 수정`;
    const per100 = Nutrition.calc(per, 100);
    sheet.show(`
      ${sheetHeader(title, { back: mode === 'add', right: star })}
      <div class="food-head">
        <h3>${esc(food.name)}</h3>
        <p>${food.category ? esc(food.category) + ' · ' : ''}100g당 ${fmtKcal(per100.kcal)} kcal · 탄 ${fmtNum(per100.carbs)}g · 단 ${fmtNum(per100.protein)}g · 지 ${fmtNum(per100.fat)}g</p>
      </div>
      <div class="segmented unit-toggle" role="tablist" aria-label="섭취량 단위">
        <button role="tab" data-unit="serving">인분</button>
        <button role="tab" data-unit="g">g (중량)</button>
      </div>
      <div class="amount-row">
        <button class="step-btn" data-step="-1" aria-label="줄이기">−</button>
        <label class="amount-field">
          <input id="amount-input" type="text" inputmode="decimal" autocomplete="off" aria-label="섭취량">
          <span id="amount-unit"></span>
        </label>
        <button class="step-btn" data-step="1" aria-label="늘리기">+</button>
      </div>
      <p class="amount-hint" id="amount-hint"></p>
      <div class="chips center" id="quick-chips"></div>
      <p class="field-error" id="amount-error" role="alert"></p>
      <div class="nutri-box" id="nutri-box"></div>
      <p class="source-note">${food.source ? `출처: ${esc(food.source)}<br>` : ''}조리법·재료에 따라 달라질 수 있는 대표 추정값입니다.</p>
      <div class="sheet-actions">
        ${mode === 'edit' ? '<button class="btn btn-danger" id="btn-delete">삭제</button>' : ''}
        <button class="btn btn-primary" id="btn-save">${mode === 'add' ? '추가하기' : '저장'}</button>
      </div>
    `, { label: '섭취량 입력' });
    wireSheetNav(opts.onBack || (() => openSearch(meal, true)));

    const input = $('#amount-input');

    function gramsFrom(a) { return unit === 'serving' ? a * servingSize : a; }

    function validate() {
      const a = parseNum(input.value);
      if (String(input.value).trim() === '') return { error: '섭취량을 입력하세요.' };
      if (!Number.isFinite(a)) return { error: '숫자만 입력할 수 있습니다.' };
      if (a <= 0) return { error: '섭취량은 0보다 커야 합니다.' };
      const grams = gramsFrom(a);
      if (unit === 'serving' && a > LIMITS.maxServings) return { error: `최대 ${LIMITS.maxServings}인분까지 입력할 수 있습니다.` };
      if (grams > LIMITS.maxGrams) return { error: `최대 ${LIMITS.maxGrams.toLocaleString()}g까지 입력할 수 있습니다.` };
      return { amount: a, grams };
    }

    function update() {
      $$('[data-unit]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.unit === unit)));
      $('#amount-unit').textContent = unit === 'serving' ? '인분' : 'g';
      const v = validate();
      $('#amount-error').textContent = v.error || '';
      input.classList.toggle('is-invalid', !!v.error);
      $('#btn-save').disabled = !!v.error;
      const grams = v.error ? 0 : v.grams;
      const servLabel = food.servingLabel ? `1인분(${esc(food.servingLabel)})` : '1인분';
      $('#amount-hint').innerHTML = unit === 'serving'
        ? `${servLabel} = ${fmtNum(servingSize)}g${v.error ? '' : ` · 총 <b>${fmtNum(grams)}g</b>`}`
        : `${servLabel} = ${fmtNum(servingSize)}g${v.error ? '' : ` · <b>${fmtNum(grams / servingSize, 2)}인분</b>`}`;
      const n = Nutrition.calc(per, grams);
      $('#nutri-box').innerHTML = `
        <div class="nb-kcal"><span>칼로리</span><b id="calc-kcal">${fmtKcal(n.kcal)}</b><small>kcal</small></div>
        <div class="nb-macros">
          ${MACROS.map(({ key, label }) => `<div class="nb-macro"><span><i class="dot c-${key}"></i>${label}</span><b data-calc="${key}">${fmtNum(n[key])}</b><small>g</small></div>`).join('')}
        </div>`;
      const quick = unit === 'serving' ? [0.5, 1, 1.5, 2] : [50, 100, 150, 200, 300];
      $('#quick-chips').innerHTML = quick.map((q) => `<button class="chip ${!v.error && v.amount === q ? 'is-on' : ''}" data-quick="${q}">${q}${unit === 'serving' ? '인분' : 'g'}</button>`).join('');
    }

    function setAmount(a) {
      const r = unit === 'serving' ? Nutrition.round(a, 2) : Nutrition.round(a, 1);
      input.value = String(r);
      update();
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !$('#btn-save').disabled) $('#btn-save').click(); });
    input.addEventListener('focus', () => input.select());
    $$('[data-unit]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.unit === unit) return;
      const v = validate();
      const grams = v.error ? servingSize : v.grams;
      unit = b.dataset.unit;
      setAmount(unit === 'serving' ? grams / servingSize : grams);
    }));
    $$('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const step = unit === 'serving' ? 0.5 : 10;
      const cur = parseNum(input.value);
      const base = Number.isFinite(cur) ? cur : 0;
      // 현재 값을 단계 배수로 맞춘 뒤 증감
      const next = Number(b.dataset.step) > 0 ? Math.floor(base / step + 1e-9) * step + step : Math.ceil(base / step - 1e-9) * step - step;
      if (next > 0) setAmount(next);
    }));
    $('#quick-chips').addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-quick]');
      if (c) setAmount(Number(c.dataset.quick));
    });
    const favBtn = $('#amount-fav');
    if (favBtn) favBtn.addEventListener('click', () => {
      const on = Storage.toggleFavorite(food.id);
      favBtn.classList.toggle('is-on', on);
      favBtn.setAttribute('aria-pressed', on);
      toast(on ? '즐겨찾기에 추가했습니다.' : '즐겨찾기에서 해제했습니다.');
    });

    $('#btn-save').addEventListener('click', () => {
      const v = validate();
      if (v.error) { update(); return; }
      if (mode === 'add') {
        Storage.addEntry(state.date, meal, {
          foodId: food.id, name: food.name, grams: Nutrition.round(v.grams, 2), unit, per,
          servingSize, servingLabel: food.servingLabel || '',
        });
        if (food.id) Storage.pushRecent(food.id);
        sheet.close();
        render();
        toast(`${MEAL_LABEL[meal]}에 ${food.name}${josa(food.name, '을')} 추가했습니다.`);
      } else {
        Storage.updateEntry(state.date, meal, entry.id, { grams: Nutrition.round(v.grams, 2), unit });
        sheet.close();
        render();
        toast('섭취량을 수정했습니다.');
      }
    });

    const del = $('#btn-delete');
    if (del) del.addEventListener('click', () => {
      const removed = Storage.removeEntry(state.date, meal, entry.id);
      const date = state.date;
      sheet.close();
      render();
      if (removed) toast(`${entry.name}${josa(entry.name, '을')} 삭제했습니다.`, {
        actionLabel: '실행취소',
        onAction: () => { Storage.restoreEntry(date, meal, removed.entry, removed.index); render(); },
      });
    });

    setAmount(amount);
    if (!isTouchDevice()) input.focus();
  }

  // ---------------- 직접 등록 음식 ----------------
  /**
   * opts.from: 'search' (등록 후 바로 섭취량 입력) | 'manage' (관리 화면으로 복귀)
   * opts.food: 수정할 기존 음식
   */
  function openCustomForm(opts = {}) {
    const f = opts.food || null;
    const v = (k, d = '') => (f ? f[k] : d);
    sheet.show(`
      ${sheetHeader(f ? '내 음식 수정' : '음식 직접 등록', { back: true })}
      <form id="custom-form" class="form" novalidate>
        <label class="field"><span>음식 이름</span>
          <input name="name" type="text" maxlength="40" required placeholder="예: 엄마표 잡채" value="${esc(f ? f.name : opts.presetName || '')}"></label>
        <div class="field-row">
          <label class="field"><span>기준 중량 (g)</span><input name="baseAmount" type="text" inputmode="decimal" value="${esc(v('baseAmount', 100))}"></label>
          <label class="field"><span>1회 제공량 (g)</span><input name="servingSize" type="text" inputmode="decimal" placeholder="기준 중량과 동일" value="${esc(f && f.servingSize !== f.baseAmount ? f.servingSize : '')}"></label>
        </div>
        <p class="form-hint">아래 영양성분은 <b>기준 중량</b>에 해당하는 값을 입력하세요. (식품 포장의 영양정보 표를 참고)</p>
        <label class="field"><span>칼로리 (kcal)</span><input name="kcal" type="text" inputmode="decimal" value="${esc(v('kcal'))}"></label>
        <div class="field-row three">
          <label class="field"><span><i class="dot c-carbs"></i>탄수화물 (g)</span><input name="carbs" type="text" inputmode="decimal" value="${esc(v('carbs'))}"></label>
          <label class="field"><span><i class="dot c-protein"></i>단백질 (g)</span><input name="protein" type="text" inputmode="decimal" value="${esc(v('protein'))}"></label>
          <label class="field"><span><i class="dot c-fat"></i>지방 (g)</span><input name="fat" type="text" inputmode="decimal" value="${esc(v('fat'))}"></label>
        </div>
        <p class="field-error" id="custom-error" role="alert"></p>
        <div class="sheet-actions">
          <button class="btn btn-primary" type="submit">${f ? '저장' : opts.from === 'search' ? '등록하고 섭취량 입력' : '등록'}</button>
        </div>
      </form>
    `, { label: '음식 직접 등록' });
    wireSheetNav(() => (opts.from === 'search' ? openSearch(searchCtx.meal, true) : openCustomList()));

    const form = $('#custom-form');
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const result = validateCustomFood(Object.fromEntries(fd.entries()));
      $$('.field input', form).forEach((i) => i.classList.toggle('is-invalid', result.field === i.name));
      if (result.error) {
        $('#custom-error').textContent = result.error;
        const bad = form.elements[result.field];
        if (bad) bad.focus();
        return;
      }
      const saved = Storage.saveCustomFood({ ...result.food, id: f ? f.id : undefined, createdAt: f ? f.createdAt : new Date().toISOString() });
      rebuildFoods();
      if (opts.from === 'search' && !f) {
        toast(`'${saved.name}'${josa(saved.name, '을')} 내 음식에 등록했습니다.`);
        openAmount({ mode: 'add', meal: searchCtx.meal, food: state.foodMap.get(saved.id) });
      } else {
        toast(f ? '내 음식을 수정했습니다.' : `'${saved.name}'${josa(saved.name, '을')} 등록했습니다.`);
        openCustomList();
      }
    });
    if (!isTouchDevice()) form.elements.name.focus();
  }

  /** 직접 등록 음식 입력값 검증 → { food } 또는 { error, field } */
  function validateCustomFood(raw) {
    const name = String(raw.name || '').trim();
    if (!name) return { error: '음식 이름을 입력하세요.', field: 'name' };
    if (name.length > 40) return { error: '음식 이름은 40자 이내로 입력하세요.', field: 'name' };

    const base = parseNum(raw.baseAmount);
    if (!Number.isFinite(base) || base <= 0) return { error: '기준 중량은 0보다 큰 숫자여야 합니다.', field: 'baseAmount' };
    if (base > LIMITS.maxBase) return { error: `기준 중량은 ${LIMITS.maxBase}g 이하로 입력하세요.`, field: 'baseAmount' };

    let serving = base;
    if (String(raw.servingSize || '').trim() !== '') {
      serving = parseNum(raw.servingSize);
      if (!Number.isFinite(serving) || serving <= 0) return { error: '1회 제공량은 0보다 큰 숫자여야 합니다.', field: 'servingSize' };
      if (serving > LIMITS.maxGrams) return { error: `1회 제공량은 ${LIMITS.maxGrams}g 이하로 입력하세요.`, field: 'servingSize' };
    }

    const nums = {};
    const labels = { kcal: '칼로리', carbs: '탄수화물', protein: '단백질', fat: '지방' };
    for (const k of ['kcal', 'carbs', 'protein', 'fat']) {
      const s = String(raw[k] ?? '').trim();
      if (s === '') return { error: `${labels[k]}${josa(labels[k], '을')} 입력하세요. (없으면 0)`, field: k };
      const n = parseNum(s);
      if (!Number.isFinite(n)) return { error: `${labels[k]}${josa(labels[k], '은')} 숫자로 입력하세요.`, field: k };
      if (n < 0) return { error: `${labels[k]}${josa(labels[k], '은')} 0 이상이어야 합니다.`, field: k };
      nums[k] = n;
    }
    // 지방(9kcal/g)보다 열량 밀도가 높은 음식은 존재하지 않음
    if (nums.kcal > base * 9.5) return { error: `칼로리가 너무 큽니다. ${fmtNum(base)}g 기준 최대 ${fmtKcal(base * 9)}kcal 정도입니다.`, field: 'kcal' };
    if (nums.carbs + nums.protein + nums.fat > base + 0.5) return { error: '탄수화물·단백질·지방의 합이 기준 중량보다 클 수 없습니다.', field: 'carbs' };
    return {
      food: {
        name, baseAmount: Nutrition.round(base, 2), servingSize: Nutrition.round(serving, 2),
        kcal: Nutrition.round(nums.kcal, 1), carbs: Nutrition.round(nums.carbs, 2), protein: Nutrition.round(nums.protein, 2), fat: Nutrition.round(nums.fat, 2),
      },
    };
  }

  function openCustomList() {
    const list = Storage.getCustomFoods();
    sheet.show(`
      ${sheetHeader('내 음식 관리', { back: true })}
      <p class="sheet-desc">직접 등록한 음식은 이 브라우저에 저장되며 검색에서 바로 찾을 수 있습니다. 수정·삭제해도 이미 기록된 식단은 바뀌지 않습니다.</p>
      <ul class="manage-list">
        ${list.length ? list.map((f) => `
          <li>
            <div class="ml-main"><b>${esc(f.name)}</b>
              <span>${fmtNum(f.baseAmount)}g당 ${fmtKcal(f.kcal)} kcal · 탄 ${fmtNum(f.carbs)} · 단 ${fmtNum(f.protein)} · 지 ${fmtNum(f.fat)}g</span></div>
            <button class="text-btn small" data-edit="${esc(f.id)}">수정</button>
            <button class="text-btn small danger" data-del="${esc(f.id)}">삭제</button>
          </li>`).join('') : '<li class="empty">직접 등록한 음식이 없습니다.</li>'}
      </ul>
      <div class="sheet-actions"><button class="btn btn-secondary" id="btn-add-custom">${icon('plus')}새 음식 등록</button></div>
    `, { label: '내 음식 관리' });
    wireSheetNav(openMenu);
    $('#btn-add-custom').addEventListener('click', () => openCustomForm({ from: 'manage' }));
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const f = Storage.getCustomFoods().find((x) => x.id === b.dataset.edit);
      if (f) openCustomForm({ from: 'manage', food: f });
    }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const f = Storage.getCustomFoods().find((x) => x.id === b.dataset.del);
      if (!f || !confirm(`'${f.name}'${josa(f.name, '을')} 삭제할까요?\n이미 기록된 식단은 그대로 유지됩니다.`)) return;
      Storage.deleteCustomFood(f.id);
      rebuildFoods();
      openCustomList();
      toast('삭제했습니다.');
    }));
  }

  // ---------------- 목표 설정 ----------------
  function openGoals(from) {
    const g = Storage.getGoals();
    sheet.show(`
      ${sheetHeader('일일 목표 설정', { back: from === 'menu' })}
      <form id="goal-form" class="form" novalidate>
        <label class="field"><span>목표 칼로리 (kcal)</span><input name="kcal" type="text" inputmode="numeric" value="${g.kcal}"></label>
        <button type="button" class="text-btn small" id="btn-auto-macro">칼로리 기준으로 탄단지 자동 계산 (50 : 20 : 30)</button>
        <div class="field-row three">
          <label class="field"><span><i class="dot c-carbs"></i>탄수화물 (g)</span><input name="carbs" type="text" inputmode="numeric" value="${g.carbs}"></label>
          <label class="field"><span><i class="dot c-protein"></i>단백질 (g)</span><input name="protein" type="text" inputmode="numeric" value="${g.protein}"></label>
          <label class="field"><span><i class="dot c-fat"></i>지방 (g)</span><input name="fat" type="text" inputmode="numeric" value="${g.fat}"></label>
        </div>
        <p class="form-hint" id="goal-hint"></p>
        <p class="field-error" id="goal-error" role="alert"></p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" id="btn-goal-reset">기본값</button>
          <button class="btn btn-primary" type="submit">저장</button>
        </div>
      </form>
    `, { label: '일일 목표 설정' });
    wireSheetNav(openMenu);
    const form = $('#goal-form');
    const hint = () => {
      const c = parseNum(form.elements.carbs.value), p = parseNum(form.elements.protein.value), f = parseNum(form.elements.fat.value);
      if ([c, p, f].every(Number.isFinite)) {
        $('#goal-hint').textContent = `탄단지 기준 열량 합계: 약 ${fmtKcal(c * 4 + p * 4 + f * 9)} kcal (탄·단 4kcal/g, 지 9kcal/g)`;
      } else $('#goal-hint').textContent = '';
    };
    form.addEventListener('input', hint);
    hint();
    $('#btn-auto-macro').addEventListener('click', () => {
      const k = parseNum(form.elements.kcal.value);
      if (!Number.isFinite(k) || k <= 0) { $('#goal-error').textContent = '먼저 목표 칼로리를 입력하세요.'; return; }
      form.elements.carbs.value = Math.round((k * 0.5) / 4);
      form.elements.protein.value = Math.round((k * 0.2) / 4);
      form.elements.fat.value = Math.round((k * 0.3) / 9);
      $('#goal-error').textContent = '';
      hint();
    });
    $('#btn-goal-reset').addEventListener('click', () => {
      Object.entries(Storage.DEFAULT_GOALS).forEach(([k, val]) => { form.elements[k].value = val; });
      hint();
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const ranges = { kcal: [500, 10000, '목표 칼로리'], carbs: [1, 2000, '탄수화물'], protein: [1, 1000, '단백질'], fat: [1, 1000, '지방'] };
      const out = {};
      for (const [k, [min, max, label]] of Object.entries(ranges)) {
        const n = parseNum(form.elements[k].value);
        const bad = !Number.isFinite(n) || n < min || n > max;
        form.elements[k].classList.toggle('is-invalid', bad);
        if (bad) {
          $('#goal-error').textContent = `${label}${josa(label, '은')} ${min.toLocaleString()}~${max.toLocaleString()} 사이의 숫자로 입력하세요.`;
          form.elements[k].focus();
          return;
        }
        out[k] = Math.round(n);
      }
      Storage.saveGoals(out);
      sheet.close();
      render();
      toast('목표를 저장했습니다.');
    });
  }

  // ---------------- 메뉴 / 백업 / AI 데이터 ----------------
  function openMenu() {
    const items = [
      ['goals', '일일 목표 설정', '칼로리·탄단지 목표'],
      ['custom', '내 음식 관리', `직접 등록한 음식 ${Storage.getCustomFoods().length}개`],
      ['export', '데이터 내보내기', '전체 기록을 JSON 파일로 백업'],
      ['import', '데이터 가져오기', 'JSON 백업 파일로 복원'],
      ['ai', 'AI 분석용 데이터', '날짜별 기록·합계를 Structured JSON으로'],
      ['about', '데이터 출처 및 안내', '영양성분 DB 정보'],
    ];
    sheet.show(`
      ${sheetHeader('설정')}
      <ul class="menu-list">
        ${items.map(([k, t, d]) => `<li><button data-menu="${k}"><span><b>${t}</b><small>${esc(d)}</small></span>${icon('chevron')}</button></li>`).join('')}
      </ul>
    `, { label: '설정' });
    wireSheetNav();
    $$('[data-menu]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.menu;
      if (k === 'goals') openGoals('menu');
      else if (k === 'custom') openCustomList();
      else if (k === 'export') exportBackup();
      else if (k === 'import') $('#import-file').click();
      else if (k === 'ai') openAIExport('day');
      else if (k === 'about') openAbout();
    }));
  }

  function download(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    const data = Storage.exportAll();
    download(`diet-tracker-backup-${todayKey()}.json`, data);
    toast(`${Object.keys(data.days).length}일치 기록을 내보냈습니다.`);
  }

  async function importBackup(file) {
    try {
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('JSON 파일을 읽을 수 없습니다.'); }
      if (!confirm('가져오기를 하면 현재 브라우저의 식단 기록, 목표, 내 음식, 즐겨찾기가 백업 파일 내용으로 교체됩니다.\n계속할까요?')) return;
      const r = Storage.importAll(data);
      rebuildFoods();
      sheet.close();
      render();
      toast(`가져오기 완료: ${r.dayCount}일, 음식 기록 ${r.entryCount}개`);
    } catch (e) {
      alert(`가져오기 실패: ${e.message}`);
    }
  }

  /** 향후 AI API 연동용 — 날짜 배열에 대한 Structured JSON */
  function getAIExport(dates) {
    return Nutrition.buildExport(dates, Storage.getDay, Storage.getGoals());
  }

  function aiDates(range) {
    if (range === 'day') return [state.date];
    if (range === 'week') return Array.from({ length: 7 }, (_, i) => shiftKey(state.date, i - 6));
    return Object.keys(Storage.getAllDays()).sort();
  }

  function openAIExport(range) {
    const data = getAIExport(aiDates(range));
    const json = JSON.stringify(data, null, 2);
    const ranges = [['day', '선택한 날짜'], ['week', '최근 7일'], ['all', '전체 기록']];
    sheet.show(`
      ${sheetHeader('AI 분석용 데이터', { back: true })}
      <p class="sheet-desc">날짜별 음식 기록과 영양성분 합계·목표 달성률을 구조화된 JSON으로 추출합니다. 향후 AI 식단 평가 기능에 그대로 전달할 수 있는 형식입니다. (현재 AI API는 연동되어 있지 않습니다.)</p>
      <div class="segmented">${ranges.map(([k, l]) => `<button data-range="${k}" aria-selected="${k === range}">${l}</button>`).join('')}</div>
      <pre class="json-view" id="ai-json">${esc(json)}</pre>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="btn-ai-copy">복사</button>
        <button class="btn btn-primary" id="btn-ai-download">JSON 다운로드</button>
      </div>
    `, { label: 'AI 분석용 데이터' });
    wireSheetNav(openMenu);
    $$('[data-range]').forEach((b) => b.addEventListener('click', () => openAIExport(b.dataset.range)));
    $('#btn-ai-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(json); toast('클립보드에 복사했습니다.'); }
      catch {
        const sel = window.getSelection(); const r = document.createRange();
        r.selectNodeContents($('#ai-json')); sel.removeAllRanges(); sel.addRange(r);
        toast('텍스트를 선택했습니다. 직접 복사하세요.');
      }
    });
    $('#btn-ai-download').addEventListener('click', () => download(`diet-log-${range}-${state.date}.json`, data));
  }

  function openAbout() {
    const counts = {};
    state.dbFoods.forEach((f) => { counts[f.category] = (counts[f.category] || 0) + 1; });
    sheet.show(`
      ${sheetHeader('데이터 출처 및 안내', { back: true })}
      <div class="about">
        <p>기본 음식 데이터베이스에는 한국인이 자주 먹는 음식 <b>${state.dbFoods.length}개</b>가 포함되어 있습니다. 모든 값은 <b>100g 기준</b>입니다.</p>
        <ul class="cat-counts">${Object.entries(counts).map(([c, n]) => `<li><span>${esc(c)}</span><b>${n}</b></li>`).join('')}</ul>
        <h4>참고 자료</h4>
        <ul class="bullets">
          <li>식품의약품안전처 식품영양성분 데이터베이스 (음식·가공식품)</li>
          <li>농촌진흥청 국가표준식품성분표</li>
          <li>USDA FoodData Central (일부 원재료·외식 메뉴)</li>
        </ul>
        <h4>유의사항</h4>
        <ul class="bullets">
          <li>표시되는 영양성분은 위 자료를 참고한 <b>대표 추정값</b>이며, 조리법·재료·브랜드·1인분 크기에 따라 실제 값과 다를 수 있습니다.</li>
          <li>정확한 관리가 필요하면 제품 포장의 영양정보를 확인해 ‘직접 등록’ 기능을 이용하세요.</li>
          <li>모든 개인 기록은 이 브라우저(LocalStorage)에만 저장되며 서버로 전송되지 않습니다. 브라우저 데이터를 삭제하면 기록도 사라지므로 주기적으로 내보내기로 백업하세요.</li>
        </ul>
      </div>
    `, { label: '데이터 출처' });
    wireSheetNav(openMenu);
  }

  // ---------------- Toast ----------------
  let toastTimer = null;
  function toast(msg, { actionLabel, onAction } = {}) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button class="toast-action">${esc(actionLabel)}</button>` : ''}`;
    el.hidden = false;
    if (actionLabel) {
      $('.toast-action', el).addEventListener('click', () => { el.hidden = true; clearTimeout(toastTimer); onAction(); });
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, actionLabel ? 5000 : 2200);
  }

  // ---------------- 이벤트 ----------------
  function bindEvents() {
    $('#btn-prev').addEventListener('click', () => setDate(shiftKey(state.date, -1)));
    $('#btn-next').addEventListener('click', () => setDate(shiftKey(state.date, 1)));
    $('#btn-today').addEventListener('click', () => setDate(todayKey()));
    $('#btn-menu').addEventListener('click', openMenu);

    const picker = $('#date-picker');
    $('#btn-date').addEventListener('click', () => {
      picker.value = state.date;
      try {
        if (typeof picker.showPicker === 'function') { picker.showPicker(); return; }
      } catch { /* 일부 브라우저는 showPicker 제한 */ }
      picker.focus();
      picker.click();
    });
    picker.addEventListener('change', () => { if (picker.value) setDate(picker.value); });

    document.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-action]');
      if (!t) return;
      const a = t.dataset.action;
      if (a === 'add') openSearch(t.dataset.meal);
      else if (a === 'goals') openGoals();
      else if (a === 'coach') openCoach();
      else if (a === 'coach-add') addFromCoach(t.dataset.food, false);
      else if (a === 'edit-entry') {
        const entry = Storage.getDay(state.date)[t.dataset.meal].find((e) => e.id === t.dataset.id);
        if (entry) openAmount({ mode: 'edit', meal: t.dataset.meal, entry });
      }
    });

    $('#sheet-root').addEventListener('click', (ev) => { if (ev.target.id === 'sheet-root') sheet.close(); });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && sheet.isOpen()) sheet.close();
      if (!sheet.isOpen() && !ev.target.closest('input, textarea') && !ev.metaKey && !ev.ctrlKey) {
        if (ev.key === 'ArrowLeft') setDate(shiftKey(state.date, -1));
        if (ev.key === 'ArrowRight') setDate(shiftKey(state.date, 1));
      }
    });

    $('#import-file').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (file) importBackup(file);
    });

    // 자정을 넘겨 다시 열었을 때 '오늘'을 보고 있었다면 새 날짜로 이동
    let lastToday = todayKey();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const now = todayKey();
      if (now !== lastToday) {
        if (state.date === lastToday && !sheet.isOpen()) state.date = now;
        lastToday = now;
        render();
      }
    });
    // 다른 탭에서 데이터가 바뀌면 반영
    window.addEventListener('storage', () => { rebuildFoods(); render(); });
  }

  // 향후 AI 기능 연동을 위한 공개 API (콘솔에서도 사용 가능)
  window.DietTracker = {
    getDailyLog: (date = state.date) => getAIExport([date]),
    getRangeLog: (startDate, endDate) => {
      if (!isValidKey(startDate) || !isValidKey(endDate) || startDate > endDate) throw new Error('YYYY-MM-DD 형식의 시작/종료 날짜가 필요합니다.');
      const dates = [];
      for (let d = startDate; d <= endDate; d = shiftKey(d, 1)) dates.push(d);
      return getAIExport(dates);
    },
  };

  bindEvents();
  rebuildFoods();
  render();
  loadFoods();
  Recommend.load().then(renderCoach);
})();
