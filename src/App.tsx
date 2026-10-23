import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Bean, BrewLog, Filters, Recipe } from './types';
import { seedRecipes } from './data/recipes';
import { defaultFilters, filterRecipes, groupRecipes, hasActiveFilters, isFavoriteFamily, recentRecipes } from './lib/filter';
import { KEYS, STORAGE_ERROR_EVENT } from './lib/storage';
import { useServiceWorkerUpdate } from './hooks/useServiceWorkerUpdate';
import { isBean, isBrewLog, isRecipe, sanitizeList } from './lib/validate';

/** 저장 데이터 중 모양이 깨져 걸러낸 항목 수. 0 이 아니면 배너로 알린다 */
let droppedOnLoad = 0;
const keepRecipes = (raw: unknown): Recipe[] => {
  const r = sanitizeList(raw, isRecipe);
  droppedOnLoad += r.dropped;
  return r.items;
};
const keepLogs = (raw: unknown): BrewLog[] => {
  const r = sanitizeList(raw, isBrewLog);
  droppedOnLoad += r.dropped;
  return r.items;
};
const keepBeans = (raw: unknown): Bean[] => {
  const r = sanitizeList(raw, isBean);
  droppedOnLoad += r.dropped;
  return r.items;
};
import { usePersistentState } from './hooks/usePersistentState';
import { Icon } from './components/Icon';
import { FilterBar } from './components/FilterBar';
import { RecipeCard } from './components/RecipeCard';
import { BottomNav, type View } from './components/BottomNav';
import { RecipeDetail } from './components/RecipeDetail';
import { RecipeForm } from './components/RecipeForm';
import { SettingsSheet } from './components/SettingsSheet';
import { BrewLogForm } from './components/BrewLogForm';
import { BeansView } from './components/BeansView';
import { LogsView } from './components/LogsView';
import { logsForRecipe } from './lib/dialIn';
import { type Calibration, calibrationForBean, findGrinder } from './lib/grinders';
import { ActiveBeanPicker } from './components/ActiveBeanPicker';
import { Mascot, MascotFace } from './components/Mascot';
import { DEFAULT_THEME, type ThemePref, applyTheme } from './lib/theme';
import { type PourMotionPref, PourMotionContext } from './hooks/usePourMotion';

type Sheet =
  | { kind: 'detail'; id: string }
  | { kind: 'form'; id: string | null }
  | { kind: 'settings' }
  | {
      kind: 'log';
      recipeId: string;
      logId: string | null;
      actualSec?: number;
      /** 닫았을 때 돌아갈 곳. 기록 탭에서 열었으면 레시피 상세를 띄우지 않는다 */
      returnTo: 'detail' | 'none';
    }
  | null;

export default function App() {
  const [view, setView] = useState<View>('recipes');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sheet, setSheet] = useState<Sheet>(null);

  const [favoriteIds, setFavoriteIds] = usePersistentState<string[]>(KEYS.favorites, []);
  const [customRecipes, setCustomRecipes] = usePersistentState<Recipe[]>(KEYS.customRecipes, [], keepRecipes);
  const [myGrinder, setMyGrinder] = usePersistentState<string | null>(KEYS.myGrinder, 'femobook-a2');
  const [soundOn, setSoundOn] = usePersistentState<boolean>(KEYS.soundOn, true);
  const [brewLogs, setBrewLogs] = usePersistentState<BrewLog[]>(KEYS.brewLogs, [], keepLogs);
  const [beans, setBeans] = usePersistentState<Bean[]>(KEYS.beans, [], keepBeans);
  // 첫 렌더에서 걸러낸 수를 고정해 둔다 (이후 저장은 앱이 만든 값이라 깨질 일이 없다)
  const [dropped] = useState(() => droppedOnLoad);
  const [calibration, setCalibration] = usePersistentState<Calibration>(KEYS.grinderCalibration, {});

  const [activeBeanId, setActiveBeanId] = usePersistentState<string | null>(KEYS.activeBean, null);
  const [theme, setTheme] = usePersistentState<ThemePref>(KEYS.theme, DEFAULT_THEME);
  const [pourMotion, setPourMotion] = usePersistentState<PourMotionPref>(KEYS.pourMotion, 'auto');
  useEffect(() => applyTheme(theme), [theme]);

  // 저장 실패(용량 초과·시크릿 모드)는 조용히 넘기지 않는다 — 기록이 남은 줄 알았는데 없으면 안 되므로
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    const onError = () => setStorageFailed(true);
    window.addEventListener(STORAGE_ERROR_EVENT, onError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onError);
  }, []);
  const swUpdated = useServiceWorkerUpdate();

  /** 설정에 저장된 그라인더 id 를 프로필로 */
  const myGrinderProfile = useMemo(() => findGrinder(myGrinder), [myGrinder]);

  /** 지금 쓰는 원두 (다 마신 원두는 제외) */
  const activeBean = beans.find((b) => b.id === activeBeanId && !b.finished);

  /** 화면의 모든 환산에 쓰이는 기준 — 지금 원두의 기준점이 설정 보정값 위에 얹힌다 */
  const effectiveCalibration = useMemo(() => calibrationForBean(calibration, activeBean), [calibration, activeBean]);
  const fallbackAnchor = myGrinderProfile ? (calibration[myGrinderProfile.id] ?? myGrinderProfile.v60Anchor) : null;

  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const allRecipes = useMemo(() => [...seedRecipes, ...customRecipes], [customRecipes]);
  const visible = useMemo(() => filterRecipes(allRecipes, filters, favorites), [allRecipes, filters, favorites]);
  const groups = useMemo(() => groupRecipes(visible, favorites), [visible, favorites]);
  const filtering = hasActiveFilters(filters);
  /** 홈 맨 위의 "최근 내린" — 조건을 걸지 않았을 때만. 늘 내리는 레시피로 가는 가장 짧은 길 */
  const recent = useMemo(() => (filtering ? [] : recentRecipes(brewLogs, allRecipes)), [filtering, brewLogs, allRecipes]);

  const patch = useCallback((p: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...p })), []);

  const toggleFavorite = useCallback(
    (id: string) => setFavoriteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [setFavoriteIds],
  );

  /** 카드의 당근은 HOT/ICE 묶음 전체를 켜고 끈다 (상세 시트의 당근은 그 버전만) */
  const setFamilyFavorite = useCallback(
    (ids: string[], on: boolean) =>
      setFavoriteIds((prev) => (on ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x)))),
    [setFavoriteIds],
  );

  const saveRecipe = (recipe: Recipe) => {
    setCustomRecipes((prev) => {
      const at = prev.findIndex((r) => r.id === recipe.id);
      if (at === -1) return [...prev, recipe];
      return prev.map((r) => (r.id === recipe.id ? recipe : r));
    });
    setSheet({ kind: 'detail', id: recipe.id });
  };

  const deleteRecipe = (id: string) => {
    const title = allRecipes.find((r) => r.id === id)?.title ?? '이 레시피';
    if (!window.confirm(`'${title}' 레시피를 지울까요? 이 레시피로 남긴 기록은 그대로 남습니다.`)) return;
    setCustomRecipes((prev) => prev.filter((r) => r.id !== id));
    setFavoriteIds((prev) => prev.filter((x) => x !== id));
    setSheet(null);
  };

  const saveLog = (log: BrewLog) => {
    setBrewLogs((prev) => {
      const at = prev.findIndex((l) => l.id === log.id);
      return at === -1 ? [...prev, log] : prev.map((l) => (l.id === log.id ? log : l));
    });
    setSheet(null);
  };

  const saveBean = (bean: Bean) =>
    setBeans((prev) => {
      const at = prev.findIndex((b) => b.id === bean.id);
      return at === -1 ? [...prev, bean] : prev.map((b) => (b.id === bean.id ? bean : b));
    });

  /** 백업 불러오기 — 같은 id 는 덮어쓰고 나머지는 합친다 */
  const importBackup = (data: { recipes?: Recipe[]; logs?: BrewLog[]; beans?: Bean[] }) => {
    const merge = <T extends { id: string }>(prev: T[], incoming: T[] | undefined): T[] => {
      if (!incoming?.length) return prev;
      const byId = new Map(prev.map((x) => [x.id, x]));
      incoming.forEach((x) => byId.set(x.id, x));
      return [...byId.values()];
    };
    if (data.recipes?.length)
      setCustomRecipes((prev) => merge(prev, data.recipes!.map((r) => ({ ...r, custom: true }))));
    if (data.logs?.length) setBrewLogs((prev) => merge(prev, data.logs));
    if (data.beans?.length) setBeans((prev) => merge(prev, data.beans));
  };

  const detailRecipe = sheet?.kind === 'detail' ? allRecipes.find((r) => r.id === sheet.id) : undefined;
  /**
   * 기록 폼이 기대는 레시피. 레시피가 지워졌어도 기록은 남고 고칠 수 있어야 하므로,
   * 없으면 기록에 복사돼 있던 값으로 껍데기를 만든다.
   */
  const logSheetRecipe = (() => {
    if (sheet?.kind !== 'log') return undefined;
    const found = allRecipes.find((r) => r.id === sheet.recipeId);
    if (found) return found;
    const log = sheet.logId ? brewLogs.find((l) => l.id === sheet.logId) : undefined;
    if (!log) return undefined;
    const stub: Recipe = {
      id: log.recipeId,
      title: `${log.recipeTitle} (지워진 레시피)`,
      category: 'drip',
      serve: 'hot',
      roast: 'any',
      beanG: log.beanG,
      waterG: log.waterG,
      tempC: log.tempC,
      grind: '—',
      gear: '—',
      totalSec: log.actualSec ?? 0,
      steps: [],
    };
    return stub;
  })();
  const logReturnsToDetail = sheet?.kind === 'log' && sheet.returnTo === 'detail' && allRecipes.some((r) => r.id === sheet.recipeId);
  const editingRecipe = sheet?.kind === 'form' && sheet.id ? allRecipes.find((r) => r.id === sheet.id) : undefined;
  const sibling =
    detailRecipe?.family !== undefined
      ? allRecipes.find((r) => r.family === detailRecipe.family && r.id !== detailRecipe.id)
      : undefined;

  return (
    <PourMotionContext.Provider value={pourMotion}>
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            {/* 시로 — 빅 히스토리 연표와 같은 자리, 같은 얼굴 */}
            <MascotFace size={40} className="drop-shadow-[0_2px_3px_rgb(58_42_36_/_0.18)]" />
            <div className="leading-none">
              <p className="eyebrow text-[9.5px]">Home Brew Bar</p>
              <h1 className="hand mt-0.5 text-[24px] leading-none tracking-tight text-ink">My Coffee Recipe</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSheet({ kind: 'settings' })}
            aria-label={`설정${myGrinderProfile ? ` (${myGrinderProfile.name})` : ''}`}
            title={myGrinderProfile ? `설정 · ${myGrinderProfile.name}` : '설정'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-card text-ink-soft shadow-card transition hover:text-ink"
          >
            <Icon name="grinder" size={18} />
          </button>
        </div>
      </header>

      {storageFailed && (
        <div role="alert" className="mx-auto max-w-4xl px-5 pt-4">
          <p className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            저장이 되지 않습니다. 시크릿 모드이거나 저장 공간이 찼을 수 있습니다 — 기록과 설정이 이 화면을 닫으면
            사라집니다. 설정 → 백업에서 내보내 두세요.
          </p>
        </div>
      )}
      {dropped > 0 && (
        <div role="alert" className="mx-auto max-w-4xl px-5 pt-4">
          <p className="rounded-xl border border-crema/25 bg-crema-soft px-4 py-3 text-sm text-ink">
            저장된 항목 {dropped}개의 모양이 맞지 않아 건너뛰었습니다. 손으로 고친 백업 파일을 불러왔다면 그 항목을
            확인해 주세요. 다음 저장 때 목록에서 빠집니다.
          </p>
        </div>
      )}
      {swUpdated && (
        <div className="mx-auto max-w-4xl px-5 pt-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-sage/25 bg-sage-soft px-4 py-2.5 text-sm">
            <span className="font-semibold text-ink">새 버전이 준비됐습니다.</span>
            <button
              type="button"
              onClick={() => location.reload()}
              className="shrink-0 rounded-lg bg-sage px-3 py-1.5 text-xs font-bold text-card hover:opacity-90"
            >
              새로고침
            </button>
          </div>
        </div>
      )}

      {view === 'logs' && (
        <main className="mx-auto max-w-4xl px-5 pt-5">
          <LogsView
            logs={brewLogs}
            beans={beans}
            onOpenRecipe={(recipeId) => {
              setView('recipes');
              setSheet({ kind: 'detail', id: recipeId });
            }}
            onEdit={(log) => setSheet({ kind: 'log', recipeId: log.recipeId, logId: log.id, returnTo: 'none' })}
            onDelete={(id) => setBrewLogs((prev) => prev.filter((l) => l.id !== id))}
          />
        </main>
      )}

      {view === 'beans' && (
        <main className="mx-auto max-w-4xl px-5 pt-5">
          <BeansView
            beans={beans}
            logs={brewLogs}
            myGrinder={myGrinderProfile}
            activeBeanId={activeBean?.id ?? null}
            onActivate={setActiveBeanId}
            onSave={saveBean}
            onDelete={(id) => {
              setBeans((prev) => prev.filter((b) => b.id !== id));
              if (activeBeanId === id) setActiveBeanId(null);
            }}
          />
        </main>
      )}

      <main className={`mx-auto max-w-4xl px-5 pt-4 ${view === 'recipes' ? '' : 'hidden'}`}>
        <FilterBar filters={filters} onChange={patch} favoriteCount={favorites.size} />

        <div className="mt-3">
          <ActiveBeanPicker
            beans={beans}
            activeBeanId={activeBeanId}
            onChange={setActiveBeanId}
            myGrinder={myGrinderProfile}
            fallbackAnchor={fallbackAnchor}
          />
        </div>

        {/* 최근 내린 레시피 — 한 번 탭으로 상세·타이머까지 */}
        {recent.length > 0 && (
          <section aria-label="최근 내린 레시피" className="mt-5">
            <h2 className="hand mb-2 text-[20px] leading-none text-ink">최근 내린</h2>
            <div className="scrollbar-hide -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
              {recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSheet({ kind: 'detail', id: r.id })}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-sm font-bold text-ink shadow-card transition hover:border-line-strong"
                >
                  <span className={`h-2 w-2 rounded-full ${r.serve === 'hot' ? 'bg-hot' : 'bg-ice'}`} aria-hidden="true" />
                  {r.title}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 카테고리별 구역 — 레시피가 있는 카테고리만. 구역 안에서는 즐겨찾기가 먼저 */}
        {groups.length > 0 ? (
          <div className="mt-5 space-y-6">
            {groups.map((g) => (
              <section key={g.category} aria-label={g.label}>
                <div className="mb-2 flex items-end justify-between gap-3 px-1">
                  {/* 귀 표식 — 연표의 시대 머리와 같은 섹션 머리 */}
                  <div className="flex items-end gap-2.5">
                    <span className="ear-mark" aria-hidden="true" />
                    <h2 className="hand text-[22px] leading-none text-ink">{g.label}</h2>
                  </div>
                  <p className="text-xs text-ink-soft">
                    <span className="num font-bold text-ink">{g.families.length}</span>가지
                  </p>
                </div>
                <div className="space-y-3">
                  {g.families.map((family) => {
                    const fav = isFavoriteFamily(family, favorites);
                    return (
                      <RecipeCard
                        key={family.key}
                        family={family}
                        favorite={fav}
                        myGrinder={myGrinderProfile}
                        calibration={effectiveCalibration}
                        onOpen={(id) => setSheet({ kind: 'detail', id })}
                        onToggleFavorite={() => setFamilyFavorite(family.variants.map((r) => r.id), !fav)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              filtered={filtering}
              onResetFilters={() => setFilters(defaultFilters)}
              onAdd={() => setSheet({ kind: 'form', id: null })}
            />
          </div>
        )}
      </main>

      {/* 레시피 추가 */}
      <button
        type="button"
        hidden={view !== 'recipes'}
        onClick={() => setSheet({ kind: 'form', id: null })}
        aria-label="레시피 추가"
        title="레시피 추가"
        className="fixed right-5 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 grid h-14 w-14 place-items-center rounded-full bg-ink text-canvas shadow-float transition hover:opacity-90"
      >
        {/* 둥근 + 하나 — 글자 단추는 목록 오른쪽 수치 칸을 가렸다 */}
        <Icon name="plus" size={24} />
      </button>

      <BottomNav
        view={view}
        onChange={setView}
        counts={{ logs: brewLogs.length, beans: beans.filter((b) => !b.finished).length }}
      />

      {detailRecipe && (
        <RecipeDetail
          key={detailRecipe.id}
          recipe={detailRecipe}
          sibling={sibling}
          onSwitchTo={(id) => setSheet({ kind: 'detail', id })}
          onClose={() => setSheet(null)}
          favorite={favorites.has(detailRecipe.id)}
          onToggleFavorite={() => toggleFavorite(detailRecipe.id)}
          soundOn={soundOn}
          onEdit={detailRecipe.custom ? () => setSheet({ kind: 'form', id: detailRecipe.id }) : undefined}
          onDelete={detailRecipe.custom ? () => deleteRecipe(detailRecipe.id) : undefined}
          logs={logsForRecipe(brewLogs, detailRecipe.id)}
          onLogBrew={(actualSec) =>
            setSheet({ kind: 'log', recipeId: detailRecipe.id, logId: null, actualSec, returnTo: 'detail' })
          }
          onOpenLog={(log) => setSheet({ kind: 'log', recipeId: log.recipeId, logId: log.id, returnTo: 'detail' })}
          myGrinder={myGrinderProfile}
          calibration={effectiveCalibration}
          beanPicker={
            <ActiveBeanPicker
              beans={beans}
              activeBeanId={activeBeanId}
              onChange={setActiveBeanId}
              myGrinder={myGrinderProfile}
              fallbackAnchor={fallbackAnchor}
            />
          }
        />
      )}

      {sheet?.kind === 'form' && (
        <RecipeForm
          initial={editingRecipe}
          defaultCategory="drip"
          onSave={saveRecipe}
          onClose={() => setSheet(editingRecipe ? { kind: 'detail', id: editingRecipe.id } : null)}
        />
      )}

      {sheet?.kind === 'log' && logSheetRecipe && (
        <BrewLogForm
          recipe={logSheetRecipe}
          beans={beans}
          actualSec={sheet.actualSec}
          existing={sheet.logId ? brewLogs.find((l) => l.id === sheet.logId) : undefined}
          myGrinder={myGrinderProfile}
          calibration={effectiveCalibration}
          defaultBeanId={activeBean?.id}
          onSave={saveLog}
          onClose={() => setSheet(logReturnsToDetail ? { kind: 'detail', id: sheet.recipeId } : null)}
        />
      )}

      {sheet?.kind === 'settings' && (
        <SettingsSheet
          onClose={() => setSheet(null)}
          myGrinder={myGrinder}
          onMyGrinderChange={setMyGrinder}
          calibration={calibration}
          onCalibrationChange={setCalibration}
          soundOn={soundOn}
          onSoundChange={setSoundOn}
          theme={theme}
          onThemeChange={setTheme}
          pourMotion={pourMotion}
          onPourMotionChange={setPourMotion}
          customRecipes={customRecipes}
          brewLogs={brewLogs}
          beans={beans}
          onImport={importBackup}
        />
      )}
    </div>
    </PourMotionContext.Provider>
  );
}

function EmptyState({ filtered, onResetFilters, onAdd }: { filtered: boolean; onResetFilters: () => void; onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <Mascot pose="idle" size={180} paper="var(--color-canvas)" className="mx-auto text-ink-soft" />
      {filtered ? (
        <>
          <p className="mt-3 font-semibold text-ink-soft">조건에 맞는 레시피가 없습니다.</p>
          <button type="button" onClick={onResetFilters} className="mt-3 text-sm font-semibold text-crema hover:underline">
            필터 초기화
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 font-semibold text-ink-soft">레시피가 아직 없습니다.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-faint">
            직접 쓰는 레시피를 추가하면 여기에 쌓이고, 브라우저에 저장됩니다. 설정에서 JSON 으로 내보내
            저장소의 기본 레시피로 옮겨 심을 수도 있습니다.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-crema px-4 py-2.5 text-sm font-bold text-on-crema hover:bg-crema-deep"
          >
            <Icon name="plus" size={16} />
            레시피 추가
          </button>
        </>
      )}
    </div>
  );
}
