import { fetch as expoFetch } from 'expo/fetch';

import type { AgentTool } from '@/agent/tool';
import { getDb } from '@/core/db';
import { clearConnectorToken, getConnectorToken, setConnectorToken } from '@/core/settings';
import { ConnectorManifestSchema, type ConnectorManifest } from './types';

const TIMEOUT_MS = 20_000;

async function timedFetch(url: string, init: RequestInit & { headers?: Record<string, string> }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await expoFetch(url, { ...init, signal: ctrl.signal } as never);
  } finally {
    clearTimeout(timer);
  }
}

/** 매니페스트 URL(https)에서 연동 정보를 읽어 검증한다. */
export async function fetchManifest(url: string, token?: string): Promise<ConnectorManifest> {
  if (!url.startsWith('https://')) throw new Error('https 주소만 지원합니다');
  const res = await timedFetch(url, {
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`매니페스트를 가져오지 못했습니다 (HTTP ${res.status})`);
  return ConnectorManifestSchema.parse(await res.json());
}

export async function saveConnector(manifest: ConnectorManifest, token?: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO connectors (id, manifest, enabled) VALUES (?, ?, 1)',
    manifest.id,
    JSON.stringify(manifest),
  );
  if (token) await setConnectorToken(manifest.id, token);
}

export async function removeConnector(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM connectors WHERE id = ?', id);
  await clearConnectorToken(id);
}

export async function setConnectorEnabled(id: string, enabled: boolean) {
  const db = await getDb();
  await db.runAsync('UPDATE connectors SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id);
}

export type StoredConnector = { manifest: ConnectorManifest; enabled: boolean };

export async function listConnectors(): Promise<StoredConnector[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ manifest: string; enabled: number }>(
    'SELECT manifest, enabled FROM connectors ORDER BY id',
  );
  const out: StoredConnector[] = [];
  for (const r of rows) {
    const parsed = ConnectorManifestSchema.safeParse(JSON.parse(r.manifest));
    if (parsed.success) out.push({ manifest: parsed.data, enabled: r.enabled === 1 });
  }
  return out;
}

/** 활성화된 연동 앱의 도구를 에이전트 도구로 변환한다. 이름은 `<연동id>__<도구>` 로 충돌을 막는다. */
export async function loadConnectorTools(): Promise<AgentTool[]> {
  const tools: AgentTool[] = [];
  for (const { manifest, enabled } of await listConnectors()) {
    if (!enabled) continue;
    for (const spec of manifest.tools) {
      tools.push({
        name: `${manifest.id}__${spec.name}`,
        label: `${manifest.name} · ${spec.name}`,
        description: `[${manifest.name}] ${spec.description}`,
        inputSchema: spec.inputSchema as AgentTool['inputSchema'],
        needsConfirm: !spec.readOnly,
        async run(input) {
          const token = await getConnectorToken(manifest.id);
          const res = await timedFetch(`${manifest.transport.baseUrl.replace(/\/$/, '')}/tools/${spec.name}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(input),
          });
          const text = await res.text();
          if (!res.ok) throw new Error(`${manifest.name} 오류 (HTTP ${res.status}): ${text.slice(0, 300)}`);
          try {
            return JSON.parse(text);
          } catch {
            return text.slice(0, 4000);
          }
        },
      });
    }
  }
  return tools;
}
