/**
 * recommend.js — "AI 식단 코치" 추천 (현재는 AI 미연동, 미리 작성된 응답을 보여줌)
 *
 * 동작
 *   1. 하루 기록(Nutrition.buildDailyLog 결과)을 규칙으로 분석해 시나리오를 고른다.
 *   2. data/recommendations.json 에 미리 작성된 해당 시나리오의 문구·팁·추천 음식을 꺼낸다.
 *   3. 문구의 {placeholder}를 실제 수치로 채운다.
 *
 * 향후 AI API 연동 시: getRecommendation() 내부만 API 호출로 바꾸고
 * 같은 형태의 객체({ scenario, mealSlot, headline, message, tips, foodIds })를 반환하면
 * 화면 코드는 수정할 필요가 없다. (Promise를 반환해도 된다)
 */
const Recommend = (() => {
  'use strict';

  let data = null;
  let loadError = null;

  async function load() {
    try {
      const res = await fetch('data/recommendations.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      console.error(e);
      loadError = e;
    }
    return data;
  }

  const SLOT_LABEL = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };

  /** 기록이 없는 첫 식사(아침→점심→저녁), 모두 기록됐으면 간식 */
  function nextSlot(log) {
    const empty = log.meals.find((m) => m.items.length === 0);
    return empty ? empty.meal : 'snack';
  }

  /** 규칙 기반 시나리오 선택 (우선순위 순) */
  function pickScenario(log) {
    const t = log.totals, g = log.goals, r = log.macroEnergyRatioPercent;
    const itemCount = log.meals.reduce((n, m) => n + m.items.length, 0);
    if (itemCount === 0) return 'no-record';
    if (t.kcal > g.kcal * 1.1) return 'kcal-over';
    if (r.fat > 35) return 'fat-high';
    if (r.carbs > 65) return 'carbs-high';
    const kcalProgress = g.kcal > 0 ? t.kcal / g.kcal : 0;
    const proteinProgress = g.protein > 0 ? t.protein / g.protein : 0;
    if (r.protein < 15 || proteinProgress < kcalProgress * 0.7) return 'protein-low';
    if (nextSlot(log) === 'snack' && t.kcal < g.kcal * 0.7) return 'kcal-low';
    return 'balanced';
  }

  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

  /**
   * @param log  Nutrition.buildDailyLog(date, day, goals) 결과
   * @returns 추천 객체, 데이터가 아직 없으면 null
   */
  function getRecommendation(log) {
    if (!data || !data.scenarios) return null;
    const scenario = pickScenario(log);
    const s = data.scenarios[scenario] || data.scenarios.balanced;
    if (!s) return null;
    const slot = nextSlot(log);
    const t = log.totals, g = log.goals, r = log.macroEnergyRatioPercent;
    const vars = {
      meal: SLOT_LABEL[slot],
      kcal: fmt(t.kcal), kcalGoal: fmt(g.kcal),
      kcalLeft: fmt(Math.max(0, g.kcal - t.kcal)), kcalOver: fmt(Math.max(0, t.kcal - g.kcal)),
      carbs: fmt(t.carbs), protein: fmt(t.protein), fat: fmt(t.fat),
      carbsGoal: fmt(g.carbs), proteinGoal: fmt(g.protein), fatGoal: fmt(g.fat),
      proteinLeft: fmt(Math.max(0, g.protein - t.protein)),
      carbsPct: fmt(r.carbs), proteinPct: fmt(r.protein), fatPct: fmt(r.fat),
    };
    return {
      scenario,
      mealSlot: slot,
      mealLabel: SLOT_LABEL[slot],
      // 간식은 별도 식사 칸이 없으므로 저녁에 추가
      targetMeal: slot === 'snack' ? 'dinner' : slot,
      headline: fill(s.headline, vars),
      message: fill(s.message, vars),
      tips: (s.tips || []).map((x) => fill(x, vars)),
      foodIds: (s.foods && s.foods[slot]) || [],
      energyRatio: r,
      disclaimer: data.disclaimer || '',
    };
  }

  return {
    load,
    getRecommendation,
    isReady: () => !!data,
    hasError: () => !!loadError,
    SLOT_LABEL,
  };
})();
