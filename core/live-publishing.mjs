export const LIVE_SITE = 'https://bevitts-design.github.io/BUS123-Solving-Business-Problems-with-Technology/';
export async function inspectLiveWebsite({ readLocal, expectedCommit = "", readPublished, fetcher = fetch }) {
  const checkedAt = new Date().toISOString();
  try {
    const get = async path => {
      const response = await fetcher(`${LIVE_SITE}${path}?verify=${Date.now()}`, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
      if (!response.ok) throw new Error(`Website returned ${response.status}`);
      return response.text();
    };
    const [mapText, html, localMap, localHTML] = await Promise.all([get('course-map.json'), get(''), readLocal('course-map.json'), readLocal('index.html')]);
    const map = JSON.parse(mapText);
    const currentLessonId = map.course?.currentLessonId;
    const lesson = map.lessons.find(item => item.id === currentLessonId);
    const cards = [...html.matchAll(/<article\b[^>]*\bid="([^"]+)"[^>]*\bdata-status="current"/g)].map(match => match[1]);
    const verified = Boolean(lesson && cards.length === 1 && cards[0] === currentLessonId);
    let matchesPublished = false;
    let deployment = null;
    if (expectedCommit && readPublished) {
      const [publishedMap, publishedHTML] = await Promise.all([readPublished('course-map.json'), readPublished('index.html')]);
      matchesPublished = verified && mapText === publishedMap && html === publishedHTML;
      try {
        const response = await fetcher(`https://api.github.com/repos/bevitts-design/BUS123-Solving-Business-Problems-with-Technology/actions/runs?head_sha=${expectedCommit}&per_page=10`, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const run = (JSON.parse(await response.text()).workflow_runs || []).find(item => item.path === 'dynamic/pages/pages-build-deployment' || item.path === '.github/workflows/deploy.yml' || item.name === 'Deploy Course Dashboard');
          if (run) deployment = { status: run.status, conclusion: run.conclusion };
        }
      } catch { /* Live-file verification remains available if Actions is unreachable. */ }
    }
    return { checkedAt, url: LIVE_SITE, verified, currentLessonId, title: lesson?.title, matchesLocal: verified && mapText === localMap && html === localHTML, matchesPublished, deployment };
  } catch (error) {
    return { checkedAt, url: LIVE_SITE, verified: false, matchesLocal: false, error: `Unable to verify the live website. ${error.message}` };
  }
}
