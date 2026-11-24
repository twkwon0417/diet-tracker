/**
 * search.js — 음식 검색 (부분 일치 + 별칭 검색, 정확히 일치하는 음식 우선).
 * 공백·괄호·가운뎃점·대소문자를 무시하고 비교한다. 예) "삶은계란" == "삶은 계란"
 */
const Search = (() => {
  'use strict';

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[\s()·,.\-_/%]+/g, '');
  }

  /** 검색 속도를 위해 음식마다 정규화된 이름/별칭을 미리 만들어 둔다. */
  function index(foods) {
    return foods.map((food) => ({
      food,
      name: normalize(food.name),
      // "닭가슴살(생)" → "닭가슴살" 처럼 괄호 앞 기본 이름도 정확 일치 대상
      baseName: normalize(String(food.name).replace(/\(.*?\)/g, '')),
      aliases: (food.aliases || []).map(normalize).filter(Boolean),
    }));
  }

  function scoreOf(item, q, tokens) {
    const { name, baseName, aliases } = item;
    if (name === q) return 1000;
    if (baseName === q) return 950;
    // 별칭 정확 일치 (이름에 이미 포함된 단어의 별칭은 중복이므로 제외 — 예: '계란찜'의 별칭 '계란')
    if (aliases.includes(q) && !name.includes(q)) return 900;
    if (name.startsWith(q)) return 800 - Math.min(name.length - q.length, 50);
    if (aliases.some((a) => a.startsWith(q))) return 650;
    const pos = name.indexOf(q);
    if (pos >= 0) return 600 - Math.min(pos, 50);
    if (aliases.some((a) => a.includes(q))) return 450;
    // 여러 단어 검색: "치즈 피자" → 모든 단어가 이름이나 별칭 어딘가에 포함되면 일치
    if (tokens.length > 1) {
      const hay = name + '|' + aliases.join('|');
      if (tokens.every((t) => hay.includes(t))) return 300;
    }
    return 0;
  }

  /**
   * @param indexed  index(foods)의 결과
   * @param query    사용자 입력
   * @param favorites 즐겨찾기 id 배열 (같은 점수일 때 우선)
   */
  function search(indexed, query, favorites = [], limit = 60) {
    const q = normalize(query);
    if (!q) return [];
    const tokens = String(query).toLowerCase().split(/\s+/).map(normalize).filter(Boolean);
    const fav = new Set(favorites);
    const results = [];
    for (const item of indexed) {
      const score = scoreOf(item, q, tokens);
      if (score > 0) results.push({ food: item.food, score: score + (fav.has(item.food.id) ? 5 : 0) });
    }
    results.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length || a.food.name.localeCompare(b.food.name, 'ko'));
    return results.slice(0, limit).map((r) => r.food);
  }

  return { normalize, index, search };
})();
