/** 비서가 연동하는 내 앱 목록 (연동 앱 탭에 보여줄 설명) */
export type CatalogApp = {
  id: 'leaselog' | 'calendar' | 'flowledger' | 'google';
  name: string;
  tagline: string;
  emoji: string;
  /** 앱 열기 주소 (구글은 없음) */
  openUrl?: string;
  needs: string;
  read: string[];
  write: string[];
  examples: string[];
};

export const CATALOG: CatalogApp[] = [
  {
    id: 'flowledger', name: 'FlowLedger', tagline: '가계부 · 자산 기록', emoji: '💰', openUrl: 'flowledger://', needs: '최신 버전, 한 번 실행',
    read: ['통장 잔액·분류·예산', '기간별 지출 통계(분류 비율, 전월 비교)', '거래 내역 검색'],
    write: ['수입·지출·이체 기록 (앱을 열지 않고 바로)', '거래 수정·삭제', '통장 자동 지정 규칙'],
    examples: ['점심 9천원 먹었어', '이번 달 어디에 돈 많이 썼어?', '국민카드로 3만원 옷 샀어'],
  },
  {
    id: 'leaselog', name: 'LeaseLog', tagline: '월세 · 세입자 관리', emoji: '🏠', openUrl: 'rentmanager://assistant', needs: '1.8.0 이상, 한 번 실행',
    read: ['월별 수입, 미납, 납부 내역', '호실·공실·세입자 현황', '만기 임박 계약'],
    write: ['월세 납부 입력 화면 열기 (저장은 LeaseLog에서)', '세입자·계약 등록 화면 열기'],
    examples: ['저번 달 월 수입 알려줘', '이번 달 미납 있어?', '101호 45만원 입금했어'],
  },
  {
    id: 'calendar', name: '캘린더', tagline: '내가 만든 일정 앱', emoji: '📅', openUrl: 'calendarapp://', needs: '최신 버전, 한 번 실행',
    read: ['기간별 일정 (반복 일정 포함)'],
    write: ['새 일정 화면 열기 (저장은 캘린더에서)'],
    examples: ['이번 주 일정 알려줘', '내일 오후 3시 치과 약속 잡아줘'],
  },
  {
    id: 'google', name: '구글 캘린더', tagline: '일정 조회 · 추가 · 수정 · 삭제', emoji: '🗓️', needs: '구글 계정 연결',
    read: ['내 구글 캘린더 일정 조회'],
    write: ['일정 추가·수정·삭제 (실행 전 확인)'],
    examples: ['내일 일정 겹치는 거 있어?', '치과 약속 4시로 옮겨줘'],
  },
];
