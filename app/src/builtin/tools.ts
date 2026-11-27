import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

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
    describe: (i) => `할 일 추가: ${i.title}${i.due ? ` (${i.due})` : ''}`,
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
    readOnly: true,
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
    describe: (i) => `할 일 완료 처리 (#${i.id})`,
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
    describe: (i) => `할 일 삭제 (#${i.id})`,
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
    describe: (i) => `메모 저장: ${i.title}`,
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
    readOnly: true,
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
    describe: (i) => `메모 삭제 (#${i.id})`,
    description: 'id 로 메모를 삭제한다. 되돌릴 수 없다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    async run(input) {
      const db = await getDb();
      const r = await db.runAsync('DELETE FROM notes WHERE id = ?', int(input.id, 'id'));
      return { deleted: r.changes };
    },
  },
  {
    name: 'update_task',
    label: '할 일 수정',
    describe: (i) => `할 일 수정 (#${i.id}): ${[i.title && `제목→${i.title}`, i.due !== undefined && `마감→${i.due || '없음'}`].filter(Boolean).join(', ')}`,
    description: 'id 로 할 일의 제목이나 마감(due)을 바꾼다. 바꿀 항목만 보낸다. due 를 빈 문자열로 보내면 마감을 지운다. id 는 list_tasks 결과에서 확인한다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer' }, title: { type: 'string' }, due: { type: 'string', description: 'ISO 날짜/날짜시간. 빈 문자열이면 지움' } },
      required: ['id'],
    },
    async run(input) {
      const db = await getDb();
      const id = int(input.id, 'id');
      const sets: string[] = [];
      const args: (string | number | null)[] = [];
      if (input.title !== undefined) { sets.push('title = ?'); args.push(str(input.title, 'title')); }
      if (input.due !== undefined) { sets.push('due = ?'); args.push(optStr(input.due)); }
      if (!sets.length) throw new Error('바꿀 항목(title, due)이 없습니다');
      const r = await db.runAsync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, ...args, id);
      return { updated: r.changes };
    },
  },
  {
    name: 'update_note',
    label: '메모 수정',
    describe: (i) => `메모 ${i.append ? '이어쓰기' : '수정'} (#${i.id})`,
    description: 'id 로 메모를 고친다. title/body 를 주면 바꾸고, append 를 주면 본문 끝에 덧붙인다. id 는 search_notes 결과에서 확인한다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer' }, title: { type: 'string' }, body: { type: 'string' }, append: { type: 'string', description: '본문 끝에 덧붙일 내용' } },
      required: ['id'],
    },
    async run(input) {
      const db = await getDb();
      const id = int(input.id, 'id');
      let changes = 0;
      if (input.title !== undefined) changes += (await db.runAsync('UPDATE notes SET title = ? WHERE id = ?', str(input.title, 'title'), id)).changes;
      if (input.body !== undefined) changes += (await db.runAsync('UPDATE notes SET body = ? WHERE id = ?', str(input.body, 'body'), id)).changes;
      if (input.append !== undefined) {
        changes += (await db.runAsync("UPDATE notes SET body = body || char(10) || ? WHERE id = ?", str(input.append, 'append'), id)).changes;
      }
      if (!changes && input.title === undefined && input.body === undefined && input.append === undefined) throw new Error('바꿀 항목이 없습니다');
      return { updated: changes > 0 };
    },
  },
  {
    name: 'set_reminder',
    label: '알림 예약',
    describe: (i) => `알림 예약: ${i.message} (${i.at})`,
    description: '지정한 시각에 이 기기에 알림을 띄운다. at 은 ISO 8601 이며 시간대 표시가 없으면 기기 현지 시각(예: 2026-11-27T15:00). 반드시 미래 시각이어야 한다. 일정·할 일 자체가 아니라 "그 시간에 알려줘"일 때 쓴다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: '알림에 보일 내용' }, at: { type: 'string', description: '알림 시각 ISO 8601' } },
      required: ['message', 'at'],
    },
    async run(input) {
      const message = str(input.message, 'message').slice(0, 200);
      const at = new Date(str(input.at, 'at'));
      if (Number.isNaN(at.getTime())) throw new Error('at 을 날짜로 해석할 수 없습니다');
      if (at.getTime() <= Date.now() + 5000) throw new Error('알림 시각은 지금보다 뒤여야 합니다');
      if (!(await Notifications.requestPermissionsAsync()).granted) throw new Error('알림 권한이 허용되지 않았어요. 설정에서 허용해 주세요.');
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminder', { name: '알림', importance: AndroidImportance.HIGH });
      }
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: '비서 알림', body: message, data: { type: 'reminder' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminder' },
      });
      return { id, at: at.toISOString() };
    },
  },
  {
    name: 'list_reminders',
    label: '예약된 알림 조회',
    readOnly: true,
    description: '비서가 예약해 둔 알림 목록(내용, 시각, id)을 조회한다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      return all
        .filter((n) => (n.content.data as { type?: string } | null)?.type === 'reminder')
        .map((n) => {
          const t = n.trigger as { value?: number; date?: number } | null;
          const ms = t?.value ?? t?.date;
          return { id: n.identifier, message: n.content.body, at: typeof ms === 'number' ? new Date(ms).toISOString() : null };
        });
    },
  },
  {
    name: 'cancel_reminder',
    label: '알림 취소',
    describe: () => '예약된 알림 취소',
    description: 'list_reminders 로 확인한 id 의 알림 예약을 취소한다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    async run(input) {
      await Notifications.cancelScheduledNotificationAsync(str(input.id, 'id'));
      return { cancelled: true };
    },
  },
  {
    name: 'copy_to_clipboard',
    label: '클립보드에 복사',
    describe: (i) => `클립보드에 복사: ${String(i.text ?? '').slice(0, 30)}`,
    description: '문자·메일 초안처럼 사용자가 다른 앱에 붙여 넣을 글을 클립보드에 복사한다. 사용자가 복사를 원할 때만 쓴다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    async run(input) {
      const text = str(input.text, 'text').slice(0, 5000);
      await Clipboard.setStringAsync(text);
      return { copied: text.length };
    },
  },
];
