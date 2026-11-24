# 식단 기록 (Diet Tracker)

하루 식단을 아침·점심·저녁으로 기록하고 칼로리와 탄수화물·단백질·지방을 자동으로 계산하는 개인용 웹앱입니다.
HTML/CSS/JavaScript만 사용하며 빌드 과정과 서버(백엔드)가 없습니다. GitHub Pages에 그대로 올려서 쓸 수 있고, 기록은 브라우저의 LocalStorage에 저장됩니다.

## 주요 기능

- **날짜 이동**: 이전/다음 버튼, 키보드 ←/→, 날짜를 눌러 달력에서 선택, `오늘` 버튼으로 복귀. 오늘·어제·내일은 배지로 표시합니다. 자정을 넘겨 앱을 다시 열면 오늘 날짜로 넘어갑니다.
- **하루 요약**: 섭취 칼로리 / 목표, 남은(또는 초과) 칼로리, 탄·단·지 섭취량과 달성률을 진행 막대로 보여 줍니다. 목표를 넘으면 초과 상태로 표시합니다.
- **끼니별 기록**: 아침·점심·저녁마다 음식 목록과 끼니 합계를 보여 줍니다. 기록을 누르면 섭취량을 고치거나 삭제할 수 있습니다.
- **음식 검색**
  - 부분 일치와 별칭 검색을 지원합니다. 예를 들어 `밥`, `공기밥`으로 `흰쌀밥`을 찾을 수 있습니다.
  - 공백·괄호·가운뎃점·대소문자는 무시합니다(`삶은계란` = `삶은 계란`).
  - 정렬 순서: 이름 정확 일치 → 괄호 앞 기본 이름 일치(`닭가슴살(생)` ← `닭가슴살`) → 별칭 정확 일치 → 앞부분 일치 → 부분 일치. 점수가 같으면 즐겨찾기를 먼저 보여 줍니다.
  - 여러 단어를 입력하면(`치즈 피자`) 모든 단어가 이름이나 별칭에 들어 있는 음식을 찾습니다.
- **섭취량 입력**: `인분` 또는 `g` 단위로 입력합니다. ± 버튼(0.5인분 / 10g 단위)과 빠른 선택 칩(0.5·1·1.5·2인분, 50~300g)을 제공합니다.
- **실시간 계산**: 입력하는 즉시 칼로리와 탄단지를 다시 계산합니다.
  ```
  실제 섭취 = 기준 영양성분 × (섭취 중량 / 기준 중량)
  ```
  예: 흰쌀밥 100g당 145kcal, 1공기(210g)를 먹으면 145 × (210 / 100) ≈ 305kcal
- **직접 등록 음식(내 음식)**: DB에 없는 음식은 이름, 기준 중량, 1회 제공량, 칼로리, 탄단지를 직접 입력해 등록합니다. 검색 결과가 없을 때 검색어를 이름으로 채워 바로 등록할 수 있고, 설정 → `내 음식 관리`에서 고치거나 지울 수 있습니다.
- **탭**: 검색창이 비어 있으면 `최근`(최대 20개) / `즐겨찾기` / `내 음식` / `카테고리` 탭으로 음식을 고릅니다. 섭취량 화면의 ☆ 버튼으로 즐겨찾기를 추가하거나 해제합니다.
- **목표 설정**: 칼로리와 탄단지 목표를 정합니다(기본값 2000kcal / 탄 250g / 단 100g / 지 65g). `탄단지 자동 계산`을 누르면 칼로리를 50 : 20 : 30 비율로 나눠 g으로 환산합니다(탄·단 4kcal/g, 지 9kcal/g).
- **백업**: 설정 → `데이터 내보내기`로 전체 데이터를 `diet-tracker-backup-YYYY-MM-DD.json` 파일로 저장하고, `데이터 가져오기`로 복원합니다. 가져오면 현재 데이터가 백업 내용으로 **교체**되므로 실행 전에 확인 창이 뜹니다. 파일 형식이 맞지 않거나 잘못된 항목은 걸러냅니다.
- **AI 분석용 데이터**: 선택한 날짜 / 최근 7일 / 전체 기록을 구조화된 JSON으로 보고, 복사하거나 다운로드합니다. 브라우저 콘솔이나 다른 스크립트에서도 꺼낼 수 있습니다.
  ```js
  DietTracker.getDailyLog('2026-11-24');              // 생략하면 현재 보고 있는 날짜
  DietTracker.getRangeLog('2026-11-18', '2026-11-24'); // 시작~종료일(포함)
  ```
- **삭제 실행취소**: 기록을 삭제하면 5초 동안 `실행취소` 버튼이 있는 알림이 떠서 원래 자리에 되돌릴 수 있습니다.
- **입력 검증**
  - 섭취량: 비어 있거나 숫자가 아니거나 0 이하면 저장할 수 없습니다. 최대 50인분, 5,000g까지 입력할 수 있습니다.
  - 내 음식: 이름 필수(40자 이내). 기준 중량은 0 초과 5,000g 이하, 1회 제공량은 0 초과 5,000g 이하(비우면 기준 중량과 같음). 칼로리·탄단지는 0 이상이어야 합니다(없으면 0 입력).
  - 내 음식 상식 검사: 칼로리는 기준 중량 × 9.5kcal를 넘을 수 없고, 탄+단+지 합계가 기준 중량보다 클 수 없습니다.
  - 목표: 칼로리 500~10,000kcal, 탄수화물 1~2,000g, 단백질·지방 1~1,000g.

## 프로젝트 구조

```
diet-tracker/
├── index.html          # 화면 뼈대
├── css/
│   └── style.css       # 스타일 (모바일 우선)
├── js/
│   ├── storage.js      # LocalStorage 저장·불러오기, 백업 내보내기/가져오기
│   ├── nutrition.js    # 영양성분 계산, 합계, AI 분석용 JSON 생성
│   ├── search.js       # 음식 검색 (정규화, 별칭, 점수 정렬)
│   └── app.js          # 화면 렌더링, 사용자 입력 처리, window.DietTracker 공개 API
├── data/
│   └── foods.json      # 기본 음식 영양성분 DB (268개, 100g 기준)
├── README.md
└── .gitignore
```

| 파일 | 역할 |
| --- | --- |
| `js/storage.js` | 식단 기록·목표·내 음식·즐겨찾기·최근 음식을 LocalStorage에 읽고 씁니다. 삭제 취소용 복원, 백업 내보내기, 가져올 때 데이터 검증을 맡습니다. |
| `js/nutrition.js` | `기준 × (섭취 중량 / 기준 중량)` 계산, 끼니·하루 합계, 탄단지 열량 비율, AI 분석용 JSON(`diet-tracker.daily-log/v1`)을 만듭니다. |
| `js/search.js` | 이름과 별칭을 정규화해 색인을 만들고, 정확 일치를 우선하는 점수로 검색 결과를 정렬합니다. |
| `js/app.js` | `data/foods.json`을 불러와 화면을 그리고 날짜 이동, 검색, 섭취량 입력, 내 음식, 목표, 백업, 알림(토스트) 등 모든 상호작용을 처리합니다. |

스크립트는 `storage.js` → `nutrition.js` → `search.js` → `app.js` 순서로 불러옵니다.

## 로컬 실행

`data/foods.json`을 `fetch()`로 불러오기 때문에 `index.html`을 더블클릭해서(`file://`) 열면 음식 DB가 로드되지 않습니다. 직접 등록한 음식만 쓸 수 있는 상태가 되므로 로컬 웹 서버로 실행하세요.

```bash
cd diet-tracker
python3 -m http.server 8000
```

브라우저에서 http://localhost:8000 을 엽니다.

Node.js가 있다면 다음 명령도 됩니다. 출력에 나오는 주소로 접속하세요.

```bash
npx serve .
```

## GitHub Pages 배포

1. GitHub에서 새 저장소를 만듭니다(예: `diet-tracker`). Pages를 무료로 쓰려면 Public 저장소여야 합니다.
2. 프로젝트 폴더에서 저장소를 초기화하고 올립니다.

   ```bash
   cd diet-tracker
   git init
   git add .
   git commit -m "식단 기록 앱"
   ```

   ```bash
   git branch -M main
   git remote add origin https://github.com/<사용자명>/diet-tracker.git
   git push -u origin main
   ```

3. 저장소의 **Settings → Pages**로 이동합니다.
4. **Build and deployment → Source**에서 `Deploy from a branch`를 고르고, Branch를 `main`, 폴더를 `/ (root)`로 정한 뒤 **Save**를 누릅니다.
   - 이 앱을 더 큰 저장소의 `diet-tracker/` 하위 폴더로 넣었다면 폴더 선택지가 `/ (root)`와 `/docs`뿐이므로, 저장소 루트를 배포하고 `https://<사용자명>.github.io/<저장소>/diet-tracker/`로 접속하면 됩니다.
5. 1~2분 정도 기다립니다. 진행 상황은 저장소의 **Actions** 탭에서 볼 수 있습니다.
6. `https://<사용자명>.github.io/<저장소>/`에 접속합니다.

앱의 모든 경로(`css/style.css`, `js/*.js`, `data/foods.json`)가 상대 경로라서 `https://<사용자명>.github.io/<저장소>/` 같은 프로젝트 사이트 주소에서도 별도 설정 없이 동작합니다.

수정 사항을 반영할 때는 커밋하고 푸시하면 자동으로 다시 배포됩니다.

```bash
git add .
git commit -m "변경 내용"
git push
```

## 데이터 저장

개인 데이터는 모두 브라우저 LocalStorage에 저장되며 외부 서버로 전송하지 않습니다.

| 키 | 내용 |
| --- | --- |
| `dietTracker.days.v1` | 날짜별 식단 기록 `{ "YYYY-MM-DD": { breakfast, lunch, dinner } }` |
| `dietTracker.goals.v1` | 일일 목표 (kcal, carbs, protein, fat) |
| `dietTracker.customFoods.v1` | 직접 등록한 음식 |
| `dietTracker.favorites.v1` | 즐겨찾기 음식 id 목록 |
| `dietTracker.recent.v1` | 최근 추가한 음식 id 목록 (최대 20개) |

- 데이터는 **브라우저와 기기별로** 따로 저장됩니다. 휴대폰과 PC, Chrome과 Safari는 서로 다른 기록을 가집니다. 시크릿 모드나 브라우저 데이터 삭제로 기록이 사라질 수 있으니 설정 → `데이터 내보내기`로 정기적으로 백업하세요. 다른 기기로 옮길 때도 백업 파일을 `데이터 가져오기`로 불러오면 됩니다.
- 각 기록에는 추가할 당시의 영양성분(기준 중량당 kcal·탄·단·지)이 **스냅샷**으로 함께 저장됩니다. 그래서 `foods.json` 값을 고치거나 내 음식을 지워도 지난 기록은 바뀌지 않습니다.
- 다른 탭에서 데이터가 바뀌면 열려 있는 탭에도 반영됩니다.

## 음식 데이터 (`data/foods.json`)

최상위 키는 `version`, `unit`, `disclaimer`, `categories`, `foods`입니다. 모든 영양성분은 **가식부 100g 기준**(`baseAmount: 100`)입니다.

```json
{
  "id": "f001",
  "name": "흰쌀밥",
  "aliases": ["쌀밥", "밥", "공기밥", "백미밥"],
  "category": "밥·곡류",
  "baseAmount": 100,
  "kcal": 145,
  "carbs": 31.7,
  "protein": 2.7,
  "fat": 0.3,
  "servingSize": 210,
  "servingLabel": "1공기",
  "source": "식품의약품안전처 식품영양성분 데이터베이스(음식) 대표값 참고"
}
```

| 필드 | 설명 |
| --- | --- |
| `id` | 고유 id (`f001` 형식) |
| `name` | 음식 이름 |
| `aliases` | 검색용 다른 이름 |
| `category` | 카테고리 (`categories` 중 하나) |
| `baseAmount` | 기준 중량(g), 100 |
| `kcal` / `carbs` / `protein` / `fat` | 기준 중량당 칼로리(kcal), 탄수화물·단백질·지방(g) |
| `servingSize` | 1인분 중량(g) |
| `servingLabel` | 1인분 표시 이름 (예: 1공기, 1개) |
| `source` | 참고한 자료 |

**카테고리별 음식 수 (총 268개)**

| 카테고리 | 개수 | 카테고리 | 개수 |
| --- | --: | --- | --: |
| 밥·곡류 | 18 | 패스트푸드 | 12 |
| 한식 | 54 | 채소·과일 | 37 |
| 분식 | 21 | 유제품·계란 | 20 |
| 육류 | 17 | 빵·간식 | 25 |
| 해산물 | 17 | 음료 | 17 |
| 면류 | 16 | 운동·건강식 | 14 |

**참고 자료**

- 식품의약품안전처 식품영양성분 데이터베이스 (음식 111개, 가공식품 35개)
- 농촌진흥청 국가표준식품성분표 (33개)
- USDA FoodData Central (89개)

**정확도 안내**: 위 데이터베이스를 참고해 정리한 **대표 추정값**입니다. 각 값을 실제 DB 레코드와 하나하나 대조해 검증한 것은 아닙니다. 특히 찌개·볶음 같은 조리 음식은 조리법, 재료, 양념, 1인분 크기에 따라 실제 값과 차이가 큽니다. 정확한 값이 필요하면 제품 포장의 영양성분표를 확인하고 `내 음식`으로 직접 등록하세요.

**음식 추가 방법**: `data/foods.json`의 `foods` 배열에 위 형식대로 항목을 추가합니다. `id`는 다른 음식과 겹치지 않게 정하세요(예: 마지막 번호 다음). 기록과 즐겨찾기가 `id`로 음식을 찾기 때문에 이미 있는 음식의 `id`는 바꾸지 않는 것이 좋습니다. `category`는 `categories` 목록에 있는 값을 써야 카테고리 탭에 나타납니다. 수정한 뒤에는 JSON 문법 오류가 없는지 확인하세요.

```bash
python3 -m json.tool data/foods.json > /dev/null && echo OK
```

## AI 분석용 JSON 형식

`AI 분석용 데이터` 메뉴와 `DietTracker.getDailyLog()` / `getRangeLog()`는 같은 형식(`diet-tracker.daily-log/v1`)을 반환합니다. 칼로리는 정수, 탄단지는 소수 첫째 자리로 반올림합니다.

```json
{
  "schema": "diet-tracker.daily-log/v1",
  "generatedAt": "2026-11-24T12:00:00.000Z",
  "timezone": "Asia/Seoul",
  "units": { "energy": "kcal", "macros": "g", "amount": "g" },
  "note": "영양성분은 공공 영양성분 DB를 참고한 대표 추정값이며 ...",
  "days": [
    {
      "date": "2026-11-24",
      "totals": { "kcal": 305, "carbs": 66.6, "protein": 5.7, "fat": 0.6 },
      "goals": { "kcal": 2000, "carbs": 250, "protein": 100, "fat": 65 },
      "goalAchievementPercent": { "kcal": 15.2, "carbs": 26.6, "protein": 5.7, "fat": 1 },
      "remaining": { "kcal": 1696, "carbs": 183.4, "protein": 94.3, "fat": 64.4 },
      "macroEnergyRatioPercent": { "carbs": 90.4, "protein": 7.7, "fat": 1.9 },
      "meals": [
        {
          "meal": "breakfast",
          "label": "아침",
          "totals": { "kcal": 305, "carbs": 66.6, "protein": 5.7, "fat": 0.6 },
          "items": [
            {
              "name": "흰쌀밥",
              "foodId": "f001",
              "amountGrams": 210,
              "servings": 1,
              "servingSizeGrams": 210,
              "nutrition": { "kcal": 305, "carbs": 66.6, "protein": 5.7, "fat": 0.6 },
              "per": { "baseGrams": 100, "kcal": 145, "carbs": 31.7, "protein": 2.7, "fat": 0.3 }
            }
          ]
        },
        { "meal": "lunch", "label": "점심", "totals": { "kcal": 0, "carbs": 0, "protein": 0, "fat": 0 }, "items": [] },
        { "meal": "dinner", "label": "저녁", "totals": { "kcal": 0, "carbs": 0, "protein": 0, "fat": 0 }, "items": [] }
      ]
    }
  ]
}
```

- `goalAchievementPercent`: 목표 대비 섭취 비율(%)
- `remaining`: 목표까지 남은 양(음수면 초과)
- `macroEnergyRatioPercent`: 탄단지가 차지하는 열량 비율(탄·단 4kcal/g, 지 9kcal/g)
- `foodId`: 기본 DB 음식은 `f001` 형식, 내 음식은 `c_`로 시작합니다.

## 향후 확장

지금은 외부 API와 연결되어 있지 않습니다. 위 JSON 형식을 그대로 넘기는 방식으로 다음 기능을 붙일 수 있습니다.

- AI 식단 평가: 하루 또는 일주일 기록을 AI에 보내 균형과 개선점 피드백 받기
- 주간·월간 통계와 그래프
- 당류·나트륨·식이섬유 등 영양성분 항목 확대
- 간식 끼니 추가
- 여러 기기 간 동기화 (현재는 백업 파일로 옮겨야 함)
