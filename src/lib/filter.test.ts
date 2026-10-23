import { describe, expect, it } from 'vitest';
import { defaultFilters, familiesOf, filterRecipes, groupRecipes, hasActiveFilters, recentRecipes } from './filter';
import type { BrewLog, Recipe } from '../types';
import { seedRecipes } from '../data/recipes';
import type { Filters } from '../types';

const none = new Set<string>();
const f = (over: Partial<Filters> = {}): Filters => ({ ...defaultFilters, ...over });

describe('filterRecipes', () => {
  it('기본 상태에서 드립 레시피를 모두 보여준다', () => {
    expect(filterRecipes(seedRecipes, f(), none)).toHaveLength(17);
  });

  it('드리퍼를 고르면 드리퍼가 없는 레시피는 빠진다', () => {
    const { dripperType: _drop, ...rest } = seedRecipes[0]!;
    void _drop;
    const moka: Recipe = { ...rest, id: 'm', category: 'mokapot' };
    const all = [...seedRecipes, moka];
    expect(filterRecipes(all, f(), none)).toHaveLength(18);
    expect(filterRecipes(all, f({ dripper: 'v60' }), none).some((r) => r.id === 'm')).toBe(false);
  });

  it('HOT/ICE 로 가른다', () => {
    expect(filterRecipes(seedRecipes, f({ serve: 'hot' }), none)).toHaveLength(8);
    expect(filterRecipes(seedRecipes, f({ serve: 'ice' }), none)).toHaveLength(9);
  });

  it('배전도 any 레시피는 어떤 배전도 필터에도 함께 나온다', () => {
    const light = filterRecipes(seedRecipes, f({ roast: 'light' }), none);
    expect(light.map((r) => r.id)).toContain('v60-clean-hot'); // roast: 'any'
    expect(light.map((r) => r.id)).toContain('4666-v2-hot'); // roast: 'light'
    expect(light.map((r) => r.id)).not.toContain('484-original-hot'); // roast: 'dark'
  });

  it('드리퍼로 가른다', () => {
    const kalita = filterRecipes(seedRecipes, f({ dripper: 'kalita' }), none);
    expect(kalita.every((r) => r.dripperType === 'kalita')).toBe(true);
    expect(kalita).toHaveLength(2); // 리이케 핫/아이스 — 484 는 원문대로 V60
  });

  it('필터를 겹쳐 쓸 수 있다', () => {
    const got = filterRecipes(seedRecipes, f({ serve: 'ice', roast: 'dark', dripper: 'v60' }), none);
    // 범용(any) 배전도 레시피는 다크 필터에도 함께 나온다
    expect(got.map((r) => r.id)).toEqual(['v60-clean-ice', 'jungins-ice', '484-ice']);
  });

  it('제목·작성자·메모·그라인더 세팅을 검색한다', () => {
    expect(filterRecipes(seedRecipes, f({ query: '카스야' }), none)).toHaveLength(2);
    expect(filterRecipes(seedRecipes, f({ query: '용챔' }), none)).toHaveLength(2);
    expect(filterRecipes(seedRecipes, f({ query: 'EK43' }), none)).toHaveLength(3);
    expect(filterRecipes(seedRecipes, f({ query: '교반' }), none)).toHaveLength(2);
  });

  it('검색어는 대소문자를 가리지 않고, 공백으로 나눠 모두 포함해야 한다', () => {
    expect(filterRecipes(seedRecipes, f({ query: 'ek43' }), none)).toHaveLength(3);
    expect(filterRecipes(seedRecipes, f({ query: '안스타 8인분' }), none)).toHaveLength(2);
    expect(filterRecipes(seedRecipes, f({ query: '안스타 존재하지않음' }), none)).toHaveLength(0);
  });

  it('즐겨찾기만 보기', () => {
    const favs = new Set(['4666-v2-hot', '484-ice']);
    const got = filterRecipes(seedRecipes, f({ favoritesOnly: true }), favs);
    expect(got.map((r) => r.id).sort()).toEqual(['4666-v2-hot', '484-ice']);
  });
});

describe('hasActiveFilters', () => {
  it('기본값은 필터가 아니다', () => {
    expect(hasActiveFilters(f())).toBe(false);
  });
  it('나머지는 필터로 센다', () => {
    expect(hasActiveFilters(f({ roast: 'dark' }))).toBe(true);
    expect(hasActiveFilters(f({ query: '  ' }))).toBe(false);
    expect(hasActiveFilters(f({ query: '카스야' }))).toBe(true);
    expect(hasActiveFilters(f({ favoritesOnly: true }))).toBe(true);
  });
});

/** family 가 없는 레시피 */
const solo = (): Recipe => {
  const { family: _f, ...rest } = seedRecipes[0]!;
  void _f;
  return rest;
};

describe('familiesOf', () => {
  it('HOT/ICE 버전을 한 묶음으로, HOT 을 먼저 둔다', () => {
    const fams = familiesOf(seedRecipes);
    // 8쌍 + 정인성 아이스 드립(ICE 만)
    expect(fams).toHaveLength(9);
    const v60 = fams.find((f) => f.key === 'v60-clean')!;
    expect(v60.variants.map((r) => r.serve)).toEqual(['hot', 'ice']);
    expect(v60.title).toBe('하리오 V60 깔끔 레시피');
    expect(fams.find((f) => f.key === 'jungins-ice')!.variants).toHaveLength(1);
  });

  it('ICE 가 먼저 들어와도 HOT 이 앞에 서고 제목은 HOT 것이다', () => {
    const hot = seedRecipes.find((r) => r.id === '484-original-hot')!;
    const ice = seedRecipes.find((r) => r.id === '484-ice')!;
    const [fam] = familiesOf([ice, hot]);
    expect(fam!.variants.map((r) => r.id)).toEqual(['484-original-hot', '484-ice']);
    expect(fam!.title).toBe('484 오리지널');
  });

  it('family 가 없는 레시피는 혼자 묶음이다', () => {
    const a: Recipe = { ...solo(), id: 'a' };
    const b: Recipe = { ...solo(), id: 'b' };
    expect(familiesOf([a, b]).map((f) => f.key)).toEqual(['a', 'b']);
  });
});

describe('groupRecipes', () => {
  it('레시피가 있는 카테고리만 구역이 되고, 즐겨찾기 묶음이 먼저 온다', () => {
    const groups = groupRecipes(seedRecipes, none);
    expect(groups.map((g) => g.category)).toEqual(['drip']);
    expect(groups[0]!.count).toBe(17);
    expect(groups[0]!.families).toHaveLength(9);

    // ICE 버전만 즐겨찾기여도 묶음 전체가 앞으로 온다
    const starred = groupRecipes(seedRecipes, new Set(['484-ice']));
    expect(starred[0]!.families[0]!.key).toBe('484');
    // 나머지는 원래 순서
    expect(starred[0]!.families.slice(1).map((f) => f.key)).toEqual(
      familiesOf(seedRecipes).map((f) => f.key).filter((k) => k !== '484'),
    );
  });

  it('조건으로 걸러진 버전은 묶음에서도 빠진다', () => {
    const ice = groupRecipes(filterRecipes(seedRecipes, f({ serve: 'ice' }), none), none);
    expect(ice[0]!.families.every((fam) => fam.variants.every((r) => r.serve === 'ice'))).toBe(true);
  });

  it('카테고리 순서는 CATEGORIES 를 따른다', () => {
    const moka: Recipe = { ...solo(), id: 'm', category: 'mokapot' };
    const esp: Recipe = { ...solo(), id: 'e', category: 'espresso' };
    expect(groupRecipes([esp, moka, ...seedRecipes], none).map((g) => g.category)).toEqual(['drip', 'mokapot', 'espresso']);
  });
});

describe('recentRecipes', () => {
  const log = (recipeId: string, brewedAt: string): BrewLog => ({
    id: `${recipeId}-${brewedAt}`,
    recipeId,
    recipeTitle: recipeId,
    brewedAt,
    beanG: 15,
    waterG: 200,
    tempC: 92,
  });
  const a = seedRecipes[0]!;
  const b = seedRecipes[1]!;

  it('최신순, 레시피마다 한 번, 지워진 레시피는 뺀다', () => {
    const logs = [log(a.id, '2026-01-01'), log(b.id, '2026-01-03'), log(a.id, '2026-01-02'), log('gone', '2026-01-04')];
    expect(recentRecipes(logs, seedRecipes).map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('limit 을 지킨다', () => {
    const logs = seedRecipes.slice(0, 6).map((r, i) => log(r.id, `2026-01-0${i + 1}`));
    expect(recentRecipes(logs, seedRecipes, 4)).toHaveLength(4);
  });
});
