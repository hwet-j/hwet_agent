/**
 * 연동 앱(LeaseLog·캘린더)이 비서에게 돌려주는 결과 주소:
 *   hwetassistant://result?id=<요청 id>&app=leaselog|calendar&data=<URL인코딩 JSON {ok,what,data|error}>
 * 앱은 이 주소를 비서 패키지로만 보낸다(명시적 인텐트). 그래도 다른 앱이 같은 주소를 보낼 수 있으므로
 * 비서가 보낸 요청 id(1회용)와 일치할 때만 받아들이고, 내용은 "데이터"로만 쓴다.
 */
export type BridgeApp = 'leaselog' | 'calendar';
export type BridgeResult = { id: string; app: BridgeApp; payload: { ok: boolean; what?: string; data?: unknown; error?: string } };

const MAX_URL = 200_000;

export const isResultUrl = (u: string) => /^hwetassistant:\/*result([/?#]|$)/i.test(u) || /^\/?result([?#]|$)/i.test(u);

function query(u: string): Map<string, string> {
  const q = new Map<string, string>();
  const i = u.indexOf('?');
  if (i < 0) return q;
  for (const part of u.slice(i + 1).split('#')[0].split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    try {
      q.set(decodeURIComponent(part.slice(0, eq)), decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' ')));
    } catch {
      return new Map();
    }
  }
  return q;
}

export function parseResultUrl(u: string): BridgeResult | null {
  if (typeof u !== 'string' || u.length > MAX_URL || !isResultUrl(u)) return null;
  const q = query(u);
  const id = q.get('id') ?? '';
  const app = q.get('app');
  if (!/^[\w-]{1,64}$/.test(id) || (app !== 'leaselog' && app !== 'calendar')) return null;
  try {
    const payload = JSON.parse(q.get('data') ?? '');
    if (!payload || typeof payload !== 'object' || typeof payload.ok !== 'boolean') return null;
    return { id, app, payload };
  } catch {
    return null;
  }
}

/** 요청 id 를 등록하고 결과를 기다린다. 한 id 는 한 번만 풀리고, 시간 안에 안 오면 reject */
export function createBridge() {
  const pending = new Map<string, { app: BridgeApp; resolve: (r: BridgeResult['payload']) => void; timer: ReturnType<typeof setTimeout> }>();
  return {
    wait(id: string, app: BridgeApp, timeoutMs: number): Promise<BridgeResult['payload']> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('timeout'));
        }, timeoutMs);
        pending.set(id, { app, resolve, timer });
      });
    },
    /** 들어온 주소를 처리. 대기 중인 요청과 맞으면 true */
    handle(url: string): boolean {
      const r = parseResultUrl(url);
      if (!r) return false;
      const p = pending.get(r.id);
      if (!p || p.app !== r.app) return false;
      clearTimeout(p.timer);
      pending.delete(r.id);
      p.resolve(r.payload);
      return true;
    },
    cancel(id: string) {
      const p = pending.get(id);
      if (p) clearTimeout(p.timer);
      pending.delete(id);
    },
    size: () => pending.size,
  };
}
