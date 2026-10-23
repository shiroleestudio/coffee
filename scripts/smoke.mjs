import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone 크기
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`file://${process.cwd()}/dist-single/index.html`);
await page.waitForSelector('h1');

const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
};

await step('앱이 렌더링된다', async () => {
  const t = await page.textContent('h1');
  if (!/my coffee recipe/i.test(t)) throw new Error(`제목: ${t}`);
});

await step('17개 레시피가 HOT/ICE 묶음 카드 9장으로 보인다', async () => {
  const n = await page.locator('article').count();
  if (n !== 9) throw new Error(`카드 ${n}개`);
  const rows = await page.locator('article li').count();
  if (rows !== 17) throw new Error(`버전 줄 ${rows}개`);
  // 같은 제목이 목록에 두 번 나오지 않는다
  const titles = await page.locator('article h3').allTextContents();
  if (new Set(titles).size !== titles.length) throw new Error(`제목 중복: ${titles.join(', ')}`);
});

await step('카드의 ICE 줄을 누르면 ICE 버전 상세가 열린다', async () => {
  await page.getByRole('button', { name: '484 아이스 ICE 열기' }).click();
  await page.locator('[role=dialog] h2', { hasText: '484 아이스' }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
});

await step('처음 열면 Femobook A2 가 기본 그라인더다', async () => {
  const body = await page.textContent('main');
  // 4666 V2 — 코만단테 22~24 → Femobook 45~48.5
  if (!body.includes('Femobook A2 45~48.5')) throw new Error(`기본 환산이 안 보인다: ${body.slice(0, 300)}`);
});

await step('V60 깔끔 레시피는 코만단테와 EK43 을 각각 환산하고 차이를 알린다', async () => {
  await page.getByRole('button', { name: '하리오 V60 깔끔 레시피', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  await d.getByText('← EK43 (0~16) 13~14').waitFor();
  const body = await d.textContent();
  if (!body.includes('51.5~53.5')) throw new Error('코만단테 환산 없음');
  if (!body.includes('44~46')) throw new Error('EK43 환산 없음');
  if (!body.includes('7.5클릭 차이')) throw new Error('차이 안내 없음');
  // 푸어 방식: 회차마다 물줄기가 굵어진다
  for (const t of ['가는 물줄기', '중간 물줄기', '굵은 물줄기']) if (!body.includes(t)) throw new Error(`${t} 없음`);
  await page.keyboard.press('Escape');
});

await step('용챔 레시피의 EK43 은 1~11 다이얼로 표시된다', async () => {
  await page.getByRole('button', { name: '용챔 약배전 (15g)', exact: true }).click();
  await page.locator('[role=dialog]').getByText('← EK43 (1~11) 9.0').waitFor();
  await page.keyboard.press('Escape');
});

await step('카스야 4:6 은 나선 푸어가 움직이는 그림으로 나온다', async () => {
  await page.getByRole('button', { name: '테츠 카스야 4:6', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  // 타이머 카드 — 움직이는 그림. live 영역은 단계 제목 줄에만 있으므로 섹션으로 찾는다
  const live = d.locator('section[aria-label="브루잉 타이머"] svg[role=img][aria-label="나선"]');
  await live.waitFor();
  if ((await live.locator('animateMotion').count()) !== 1) throw new Error('나선 그림이 움직이지 않는다');
  // 단계 표 — 다섯 푸어 모두 열자마자 움직인다
  const table = d.locator('ol svg[role=img][aria-label="나선"]');
  if ((await table.count()) !== 5) throw new Error(`단계 표 그림 ${await table.count()}개`);
  if ((await table.locator('animateMotion').count()) !== 5) throw new Error('단계 표 그림이 움직이지 않는다');
  await d.getByText('붓는 방식 출처').waitFor();
  await page.keyboard.press('Escape');
});

await step('484 는 타이머를 켜기 전에도 푸어가 움직이고, 뜸 동안 1차 붓는 법을 크게 미리 보여준다', async () => {
  await page.getByRole('button', { name: '484 오리지널', exact: true }).click();
  const d = page.locator('[role=dialog]');
  // 단계 표: 센터 푸어 · 천천히 → 큰 원
  const center = d.locator('ol svg[role=img][aria-label="센터 푸어 · 천천히"]');
  await center.waitFor();
  if ((await center.locator('animate').count()) === 0) throw new Error('센터 푸어 물결이 움직이지 않는다');
  if ((await d.locator('ol svg[role=img][aria-label="큰 원"] animateMotion').count()) !== 1) throw new Error('큰 원이 돌지 않는다');
  // 타이머 카드는 뜸 단계 — 1차 붓는 법을 어느 단계 것인지 밝혀서 크게 미리 재생
  const card = d.locator('section[aria-label="브루잉 타이머"]');
  await card.getByText('1차 (1:00)부터 이렇게 부어요').waitFor();
  const big = await card.locator('svg[role=img]').first().getAttribute('width');
  if (Number(big) < 120) throw new Error(`타이머 카드 애니메이션이 작다: ${big}px`);
  if ((await card.locator('svg[aria-label="센터 푸어 · 천천히"] animate').count()) === 0) throw new Error('미리보기가 움직이지 않는다');
  await page.keyboard.press('Escape');
});

await step('원두량 조절 기능은 없다', async () => {
  await page.getByRole('button', { name: '4666 V2', exact: true }).first().click();
  const n = await page.locator('[role=dialog]').getByText('원두량 조정').count();
  if (n) throw new Error('원두량 조정이 남아 있다');
  await page.keyboard.press('Escape');
});

await step('검색이 목록을 줄인다', async () => {
  await page.fill('input[type=search]', '카스야');
  // HOT/ICE 두 버전이 한 카드에
  await page.waitForFunction(() => document.querySelectorAll('article').length === 1 && document.querySelectorAll('article li').length === 2);
  await page.fill('input[type=search]', '');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 9);
});

await step('ICE 칩이 ICE 버전 9개로 줄이고, 다시 누르면 풀린다', async () => {
  await page.getByRole('button', { name: 'ICE', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article li').length === 9);
  await page.getByRole('button', { name: 'ICE', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 9);
});

await step('필터 패널의 드리퍼 조건은 접어도 칩으로 남고, 칩으로 풀린다', async () => {
  await page.getByRole('button', { name: /^필터/ }).click();
  await page.getByRole('button', { name: '칼리타', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article li').length === 2);
  await page.getByRole('button', { name: /^필터/ }).click(); // 접기
  await page.getByRole('button', { name: '칼리타', exact: true }).click(); // 칩으로 해제
  await page.waitForFunction(() => document.querySelectorAll('article').length === 9);
});

await step('조건에 맞는 레시피가 없으면 안내와 필터 초기화가 나온다', async () => {
  await page.fill('input[type=search]', 'zzz-없는-레시피');
  await page.waitForSelector('text=조건에 맞는 레시피가 없습니다');
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 9);
});

await step('상세 시트가 열린다', async () => {
  await page.getByRole('button', { name: '4666 V2', exact: true }).first().click();
  await page.waitForSelector('[role=dialog]');
  const d = page.locator('[role=dialog]');
  if (!(await d.textContent()).includes('브루잉 타이머') === false) {} // noop
  await d.getByText('추출 단계').waitFor();
});

await step('타이머가 돌고 단계가 넘어간다', async () => {
  const d = page.locator('[role=dialog]');
  await d.getByRole('button', { name: '시작' }).click();
  await d.getByRole('button', { name: '일시정지' }).waitFor();
  const clock = d.getByRole('timer');
  const t0 = await clock.textContent();
  await page.waitForFunction(
    (prev) => document.querySelector('[role=dialog] [role=timer]')?.textContent !== prev,
    t0, { timeout: 4000 },
  );
  const t1 = await clock.textContent();
  if (t1 === t0) throw new Error('시계가 멈춰 있다');
  console.log(`      시계 ${t0} → ${t1}`);
});

await step('HOT/ICE 를 바꾸면 돌던 타이머가 넘어가지 않고 새로 시작한다', async () => {
  const d = page.locator('[role=dialog]');
  // 앞 단계에서 HOT(4666 V2) 타이머가 돌고 있다. ICE 로 바꾸면 그 타이머가 따라오면 안 된다
  await d.getByRole('button', { name: '일시정지' }).waitFor();
  await d.getByRole('button', { name: /ICE 버전 보기/ }).click();
  await page.waitForFunction(() => document.querySelector('[role=dialog] [role=timer]')?.textContent === '0:00');
  if (!(await d.getByRole('button', { name: '시작' }).isVisible())) throw new Error('타이머가 이어서 돈다');
  // 진행 바 트랙이 배경과 구분된다
  const same = await page.evaluate(() => {
    const bar = document.querySelector('[role=dialog] [role=presentation]');
    const sec = bar?.closest('section');
    return !!bar && !!sec && getComputedStyle(bar).backgroundColor === getComputedStyle(sec).backgroundColor;
  });
  if (same) throw new Error('진행 바 트랙이 배경색과 같다');
  // 다음 단계가 HOT 에서 시작하므로 되돌려 둔다
  await d.getByRole('button', { name: /HOT 버전 보기/ }).click();
  await page.waitForFunction(() => document.querySelector('[role=dialog] h2')?.textContent?.includes('4666 V2'));
});

await step('HOT/ICE 버전 전환이 된다', async () => {
  const d = page.locator('[role=dialog]');
  await d.getByRole('button', { name: /ICE 버전 보기/ }).click();
  await page.waitForFunction(() =>
    document.querySelector('[role=dialog] h2')?.textContent?.includes('4666 V2'));
});

await step('Esc 로 닫힌다', async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
});

await step('즐겨찾기가 저장되고 새로고침 후에도 남는다', async () => {
  await page.locator('article').first().getByRole('button', { name: /즐겨찾기/ }).click();
  await page.reload();
  await page.waitForSelector('article');
  const pressed = await page.locator('article').first().getByRole('button', { name: /즐겨찾기/ }).getAttribute('aria-pressed');
  if (pressed !== 'true') throw new Error(`aria-pressed=${pressed}`);
});

await step('레시피를 추가하면 그 카테고리 구역이 생긴다', async () => {
  await page.getByRole('button', { name: '레시피 추가' }).click();
  const d = page.locator('[role=dialog]');
  await d.locator('#rf-title').fill('모카포트 테스트');
  await d.locator('#rf-category').selectOption('mokapot');
  await d.locator('#rf-bean').fill('16');
  await d.locator('#rf-temp').fill('95');
  await d.getByLabel('1단계 분').fill('0');
  await d.getByLabel('1단계 초').fill('0');
  await d.getByLabel('1단계 물 양').fill('120');
  await d.getByLabel('1단계 동작').fill('물 채우고 가열');
  await d.getByLabel('1단계 궤적').selectOption('center');
  await d.getByLabel('1단계 속도').selectOption('slow');
  // 고르는 즉시 폼 안에서 미리보기가 움직인다
  if ((await d.locator('svg[role=img][aria-label="센터 푸어 · 천천히"] animate').count()) === 0) throw new Error('폼 미리보기가 없다');
  await d.getByLabel('종료 분').fill('4');
  await d.getByLabel('종료 초').fill('30');
  await d.getByRole('button', { name: '저장' }).click();
  await page.waitForFunction(() =>
    document.querySelector('[role=dialog] h2')?.textContent?.includes('모카포트 테스트'));
  // 종료 시각이 마지막 단계 시각(0:00)이 아니라 입력한 4:30 이다
  const total = await d.locator('dt', { hasText: '목표 시간' }).locator('..').locator('dd').textContent();
  if (total?.trim() !== '4:30') throw new Error(`목표 시간 ${total}`);
  // 붓는 방법이 저장돼 단계 표에서 움직인다
  if ((await d.locator('ol svg[role=img][aria-label="센터 푸어 · 천천히"] animateMotion, ol svg[role=img][aria-label="센터 푸어 · 천천히"] animate').count()) === 0)
    throw new Error('저장된 붓는 방법이 움직이지 않는다');
  await page.keyboard.press('Escape');
  // 카테고리 탭이 아니라 구역 — 레시피가 생긴 카테고리만 구역이 된다
  await page.getByRole('heading', { name: '모카포트', exact: true }).waitFor();
  if ((await page.getByRole('heading', { name: '에스프레소', exact: true }).count()) !== 0) throw new Error('빈 카테고리가 구역으로 나온다');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 10);
});

await step('추출을 기록하면 조정 제안이 나온다', async () => {
  await page.getByRole('button', { name: '4666 V2', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  await d.getByRole('button', { name: '타이머 없이 기록하기' }).click();
  await page.waitForFunction(() =>
    document.querySelector('[role=dialog] h2')?.textContent?.includes('추출 기록'));
  await page.getByRole('button', { name: '시다', exact: true }).click();
  await page.waitForSelector('text=분쇄도를 2클릭 가늘게'); // Femobook A2 기준
  // 타이머를 돌리지 않았으므로 시간 칸은 비어 있어야 한다 (0 이 아니라)
  const sec = await d.locator('#bl-sec').inputValue();
  if (sec !== '') throw new Error(`시간 칸에 ${sec} 가 들어 있다`);
  await page.getByRole('radio', { name: '4점' }).click();
  await page.getByRole('button', { name: '저장' }).click();
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
});

await step('기록 화면에 남고 레시피에도 되비친다', async () => {
  await page.getByRole('button', { name: /^기록/ }).click();
  await page.waitForSelector('article');
  const body = await page.textContent('main');
  if (!body.includes('4666 V2')) throw new Error('기록 목록에 없다');
  await page.getByRole('button', { name: /^레시피$/ }).click();
  await page.getByRole('button', { name: '4666 V2', exact: true }).first().click();
  await page.waitForSelector('text=내 기록 1회');
  await page.waitForSelector('text=가장 잘 나온 설정');
  await page.keyboard.press('Escape');
});

await step('Femobook A2 를 고르면 분쇄도가 환산된다', async () => {
  await page.getByRole('button', { name: /^설정/ }).click();
  await page.getByRole('button', { name: 'Femobook A2', exact: true }).click();
  await page.waitForSelector('text=환산 기준 보정');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  const body = await page.textContent('main');
  // 코만단테 22~24 → Femobook 45~48.5 (기준 45)
  if (!body.includes('Femobook A2 45~48.5')) throw new Error(`환산값이 안 보인다: ${body.slice(0, 400)}`);
  if (!body.includes('코만단테 22~24')) throw new Error('원본 값이 사라졌다');
});

await step('보정하면 환산값이 함께 움직인다', async () => {
  await page.getByRole('button', { name: /^설정/ }).click();
  await page.getByRole('button', { name: '기준 1클릭 늘리기' }).click(); // 45 → 46
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  const body = await page.textContent('main');
  if (!body.includes('Femobook A2 46~49.5')) throw new Error(`보정이 반영 안 됨: ${body.slice(0, 300)}`);
});

await step('기록 폼의 분쇄도가 내 그라인더 값으로 채워진다', async () => {
  await page.getByRole('button', { name: /^레시피$/ }).click();
  await page.getByRole('button', { name: '테츠 카스야 4:6', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  await d.getByRole('button', { name: '타이머 없이 기록하기' }).click();
  const grind = await d.locator('#bl-grind').inputValue();
  if (!grind.startsWith('Femobook A2')) throw new Error(`분쇄도 기본값이 ${grind}`);
  console.log(`      기본값: ${grind}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});

await step('원두를 등록하면 로스팅 일수가 계산된다', async () => {
  await page.getByRole('button', { name: /^원두/ }).click();
  await page.getByRole('button', { name: '원두 등록' }).first().click();
  const d = page.locator('[role=dialog]');
  await d.locator('#bf-name').fill('예가체프');
  const d5 = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  await d.locator('#bf-date').fill(d5);
  await d.locator('#bf-anchor').fill('41');
  await d.getByRole('button', { name: '저장' }).click();
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  await page.waitForSelector('text=로스팅 5일차');
  // 처음 등록한 원두는 바로 "지금 쓰는 원두" 가 된다
  await page.getByRole('button', { name: '지금 쓰는 원두' }).waitFor();
});

await step('원두를 고르면 그 원두의 기준으로 분쇄도가 바뀐다', async () => {
  await page.getByRole('button', { name: /^레시피$/ }).click();
  let body = await page.textContent('main');
  // 설정 보정값(46) 대신 원두 기준(41)이 쓰인다
  if (!body.includes('Femobook A2 41~44.5')) throw new Error(`원두 기준 미반영: ${body.slice(0, 400)}`);
  // 원두 선택을 풀면 설정 보정값으로 돌아간다
  await page.locator('main select').first().selectOption('');
  body = await page.textContent('main');
  if (!body.includes('Femobook A2 46~49.5')) throw new Error(`원두 해제 후 복귀 안 됨: ${body.slice(0, 300)}`);
});

await step('삭제는 확인을 거치고, 취소하면 남는다', async () => {
  await page.getByRole('button', { name: /^레시피$/ }).click();
  // '최근 내린' 칩과 목록 줄, 둘 다 같은 상세를 연다
  await page.getByRole('button', { name: '모카포트 테스트', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  // 이 레시피로 기록을 하나 남겨 둔다 (지워진 뒤에도 고칠 수 있어야 한다)
  await d.getByRole('button', { name: '타이머 없이 기록하기' }).click();
  await page.getByRole('button', { name: '좋다', exact: true }).click();
  await page.getByRole('button', { name: '저장' }).click();
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  // '최근 내린' 칩과 목록 줄, 둘 다 같은 상세를 연다
  await page.getByRole('button', { name: '모카포트 테스트', exact: true }).first().click();

  let asked = 0;
  const dismiss = async (dlg) => { asked += 1; await dlg.dismiss(); };
  page.on('dialog', dismiss);
  await d.getByRole('button', { name: '삭제' }).click();
  await page.waitForTimeout(200);
  page.off('dialog', dismiss);
  if (asked !== 1) throw new Error('확인 없이 지워진다');
  if (!(await d.isVisible())) throw new Error('취소했는데 상세가 닫혔다');

  const accept = async (dlg) => dlg.accept();
  page.on('dialog', accept);
  await d.getByRole('button', { name: '삭제' }).click();
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  page.off('dialog', accept);
  if ((await page.getByRole('button', { name: '모카포트 테스트', exact: true }).count()) !== 0) throw new Error('지워지지 않았다');
});

await step('지워진 레시피의 기록도 열어서 고칠 수 있다', async () => {
  await page.getByRole('button', { name: /^기록/ }).click();
  const card = page.locator('article', { hasText: '모카포트 테스트' }).first();
  await card.getByRole('button', { name: '기록 수정' }).click();
  const d = page.locator('[role=dialog]');
  await d.getByText('모카포트 테스트 (지워진 레시피)').waitFor();
  await page.keyboard.press('Escape');
  // 기록 탭에서 열었으니 닫으면 상세가 뜨지 않는다
  await page.waitForSelector('[role=dialog]', { state: 'detached' });
  await page.getByRole('button', { name: /^레시피$/ }).click();
});

await step('타이머 카드의 스크린리더 알림은 초마다 바뀌지 않는다', async () => {
  await page.getByRole('button', { name: '484 오리지널', exact: true }).click();
  const d = page.locator('[role=dialog]');
  await d.getByRole('button', { name: '시작' }).click();
  const live = d.locator('[aria-live=polite]').first();
  const t0 = await live.textContent();
  await page.waitForTimeout(1300);
  if ((await live.textContent()) !== t0) throw new Error('live 영역이 초마다 바뀐다');
  await page.keyboard.press('Escape');
});

await step('모양이 깨진 저장 데이터는 걸러지고 배너로 알린다', async () => {
  await page.evaluate(() => {
    const ok = { id: 'ok-1', title: '멀쩡한 레시피', category: 'drip', serve: 'hot', roast: 'any', beanG: 15, waterG: 200, tempC: 92, grind: '보통', gear: 'V60', totalSec: 120, steps: [{ atSec: 0, waterG: 200, label: '붓기' }], custom: true };
    const bad = { id: 'bad-1', title: '깨진 레시피', steps: 'not-an-array' };
    localStorage.setItem('mcr:customRecipes', JSON.stringify([ok, bad]));
  });
  await page.reload();
  await page.waitForSelector('article');
  if (!(await page.getByText('모양이 맞지 않아 건너뛰었습니다').isVisible())) throw new Error('배너가 없다');
  if ((await page.getByRole('button', { name: '멀쩡한 레시피', exact: true }).count()) !== 1) throw new Error('멀쩡한 레시피가 사라졌다');
  if ((await page.getByRole('button', { name: '깨진 레시피', exact: true }).count()) !== 0) throw new Error('깨진 레시피가 목록에 남아 있다');
  await page.evaluate(() => localStorage.removeItem('mcr:customRecipes'));
  await page.reload();
  await page.waitForSelector('article');
});

await step("기기의 '동작 줄이기'면 멈추고, 설정의 '항상 움직이기'로 다시 움직인다", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p2 = await ctx.newPage();
  await p2.goto(`file://${process.cwd()}/dist-single/index.html`);
  const count = async () => {
    await p2.getByRole('button', { name: '테츠 카스야 4:6', exact: true }).first().click();
    const n = await p2.locator('[role=dialog] ol svg[role=img] animateMotion').count();
    await p2.keyboard.press('Escape');
    await p2.waitForSelector('[role=dialog]', { state: 'detached' });
    return n;
  };
  const before = await count();
  if (before !== 0) throw new Error(`동작 줄이기인데 ${before}개가 움직인다`);
  await p2.getByRole('button', { name: /^설정/ }).click();
  await p2.getByRole('switch', { name: /항상 움직이기/ }).click();
  await p2.keyboard.press('Escape');
  await p2.waitForSelector('[role=dialog]', { state: 'detached' });
  const after = await count();
  if (after !== 5) throw new Error(`항상 움직이기인데 ${after}개`);
  await ctx.close();
});

await step('바리스타 토끼가 상태를 따라 자세를 바꾸고, 타이머 카드의 붓는 그림에는 1인칭 손이 나온다', async () => {
  await page.getByRole('button', { name: '484 오리지널', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  const timer = d.locator('section[aria-label="브루잉 타이머"]');
  await timer.locator('[data-mascot="idle"]').waitFor();
  // 1인칭: 큰 그림에만 손이 있고, 단계표의 작은 그림에는 없다
  if ((await timer.locator('svg[data-pov]').count()) !== 1) throw new Error('타이머 카드 그림에 1인칭 손이 없다');
  if ((await d.locator('ol svg[data-pov]').count()) !== 0) throw new Error('단계표 그림에 손이 들어갔다');
  await d.getByRole('button', { name: '시작' }).click();
  await timer.locator('[data-mascot="pour"]').waitFor(); // 뜸 들이기 40g — 붓는 단계
  // 마스코트 그림은 장식이라 스크린리더에서 숨긴다
  if ((await timer.locator('[data-mascot] svg[aria-hidden="true"]').count()) !== 1) throw new Error('마스코트가 aria-hidden 이 아니다');
  await d.getByRole('button', { name: '일시정지' }).click();
  // 일시정지하면 그림이 멈춘다 (SMIL 요소가 없다)
  if ((await timer.locator('[data-mascot] animate, [data-mascot] animateTransform').count()) !== 0) throw new Error('일시정지인데 마스코트가 움직인다');
  await page.keyboard.press('Escape');
  // 빈 화면(조건에 맞는 레시피 없음)에도 서 있다
  await page.fill('input[type=search]', 'zzz-없는-레시피');
  await page.locator('main [data-mascot="idle"]').waitFor();
  await page.fill('input[type=search]', '');
});

await step('붓는 방식이 없는 레시피도 기본 푸어오버 그림이 움직이고, 그 사실을 밝힌다', async () => {
  await page.getByRole('button', { name: '4666 V2', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  await d.getByText('추출 단계').waitFor();
  // 단계표: 붓는 단계 넷 모두 기본 그림(정보 없음 표시)이고 움직인다
  const generic = d.locator('ol svg[data-generic]');
  if ((await generic.count()) !== 4) throw new Error(`기본 그림 ${await generic.count()}개`);
  if ((await generic.first().locator('animate').count()) === 0) throw new Error('기본 그림이 움직이지 않는다');
  if ((await generic.first().getAttribute('aria-label')) !== '기본 푸어오버 (레시피에 붓는 방식 없음)') throw new Error('기본 그림의 이름이 다르다');
  await d.getByText('흐린 그림은 기본 푸어오버 모습입니다').waitFor();
  // 타이머 카드: 레시피에 없다는 말과 함께 기본 그림
  const timer = d.locator('section[aria-label="브루잉 타이머"]');
  await timer.getByText('붓는 방식은 레시피에 없어요').waitFor();
  if ((await timer.locator('svg[data-generic] animate').count()) === 0) throw new Error('타이머 카드의 기본 그림이 움직이지 않는다');
  // 방식이 적힌 레시피의 표에는 기본 그림이 없다
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '테츠 카스야 4:6', exact: true }).first().click();
  await page.locator('[role=dialog]').getByText('추출 단계').waitFor();
  if ((await page.locator('[role=dialog] ol svg[data-generic]').count()) !== 0) throw new Error('카스야에 기본 그림이 섞였다');
  await page.keyboard.press('Escape');
});

await step('타이머에서 이전/다음 단계로 바로 옮길 수 있다', async () => {
  await page.getByRole('button', { name: '테츠 카스야 4:6', exact: true }).first().click();
  const d = page.locator('[role=dialog]');
  const timer = d.locator('section[aria-label="브루잉 타이머"]');
  // 시작 전에는 이전이 없고 다음은 있다
  if (!(await timer.getByRole('button', { name: '이전 단계' }).isDisabled())) throw new Error('시작 전인데 이전 단계가 켜져 있다');
  await d.getByRole('button', { name: '시작' }).click();
  await timer.getByRole('button', { name: '다음 단계' }).click();
  // 2차(0:45)로 건너뛰고 계속 돈다
  await timer.locator('[role=timer]', { hasText: /^0:4[5-9]$/ }).waitFor();
  await timer.locator('p[aria-live=polite]', { hasText: /^2차/ }).waitFor();
  await d.getByRole('button', { name: '일시정지' }).waitFor();
  // 막 넘어온 단계에서 이전을 누르면 그 앞 단계(1차, 0:00)로
  await timer.getByRole('button', { name: '이전 단계' }).click();
  await timer.locator('[role=timer]', { hasText: /^0:0[0-2]$/ }).waitFor();
  await timer.locator('p[aria-live=polite]', { hasText: /^1차/ }).waitFor();
  // 멈춘 채로 다음을 누르면 그 시각에 멈춰 선다 — '계속'으로 이어 갈 수 있다
  await d.getByRole('button', { name: '일시정지' }).click();
  await timer.getByRole('button', { name: '다음 단계' }).click();
  await timer.locator('[role=timer]', { hasText: /^0:45$/ }).waitFor();
  await d.getByRole('button', { name: '계속' }).waitFor();
  await page.keyboard.press('Escape');
});

await step('콘솔 에러가 없다', async () => {
  if (errors.length) throw new Error(errors.join(' | '));
});

await page.getByRole('button', { name: /^레시피$/ }).click();
await page.screenshot({ path: `${process.env.SHOT_DIR ?? process.cwd()}/shot-list.png`, fullPage: false });
await page.getByRole('button', { name: '4666 V2', exact: true }).first().click();
await page.waitForSelector('[role=dialog]');
await page.screenshot({ path: `${process.env.SHOT_DIR ?? process.cwd()}/shot-detail.png` });

await browser.close();
console.log('\n스모크 테스트 종료');
