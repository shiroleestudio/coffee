import type { BrewLog, Category, Filters, Recipe } from '../types';
import { CATEGORIES } from './labels';

/** 검색 대상 문자열을 하나로 합친다 */
function haystack(r: Recipe): string {
  return [r.title, r.tag, r.author, r.note, r.gear, r.grind, ...(r.grinderSettings ?? []).map((s) => `${s.grinder} ${s.setting}`)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchesFilters(r: Recipe, f: Filters, favorites: ReadonlySet<string>): boolean {
  // roast 'any' 인 레시피는 어떤 배전도 필터에도 걸리도록 둔다 (v1 과 같은 의도)
  if (f.roast !== 'all' && r.roast !== 'any' && r.roast !== f.roast) return false;

  if (f.serve !== 'all' && r.serve !== f.serve) return false;

  // 드리퍼를 고르면 그 드리퍼 레시피만 — 드리퍼가 없는 카테고리(모카포트 등)는 빠진다
  if (f.dripper !== 'all' && r.dripperType !== f.dripper) return false;

  if (f.favoritesOnly && !favorites.has(r.id)) return false;

  const q = f.query.trim().toLowerCase();
  if (q && !q.split(/\s+/).every((term) => haystack(r).includes(term))) return false;

  return true;
}

export function filterRecipes(recipes: Recipe[], f: Filters, favorites: ReadonlySet<string>): Recipe[] {
  return recipes.filter((r) => matchesFilters(r, f, favorites));
}

/** 필터 중 하나라도 기본값이 아닌 게 있는지 */
export function hasActiveFilters(f: Filters): boolean {
  return f.roast !== 'all' || f.serve !== 'all' || f.dripper !== 'all' || f.query.trim() !== '' || f.favoritesOnly;
}

export const defaultFilters: Filters = {
  roast: 'all',
  serve: 'all',
  dripper: 'all',
  query: '',
  favoritesOnly: false,
};

/**
 * 같은 레시피의 HOT/ICE 버전 묶음. 홈 목록은 버전마다 한 줄이 아니라 묶음마다 카드 하나다 —
 * 같은 제목이 목록 위아래에 두 번 나오면 어느 쪽이 어느 쪽인지 읽기 어렵고, 목록이 두 배로 길어진다.
 */
export interface RecipeFamily {
  /** `family` 가 있으면 그것, 없으면 레시피 id */
  key: string;
  /** 카드 제목. HOT 버전 제목을 쓴다 (없으면 첫 버전) */
  title: string;
  /** HOT 이 먼저, ICE 가 다음 */
  variants: Recipe[];
}

/** 레시피를 `family` 로 묶는다. 처음 나온 순서를 지키고, 묶음 안에서는 HOT 이 먼저다. */
export function familiesOf(recipes: Recipe[]): RecipeFamily[] {
  const byKey = new Map<string, Recipe[]>();
  for (const r of recipes) {
    const key = r.family ?? r.id;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  return [...byKey].map(([key, list]) => {
    const variants = [...list].sort((a, b) => (a.serve === b.serve ? 0 : a.serve === 'hot' ? -1 : 1));
    return { key, title: variants[0]!.title, variants };
  });
}

export interface RecipeGroup {
  category: Category;
  label: string;
  families: RecipeFamily[];
  /** 이 구역의 레시피(버전) 수 */
  count: number;
}

/** 묶음 안의 버전 중 하나라도 즐겨찾기면 묶음이 즐겨찾기다 */
export const isFavoriteFamily = (f: RecipeFamily, favorites: ReadonlySet<string>) =>
  f.variants.some((r) => favorites.has(r.id));

/**
 * 홈 목록의 묶음. 카테고리 탭 대신 카테고리별 구역으로 보여준다 — 레시피가 없는 카테고리는
 * 구역을 만들지 않는다(빈 탭이 화면 한 줄을 차지하던 것을 없앤다). 구역 안에서는 HOT/ICE 를
 * 한 카드로 묶고, 즐겨찾기 묶음이 먼저 오고, 나머지는 원래 순서를 지킨다.
 */
export function groupRecipes(recipes: Recipe[], favorites: ReadonlySet<string>): RecipeGroup[] {
  return CATEGORIES.map((cat) => {
    const inCat = recipes.filter((r) => r.category === cat.id);
    const families = familiesOf(inCat);
    const starred = families.filter((f) => isFavoriteFamily(f, favorites));
    const rest = families.filter((f) => !isFavoriteFamily(f, favorites));
    return { category: cat.id, label: cat.label, families: [...starred, ...rest], count: inCat.length };
  }).filter((g) => g.count > 0);
}

/**
 * 최근에 내린 레시피 — 기록에서 최신순으로, 레시피마다 한 번씩, 아직 있는 레시피만.
 * 홈 맨 위의 "최근" 줄이 된다: 늘 내리는 레시피로 가는 가장 짧은 길.
 */
export function recentRecipes(logs: BrewLog[], recipes: Recipe[], limit = 4): Recipe[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const out: Recipe[] = [];
  for (const log of [...logs].sort((a, b) => b.brewedAt.localeCompare(a.brewedAt))) {
    if (seen.has(log.recipeId)) continue;
    seen.add(log.recipeId);
    const r = byId.get(log.recipeId);
    if (r) out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
