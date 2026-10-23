/**
 * 호스팅 배포본(GitHub Pages) 확인 — `npm run smoke:pwa`
 *
 * dist/ 를 HTTP 로 띄워 서비스 워커가 설치되는지, 네트워크를 끊어도 앱이 열리는지,
 * 홈 화면 설치에 필요한 매니페스트와 아이콘이 제대로 나가는지 본다.
 * (단일 HTML 빌드는 scripts/smoke.mjs 가 본다.)
 */
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'silent' });
const base = 'http://localhost:4173/';

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    process.exitCode = 1;
  }
};

await step('온라인에서 열린다', async () => {
  await page.goto(base);
  await page.waitForSelector('article');
});

await step('서비스 워커가 설치되고 페이지를 넘겨받는다', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  // 첫 방문 페이지는 워커가 뜨기 전에 열렸으므로, 한 번 새로 열어 워커 아래에서 돌게 한다
  await page.reload();
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!controlled) throw new Error('controller 없음');
});

await step('필요한 파일이 전부 캐시에 들어간다', async () => {
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('mcr-')));
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  for (const must of ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png']) {
    if (!cached.includes(must)) throw new Error(`${must} 없음: ${cached.join(', ')}`);
  }
  if (!cached.some((p) => /\/assets\/index-.*\.js$/.test(p))) throw new Error('JS 번들 없음');
});

await step('네트워크를 끊어도 앱이 열린다', async () => {
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('article', { timeout: 5000 });
  const n = await page.locator('article').count();
  if (n !== 9) throw new Error(`카드 ${n}개`);
});

await step('오프라인에서도 타이머와 기록이 동작한다', async () => {
  await page.getByRole('button', { name: '4666 V2', exact: true }).first().click();
  await page.getByRole('button', { name: '시작' }).click();
  await page.getByRole('button', { name: '일시정지' }).waitFor();
  await page.keyboard.press('Escape');
  await context.setOffline(false);
});

await step('매니페스트가 홈 화면 설치 조건을 갖춘다', async () => {
  const res = await page.request.get(`${base}manifest.webmanifest`);
  const m = await res.json();
  if (m.display !== 'standalone') throw new Error(`display: ${m.display}`);
  if (m.start_url !== './') throw new Error(`start_url: ${m.start_url} (하위 경로 배포에서 깨진다)`);
  const sizes = m.icons.map((i) => i.sizes);
  if (!sizes.includes('192x192') || !sizes.includes('512x512')) throw new Error(`아이콘: ${sizes}`);
  for (const icon of m.icons) {
    const r = await page.request.get(new URL(icon.src, `${base}manifest.webmanifest`).href);
    if (!r.ok()) throw new Error(`${icon.src} ${r.status()}`);
  }
});

await step('콘솔 에러가 없다', async () => {
  // 오프라인 전환 중 브라우저가 찍는 네트워크 실패는 앱 오류가 아니다
  const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  if (real.length) throw new Error(real.join(' | '));
});

await browser.close();
await new Promise((resolve) => server.httpServer.close(resolve));
console.log('\nPWA 스모크 테스트 종료');
