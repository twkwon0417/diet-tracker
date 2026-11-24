/**
 * storage.js — LocalStorage에 개인 데이터(식단 기록, 목표, 직접 등록 음식, 즐겨찾기, 최근 음식)를 저장한다.
 * 음식 영양성분 DB(data/foods.json)와는 완전히 분리되어 있다.
 *
 * 식단 기록 구조
 *   days: { "YYYY-MM-DD": { breakfast: [Entry], lunch: [Entry], dinner: [Entry] } }
 *   Entry: {
 *     id, foodId, name, grams, unit: "g" | "serving",
 *     per: { base, kcal, carbs, protein, fat },   // 기록 당시 영양성분 스냅샷 (기준 중량당)
 *     servingSize, servingLabel, addedAt
 *   }
 * 스냅샷을 저장하므로 foods.json이 바뀌거나 직접 등록 음식이 삭제되어도 과거 기록은 그대로 유지된다.
 */
const Storage = (() => {
  'use strict';

  const KEYS = {
    days: 'dietTracker.days.v1',
    goals: 'dietTracker.goals.v1',
    customFoods: 'dietTracker.customFoods.v1',
    favorites: 'dietTracker.favorites.v1',
    recent: 'dietTracker.recent.v1',
  };
  const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];
  const DEFAULT_GOALS = { kcal: 2000, carbs: 250, protein: 100, fat: 65 };
  const RECENT_MAX = 20;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('저장 데이터 읽기 실패:', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      alert('저장 공간이 부족하거나 브라우저가 저장을 허용하지 않습니다. 데이터를 내보내기로 백업하세요.');
      throw e;
    }
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyDay() {
    return { breakfast: [], lunch: [], dinner: [] };
  }

  // ---------- 식단 기록 ----------
  function getAllDays() {
    const days = read(KEYS.days, {});
    return days && typeof days === 'object' ? days : {};
  }

  function getDay(date) {
    const day = getAllDays()[date];
    const result = emptyDay();
    if (day) MEAL_KEYS.forEach((m) => { if (Array.isArray(day[m])) result[m] = day[m]; });
    return result;
  }

  function saveDay(date, day) {
    const days = getAllDays();
    const isEmpty = MEAL_KEYS.every((m) => !day[m] || day[m].length === 0);
    if (isEmpty) delete days[date];
    else days[date] = day;
    write(KEYS.days, days);
  }

  function addEntry(date, meal, entry) {
    const day = getDay(date);
    const saved = { ...entry, id: uid('e'), addedAt: new Date().toISOString() };
    day[meal].push(saved);
    saveDay(date, day);
    return saved;
  }

  function updateEntry(date, meal, id, changes) {
    const day = getDay(date);
    const idx = day[meal].findIndex((e) => e.id === id);
    if (idx < 0) return null;
    day[meal][idx] = { ...day[meal][idx], ...changes };
    saveDay(date, day);
    return day[meal][idx];
  }

  /** 삭제 후 실행취소를 위해 삭제된 항목과 위치를 반환 */
  function removeEntry(date, meal, id) {
    const day = getDay(date);
    const idx = day[meal].findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const [removed] = day[meal].splice(idx, 1);
    saveDay(date, day);
    return { entry: removed, index: idx };
  }

  function restoreEntry(date, meal, entry, index) {
    const day = getDay(date);
    day[meal].splice(Math.min(index, day[meal].length), 0, entry);
    saveDay(date, day);
  }

  // ---------- 목표 ----------
  function getGoals() {
    const g = read(KEYS.goals, null);
    if (!g) return { ...DEFAULT_GOALS };
    const out = { ...DEFAULT_GOALS };
    Object.keys(DEFAULT_GOALS).forEach((k) => { if (Number(g[k]) > 0) out[k] = Number(g[k]); });
    return out;
  }
  function saveGoals(goals) { write(KEYS.goals, goals); }

  // ---------- 직접 등록 음식 ----------
  function getCustomFoods() {
    const list = read(KEYS.customFoods, []);
    return Array.isArray(list) ? list : [];
  }
  function saveCustomFood(food) {
    const list = getCustomFoods();
    if (food.id) {
      const idx = list.findIndex((f) => f.id === food.id);
      if (idx >= 0) list[idx] = food; else list.unshift(food);
    } else {
      food = { ...food, id: uid('c_') };
      list.unshift(food);
    }
    write(KEYS.customFoods, list);
    return food;
  }
  function deleteCustomFood(id) {
    write(KEYS.customFoods, getCustomFoods().filter((f) => f.id !== id));
    write(KEYS.favorites, getFavorites().filter((x) => x !== id));
    write(KEYS.recent, getRecent().filter((x) => x !== id));
  }

  // ---------- 즐겨찾기 / 최근 ----------
  function getFavorites() {
    const list = read(KEYS.favorites, []);
    return Array.isArray(list) ? list : [];
  }
  function isFavorite(id) { return getFavorites().includes(id); }
  function toggleFavorite(id) {
    const list = getFavorites();
    const idx = list.indexOf(id);
    if (idx >= 0) list.splice(idx, 1); else list.unshift(id);
    write(KEYS.favorites, list);
    return idx < 0;
  }

  function getRecent() {
    const list = read(KEYS.recent, []);
    return Array.isArray(list) ? list : [];
  }
  function pushRecent(id) {
    const list = getRecent().filter((x) => x !== id);
    list.unshift(id);
    write(KEYS.recent, list.slice(0, RECENT_MAX));
  }

  // ---------- 백업 (Export / Import) ----------
  function exportAll() {
    return {
      app: 'diet-tracker',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      goals: getGoals(),
      days: getAllDays(),
      customFoods: getCustomFoods(),
      favorites: getFavorites(),
      recent: getRecent(),
    };
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

  function sanitizeEntry(e) {
    if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !e.name.trim()) return null;
    const p = e.per || {};
    if (!(isNum(e.grams) && e.grams > 0) || !(isNum(p.base) && p.base > 0)) return null;
    if (!['kcal', 'carbs', 'protein', 'fat'].every((k) => isNum(p[k]))) return null;
    return {
      id: typeof e.id === 'string' ? e.id : uid('e'),
      foodId: typeof e.foodId === 'string' ? e.foodId : null,
      name: e.name.trim().slice(0, 60),
      grams: e.grams,
      unit: e.unit === 'serving' ? 'serving' : 'g',
      per: { base: p.base, kcal: p.kcal, carbs: p.carbs, protein: p.protein, fat: p.fat },
      servingSize: isNum(e.servingSize) && e.servingSize > 0 ? e.servingSize : p.base,
      servingLabel: typeof e.servingLabel === 'string' ? e.servingLabel : '',
      addedAt: typeof e.addedAt === 'string' ? e.addedAt : new Date().toISOString(),
    };
  }

  function sanitizeCustomFood(f) {
    if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.name.trim()) return null;
    if (!(isNum(f.baseAmount) && f.baseAmount > 0)) return null;
    if (!['kcal', 'carbs', 'protein', 'fat'].every((k) => isNum(f[k]))) return null;
    return {
      id: typeof f.id === 'string' ? f.id : uid('c_'),
      name: f.name.trim().slice(0, 40),
      baseAmount: f.baseAmount,
      kcal: f.kcal, carbs: f.carbs, protein: f.protein, fat: f.fat,
      servingSize: isNum(f.servingSize) && f.servingSize > 0 ? f.servingSize : f.baseAmount,
      createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date().toISOString(),
    };
  }

  /** 백업 파일을 검증한 뒤 현재 데이터를 교체한다. 잘못된 파일이면 Error를 던진다. */
  function importAll(data) {
    if (!data || typeof data !== 'object' || data.app !== 'diet-tracker' || typeof data.days !== 'object') {
      throw new Error('식단 기록 백업 파일 형식이 아닙니다.');
    }
    const days = {};
    let entryCount = 0;
    Object.entries(data.days || {}).forEach(([date, day]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day) return;
      const clean = emptyDay();
      MEAL_KEYS.forEach((m) => {
        clean[m] = (Array.isArray(day[m]) ? day[m] : []).map(sanitizeEntry).filter(Boolean);
        entryCount += clean[m].length;
      });
      if (MEAL_KEYS.some((m) => clean[m].length)) days[date] = clean;
    });
    const customFoods = (Array.isArray(data.customFoods) ? data.customFoods : []).map(sanitizeCustomFood).filter(Boolean);
    const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

    write(KEYS.days, days);
    write(KEYS.customFoods, customFoods);
    write(KEYS.favorites, strList(data.favorites));
    write(KEYS.recent, strList(data.recent).slice(0, RECENT_MAX));
    if (data.goals && typeof data.goals === 'object') {
      const g = { ...DEFAULT_GOALS };
      Object.keys(g).forEach((k) => { if (isNum(data.goals[k]) && data.goals[k] > 0) g[k] = data.goals[k]; });
      write(KEYS.goals, g);
    }
    return { dayCount: Object.keys(days).length, entryCount, customCount: customFoods.length };
  }

  return {
    MEAL_KEYS, DEFAULT_GOALS,
    getAllDays, getDay, addEntry, updateEntry, removeEntry, restoreEntry,
    getGoals, saveGoals,
    getCustomFoods, saveCustomFood, deleteCustomFood,
    getFavorites, isFavorite, toggleFavorite,
    getRecent, pushRecent,
    exportAll, importAll,
  };
})();
