/** 새 버전 알림: 릴리스 태그 assistant-apk-<번호> 중 가장 큰 번호가 내 빌드 번호보다 크면 새 버전 */
export interface LatestRelease { n: number; tag: string; url: string }

export function latestAssistantRelease(releases: unknown): LatestRelease | null {
  if (!Array.isArray(releases)) return null;
  let best: LatestRelease | null = null;
  for (const r of releases) {
    const o = r as Record<string, unknown>;
    const m = typeof o?.tag_name === 'string' ? /^assistant-apk-(\d+)$/.exec(o.tag_name) : null;
    if (!m || o.draft === true) continue;
    const n = Number(m[1]);
    if (!best || n > best.n) best = { n, tag: o.tag_name as string, url: typeof o.html_url === 'string' ? o.html_url : '' };
  }
  return best;
}

/** 알릴지: 내 번호가 있고(개발 빌드 제외), 최신이 더 크고, 그 번호로는 아직 알린 적이 없을 때 */
export function shouldNotify(own: number, latest: LatestRelease | null, notified: number): boolean {
  return own > 0 && !!latest && latest.n > own && latest.n > notified;
}
