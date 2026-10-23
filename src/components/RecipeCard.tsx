import type { Recipe } from '../types';
import type { RecipeFamily } from '../lib/filter';
import { formatSec } from '../lib/brew';
import { roastLabel } from '../lib/labels';
import { Icon } from './Icon';

interface Props {
  family: RecipeFamily;
  favorite: boolean;
  onOpen: (recipeId: string) => void;
  onToggleFavorite: () => void;
}

const serveLabel = (r: Recipe) => (r.serve === 'hot' ? 'HOT' : 'ICE');

/** 버전마다 배전도가 같으면 하나만, 다르면 버전별로 밝힌다 (카스야 4:6 은 HOT 중배전, ICE 약배전) */
function metaLine(family: RecipeFamily): string {
  const { variants } = family;
  const roasts = new Set(variants.map((r) => r.roast));
  const parts =
    roasts.size === 1
      ? [roastLabel(variants[0]!.roast)]
      : variants.map((r) => `${serveLabel(r)} ${roastLabel(r.roast)}`);
  const tag = variants[0]!.tag;
  if (tag) parts.push(tag);
  return parts.join(' · ');
}

/**
 * 홈 목록의 타일 하나 = 레시피 하나(HOT/ICE 버전 묶음). 두 줄 격자로 놓인다.
 *
 * 목록은 **고르는** 곳이라 타일에는 고르는 데 필요한 것만 둔다: 제목, 배전도·태그, 그리고 버전 단추
 * (HOT/ICE 와 걸리는 시간). 수치·분쇄도·기구는 상세 시트에 있다 — 그것까지 목록에 올리면 레시피 하나가
 * 화면 3분의 1을 차지해 첫 레시피에서 끝 레시피까지 여러 번 넘겨야 했다. 지금은 9개가 한 화면 남짓이다.
 *
 * 버전 단추가 그 버전의 상세를 바로 연다. 제목은 첫 버전을 연다.
 */
export function RecipeCard({ family, favorite, onOpen, onToggleFavorite }: Props) {
  const first = family.variants[0]!;
  const custom = family.variants.some((r) => r.custom);
  return (
    <article className="flex min-h-[8rem] flex-col rounded-2xl border border-line bg-card p-3 shadow-card">
      <div className="flex items-start gap-1">
        <h3 className="min-w-0 flex-1 text-[15px] leading-snug font-bold text-ink">
          <button
            type="button"
            onClick={() => onOpen(first.id)}
            className="line-clamp-2 text-left break-keep outline-none hover:text-crema focus-visible:text-crema"
          >
            {family.title}
          </button>
        </h3>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={`${family.title} 즐겨찾기 ${favorite ? '해제' : '추가'}`}
          className={`-mt-1.5 -mr-1.5 shrink-0 rounded-lg p-1.5 transition-colors ${favorite ? 'animate-hop text-carrot' : 'text-ink-faint hover:text-ink-soft'}`}
        >
          {/* 당근 = 즐겨찾기. 연표에서 켜진 칸에 당근이 놓이는 것과 같은 말 */}
          <Icon name="carrot" size={18} filled={favorite} />
        </button>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-snug break-keep text-ink-soft">
        {metaLine(family)}
        {custom && <span className="font-bold text-sage"> · 내 레시피</span>}
      </p>

      <ul className="mt-auto flex gap-1.5 pt-2.5">
        {family.variants.map((r) => {
          const hot = r.serve === 'hot';
          return (
            <li key={r.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpen(r.id)}
                aria-label={`${r.title} ${serveLabel(r)} 열기`}
                className={`flex h-10 w-full items-center justify-center gap-1 rounded-xl text-xs font-bold transition hover:opacity-80 ${
                  hot ? 'bg-hot-soft text-hot' : 'bg-ice-soft text-ice'
                }`}
              >
                {serveLabel(r)}
                <span className="num font-semibold">{formatSec(r.totalSec)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
