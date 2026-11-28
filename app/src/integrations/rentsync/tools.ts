import type { AgentTool } from '@/agent/tool';
import { buildAddArgs } from '../flowledger/pure';
import { call, getAutoRecord } from '../flowledger/tools';
import { query } from '../leaselog/tools';
import { buildRentAdds, paymentRows } from './pure';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const CATEGORY = '부수입';

const monthOf = (input: Record<string, unknown>): string => {
  if (input.month == null || input.month === '') {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof input.month !== 'string' || !YM.test(input.month)) throw new Error('month 는 YYYY-MM 형식이어야 해요');
  return input.month;
};

async function load(input: Record<string, unknown>) {
  const month = monthOf(input);
  const r = await query({ what: 'payments', month });
  return { month, adds: buildRentAdds(paymentRows(r.data)) };
}

export const rentSyncTools: AgentTool[] = [
  {
    name: 'rent_sync_to_flowledger',
    label: '월세 입금을 가계부에 반영',
    describe: (i) => `월세 입금 가계부 반영${i.month ? ` (${i.month})` : ' (이번 달)'}`,
    description:
      'LeaseLog 에 기록된 월세 입금(입금일 기준)을 FlowLedger 가계부에 "수입"으로 옮긴다. "월세 가계부에 반영해줘", "이번 달 월세 가계부에 넣어줘" 같은 요청에 쓴다. ' +
      '입금을 LeaseLog 에 저장한 건만 대상이며(미납·미저장은 제외), 건마다 고유 번호가 있어 여러 번 실행해도 중복으로 들어가지 않는다. ' +
      'month 는 입금일이 속한 달 YYYY-MM(생략하면 이번 달). 늦게 낸 월세는 실제 입금된 달에 반영된다. 세입자 이름·연락처는 보내지 않고 호실·금액·입금일만 쓴다. ' +
      '결과는 "N건 반영, M건은 이미 반영됨"처럼 짧게 알린다. 방금 건을 취소하려면 flowledger_delete 에 id 를 쓴다.',
    needsConfirm: true,
    skipConfirm: getAutoRecord,
    inputSchema: {
      type: 'object',
      properties: { month: { type: 'string', description: '입금일이 속한 달 YYYY-MM (생략하면 이번 달)' } },
    },
    async preview(input) {
      const { month, adds } = await load(input);
      if (!adds.length) return `${month} 에 LeaseLog 에 저장된 월세 입금이 없어요.`;
      const total = adds.reduce((s, a) => s + a.amount, 0);
      return [`${month} 월세 입금 ${adds.length}건 · ${total.toLocaleString('ko-KR')}원을 가계부 수입으로 반영`, ...adds.slice(0, 12).map((a) => `  · ${a.label}`), ...(adds.length > 12 ? [`  … 외 ${adds.length - 12}건`] : []), '이미 반영된 건은 건너뛰어요.'].join('\n');
    },
    async run(input) {
      const { month, adds } = await load(input);
      let added = 0;
      let skipped = 0;
      const failed: string[] = [];
      for (const a of adds) {
        const base = { type: 'income', amount: a.amount, date: a.date, merchant: a.merchant, memo: 'LeaseLog 입금', tags: '월세' };
        try {
          let r: { duplicate?: boolean };
          try {
            r = await call('add', buildAddArgs({ ...base, category: CATEGORY }, a.req_id));
          } catch (e) {
            // 분류 이름을 바꿔 둔 경우: 분류 없이 기록(기타수입)
            if (e instanceof Error && /분류|카테고리|category/.test(e.message)) r = await call('add', buildAddArgs(base, a.req_id));
            else throw e;
          }
          if (r.duplicate) skipped++;
          else added++;
        } catch (e) {
          failed.push(`${a.label}: ${e instanceof Error ? e.message : '실패'}`);
        }
      }
      return {
        source: 'LeaseLog → FlowLedger', month, total: adds.length, added, alreadySynced: skipped,
        ...(failed.length ? { failed } : {}),
        ...(adds.length === 0 ? { note: `${month} 에 LeaseLog 에 저장된 월세 입금이 없어요` } : {}),
      };
    },
  },
];
