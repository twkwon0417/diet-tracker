/**
 * nutrition.js — 영양성분 계산과 합계, AI 분석용 Structured JSON 생성.
 *
 * 계산 공식: 실제 섭취 영양성분 = 기준 영양성분 × (섭취 중량 / 기준 중량)
 */
const Nutrition = (() => {
  'use strict';

  const NUTRIENTS = ['kcal', 'carbs', 'protein', 'fat'];
  const MEALS = [
    { key: 'breakfast', label: '아침' },
    { key: 'lunch', label: '점심' },
    { key: 'dinner', label: '저녁' },
  ];

  const zero = () => ({ kcal: 0, carbs: 0, protein: 0, fat: 0 });

  function round(n, digits = 1) {
    const p = 10 ** digits;
    return Math.round((n + Number.EPSILON) * p) / p;
  }

  /** per: { base, kcal, carbs, protein, fat } (base g 기준) */
  function calc(per, grams) {
    const ratio = per.base > 0 ? grams / per.base : 0;
    const out = {};
    NUTRIENTS.forEach((k) => { out[k] = (Number(per[k]) || 0) * ratio; });
    return out;
  }

  function add(a, b) {
    const out = {};
    NUTRIENTS.forEach((k) => { out[k] = a[k] + b[k]; });
    return out;
  }

  const entryNutrition = (entry) => calc(entry.per, entry.grams);
  const mealTotals = (entries) => entries.reduce((acc, e) => add(acc, entryNutrition(e)), zero());

  function dayTotals(day) {
    const meals = {};
    let total = zero();
    MEALS.forEach(({ key }) => {
      meals[key] = mealTotals(day[key] || []);
      total = add(total, meals[key]);
    });
    return { meals, total };
  }

  /** 표시·내보내기용 반올림 (kcal 정수, 탄단지 소수 1자리) */
  function rounded(n) {
    return { kcal: Math.round(n.kcal), carbs: round(n.carbs), protein: round(n.protein), fat: round(n.fat) };
  }

  /** 탄단지 칼로리 비율(%) — 4/4/9 kcal/g 기준 */
  function macroEnergyRatio(n) {
    const c = n.carbs * 4, p = n.protein * 4, f = n.fat * 9;
    const sum = c + p + f;
    if (sum <= 0) return { carbs: 0, protein: 0, fat: 0 };
    return { carbs: round((c / sum) * 100), protein: round((p / sum) * 100), fat: round((f / sum) * 100) };
  }

  function percentOf(value, goal) {
    return goal > 0 ? round((value / goal) * 100) : null;
  }

  /**
   * 향후 AI API에 그대로 전달할 수 있는 하루 식단 Structured JSON.
   * 스키마: diet-tracker.daily-log/v1
   */
  function buildDailyLog(date, day, goals) {
    const { meals, total } = dayTotals(day);
    const totalR = rounded(total);
    return {
      date,
      totals: totalR,
      goals: { ...goals },
      goalAchievementPercent: {
        kcal: percentOf(total.kcal, goals.kcal),
        carbs: percentOf(total.carbs, goals.carbs),
        protein: percentOf(total.protein, goals.protein),
        fat: percentOf(total.fat, goals.fat),
      },
      remaining: {
        kcal: Math.round(goals.kcal - total.kcal),
        carbs: round(goals.carbs - total.carbs),
        protein: round(goals.protein - total.protein),
        fat: round(goals.fat - total.fat),
      },
      macroEnergyRatioPercent: macroEnergyRatio(total),
      meals: MEALS.map(({ key, label }) => ({
        meal: key,
        label,
        totals: rounded(meals[key]),
        items: (day[key] || []).map((e) => ({
          name: e.name,
          foodId: e.foodId,
          amountGrams: round(e.grams),
          servings: e.servingSize ? round(e.grams / e.servingSize, 2) : null,
          servingSizeGrams: e.servingSize || null,
          nutrition: rounded(entryNutrition(e)),
          per: { baseGrams: e.per.base, kcal: e.per.kcal, carbs: e.per.carbs, protein: e.per.protein, fat: e.per.fat },
        })),
      })),
    };
  }

  function buildExport(dates, getDay, goals) {
    return {
      schema: 'diet-tracker.daily-log/v1',
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      units: { energy: 'kcal', macros: 'g', amount: 'g' },
      note: '영양성분은 공공 영양성분 DB를 참고한 대표 추정값이며 조리법·재료에 따라 달라질 수 있습니다.',
      days: dates.map((d) => buildDailyLog(d, getDay(d), goals)),
    };
  }

  return { NUTRIENTS, MEALS, zero, round, calc, entryNutrition, mealTotals, dayTotals, rounded, macroEnergyRatio, buildDailyLog, buildExport };
})();
