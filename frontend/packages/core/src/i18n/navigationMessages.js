const rows = `
홈으로 이동|Go to home|返回首页|Về trang chủ|ホームへ
내 복지 현황|My welfare overview|我的福利概况|Tổng quan phúc lợi của tôi|自分の福祉状況
공고 찾기|Find notices|查找公告|Tìm thông báo|公示を探す
신청 일정 보기|View application dates|查看申请日程|Xem lịch đăng ký|申請日程を見る
저장 목록 보기|View saved notices|查看收藏列表|Xem thông báo đã lưu|保存した公示を見る
회원 정보|Account information|账户信息|Thông tin tài khoản|会員情報
{menu} 하위 메뉴|{menu} submenu|{menu}子菜单|Menu con {menu}|{menu}のサブメニュー
메뉴 닫기|Close menu|关闭菜单|Đóng menu|メニューを閉じる
날짜 선택|Choose a date|选择日期|Chọn ngày|日付を選択
이전 날짜|Previous day|前一天|Ngày trước|前の日
다음 날짜|Next day|后一天|Ngày tiếp theo|次の日
이달 날짜 모두 보기|Show all dates this month|查看本月所有日期|Xem tất cả các ngày trong tháng|今月のすべての日付を見る
날짜를 고르면 아래에서 신청 가능한 공고를 확인할 수 있어요.|Choose a date to see notices accepting applications below.|选择日期，即可在下方查看可申请的公告。|Chọn ngày để xem các thông báo đang nhận đăng ký bên dưới.|日付を選ぶと、下で申請可能な公示を確認できます。
`;
export const navigationMessages = Object.freeze(
  Object.fromEntries(
    rows
      .trim()
      .split("\n")
      .map((row) => {
        const [ko, en, zh, vi, ja] = row.split("|");
        return [ko, Object.freeze({ ko, en, zh, vi, ja })];
      }),
  ),
);
