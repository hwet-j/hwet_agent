import { z } from 'zod';

/**
 * 비서에 앱을 연결하는 "연동 규약". 자세한 설명은 docs/connector-spec.md 참고.
 * 앱은 자신이 할 수 있는 일(tools)을 이 JSON으로 공개하고, 비서는 이를 Claude 도구로 등록한다.
 */
const idRe = /^[a-z][a-z0-9_]{0,23}$/;
const toolNameRe = /^[a-z][a-z0-9_]{0,31}$/;

export const ToolSpecSchema = z.object({
  name: z.string().regex(toolNameRe),
  description: z.string().min(1).max(1000),
  /** JSON Schema (type: "object") */
  inputSchema: z.object({ type: z.literal('object') }).catchall(z.unknown()),
  /** true 면 사용자 확인 없이 실행한다. 데이터를 바꾸지 않는 조회 도구에만 사용. 기본 false(실행 전 확인). */
  readOnly: z.boolean().default(false),
});

export const ConnectorManifestSchema = z.object({
  id: z.string().regex(idRe),
  name: z.string().min(1).max(60),
  version: z.string().default('1'),
  description: z.string().max(500).default(''),
  transport: z.object({
    type: z.literal('http'),
    /** https 만 허용 */
    baseUrl: z.string().url().refine((u) => u.startsWith('https://'), 'https 주소만 지원합니다'),
  }),
  tools: z.array(ToolSpecSchema).min(1).max(50),
});

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;
export type ToolSpec = z.infer<typeof ToolSpecSchema>;
