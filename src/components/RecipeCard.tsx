import type { Recipe } from '../types';
import type { RecipeFamily } from '../lib/filter';
import { formatSec } from '../lib/brew';
import { roastLabel } from '../lib/labels';
import type { Calibration, GrinderProfile } from '../lib/grinders';
import { Icon } from './Icon';
import { GrindSetting } from './GrindSetting';

interface Props {
  family: RecipeFamily;
  favorite: boolean;
  onOpen: (recipeId: string) => void;
  onToggleFavorite: () => void;
  /** 내가 쓰는 그라인더. 레시피 값을 이 그라인더 기준으로 환산해 보여준다. */
  myGrinder: GrinderProfile | undefined;
  calibration: Calibration;
}

const serveLabel = (r: Recipe) => (r.serve === 'hot' ? 'HOT' : 'ICE');

/** 버전마다 배전도가 같으면 하나만, 다르면 버전별로 밝힌다 (카스야 4:6 은 HOT 중배전, ICE 약배전) */
function metaLine(family: RecipeFamily): string[] {
  const { variants } = family;
  const roasts = new Set(variants.map((r) => r.roast));
  const parts =
    roasts.size === 1
      ? [roastLabel(variants[0]!.roast)]
      : variants.map((r) => `${serveLabel(r)} ${roastLabel(r.roast)}`);
  const tag = variants[0]!.tag;
  if (tag) parts.push(tag);
  return parts;
}

/** 라벨 줄과 버전 줄이 같은 칸을 쓰도록 한 곳에서 정한다 */
const GRID = 'grid grid-cols-[3rem_repeat(4,minmax(0,1fr))_1rem] items-center gap-x-1';

/**
 * 홈 목록의 카드 하나 = 레시피 하나(HOT/ICE 버전 묶음).
 *
 * 전에는 버전마다 한 줄이라 같은 제목이 목록 위아래에 두 번 나왔고, 한 줄에 제목·메타·수치·분쇄도가
 * 같은 크기로 네다섯 줄 쌓여 무엇이 무엇인지 읽히지 않았다. 지금은
 * - 제목은 한 번, 위에 크게
 * - 수치는 '원두 · 물 · 온도 · 시간' 라벨 아래 표로 — HOT 과 ICE 가 같은 칸에 서서 바로 비교된다
 * - 분쇄도는 수치 아래 한 줄 (환산값 옆에 원본을 늘 남긴다)
 * 버전 줄 전체가 그 버전의 상세를 여는 버튼이다.
 */
export function RecipeCard({ family, favorite, onOpen, onToggleFavorite, myGrinder, calibration }: Props) {
  const first = family.variants[0]!;
  const custom = family.variants.some((r) => r.custom);
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex items-start gap-2 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] leading-snug font-bold text-ink">
            <button
              type="button"
              onClick={() => onOpen(first.id)}
              className="text-left outline-none hover:text-crema focus-visible:text-crema"
            >
              {family.title}
            </button>
          </h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {metaLine(family).join(' · ')}
            {custom && <span className="font-bold text-sage"> · 내 레시피</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={`${family.title} 즐겨찾기 ${favorite ? '해제' : '추가'}`}
          className={`-mt-1.5 -mr-2 rounded-lg p-2 transition-colors ${favorite ? 'animate-hop text-carrot' : 'text-ink-faint hover:text-ink-soft'}`}
        >
          {/* 당근 = 즐겨찾기. 연표에서 켜진 칸에 당근이 놓이는 것과 같은 말 */}
          <Icon name="carrot" size={20} filled={favorite} />
        </button>
      </div>

      <div className="px-2 pt-2 pb-2">
        <div className={`${GRID} px-2 pb-1 text-xs text-ink-faint`} aria-hidden="true">
          <span />
          <span>원두</span>
          <span>물</span>
          <span>온도</span>
          <span>시간</span>
          <span />
        </div>
        <ul className="space-y-1">
          {family.variants.map((r) => {
            const hot = r.serve === 'hot';
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  aria-label={`${r.title} ${serveLabel(r)} 열기`}
                  className="w-full rounded-xl bg-well px-2 py-2 text-left transition-colors hover:bg-crema-soft focus-visible:bg-crema-soft focus-visible:outline-none"
                >
                  <span className={GRID}>
                    <span
                      className={`justify-self-start rounded-md px-1.5 py-0.5 text-xs font-bold ${hot ? 'bg-hot-soft text-hot' : 'bg-ice-soft text-ice'}`}
                    >
                      {serveLabel(r)}
                    </span>
                    <span className="num text-[17px] text-ink">{r.beanG}g</span>
                    <span className="num text-[17px] text-ink">{r.waterG}g</span>
                    <span className="num text-[17px] text-ink">{r.tempC}℃</span>
                    <span className="num text-[17px] text-ink">{formatSec(r.totalSec)}</span>
                    <Icon name="chevron" size={16} className="text-ink-faint" />
                  </span>
                  <span className="mt-1 block pl-[3.25rem] text-xs leading-snug text-ink-soft">
                    <GrindSetting
                      settings={r.grinderSettings ?? []}
                      myGrinder={myGrinder}
                      calibration={calibration}
                      fallback={r.grind}
                      compact
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
