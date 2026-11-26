import { getDb } from '@/core/db';
import type { AgentTool } from '@/agent/tool';

const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${field} 는 비어 있지 않은 문자열이어야 합니다`);
  return v.trim();
};
const optStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`${field} 는 정수여야 합니다`);
  return v;
};

export const builtinTools: AgentTool[] = [
  {
    name: 'add_task',
    label: '할 일 추가',
    description: '할 일을 추가한다. due 는 ISO 8601 날짜 또는 날짜시간(예: 2026-11-27 또는 2026-11-27T15:00).',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, due: { type: 'string' } },
      required: ['title'],
    },
    async run(input) {
      const db = await getDb();
      const r = await db.runAsync(
        'INSERT INTO tasks (title, due, done, created_at) VALUES (?, ?, 0, ?)',
        str(input.title, 'title'),
        optStr(input.due),
        new Date().toISOString(),
      );
      return { id: r.lastInsertRowId };
    },
  },
  {
    name: 'list_tasks',
    label: '할 일 조회',
    description: '할 일 목록을 조회한다. include_done 이 true 면 완료된 항목도 포함한다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { include_done: { type: 'boolean' } } },
    async run(input) {
      const db = await getDb();
      const where = input.include_done === true ? '' : 'WHERE done = 0';
      return db.getAllAsync(
        `SELECT id, title, due, done FROM tasks ${where} ORDER BY due IS NULL, due, id LIMIT 100`,
      );
    },
  },
  {
    name: 'complete_task',
    label: '할 일 완료 처리',
    description: 'id 로 할 일을 완료 처리한다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    async run(input) {
      const db = await getDb();
      const r = await db.runAsync('UPDATE tasks SET done = 1 WHERE id = ?', int(input.id, 'id'));
      return { updated: r.changes };
    },
  },
  {
    name: 'delete_task',
    label: '할 일 삭제',
    description: 'id 로 할 일을 삭제한다. 되돌릴 수 없다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    async run(input) {
      const db = await getDb();
      const r = await db.runAsync('DELETE FROM tasks WHERE id = ?', int(input.id, 'id'));
      return { deleted: r.changes };
    },
  },
  {
    name: 'add_note',
    label: '메모 저장',
    description: '메모를 저장한다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string' } },
      required: ['title', 'body'],
    },
    async run(input) {
      const db = await getDb();
      const r = await db.runAsync(
        'INSERT INTO notes (title, body, created_at) VALUES (?, ?, ?)',
        str(input.title, 'title'),
        str(input.body, 'body'),
        new Date().toISOString(),
      );
      return { id: r.lastInsertRowId };
    },
  },
  {
    name: 'search_notes',
    label: '메모 검색',
    description: '제목/본문에 query 가 포함된 메모를 최근 순으로 찾는다. query 를 비우면 최근 메모 20개.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    async run(input) {
      const db = await getDb();
      const q = optStr(input.query);
      if (!q) {
        return db.getAllAsync('SELECT id, title, body, created_at FROM notes ORDER BY id DESC LIMIT 20');
      }
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return db.getAllAsync(
        `SELECT id, title, body, created_at FROM notes
         WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 20`,
        like,
        like,
      );
    },
  },
  {
    name: 'delete_note',
    label: '메모 삭제',
    description: 'id 로 메모를 삭제한다. 되돌릴 수 없다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    async run(input) {
      const db = await getDb();
      const r = await db.runAsync('DELETE FROM notes WHERE id = ?', int(input.id, 'id'));
      return { deleted: r.changes };
    },
  },
];
