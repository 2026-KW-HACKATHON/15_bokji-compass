const rows = `
알림|Notifications|通知|Thông báo|通知
새 알림|New|新通知|Mới|新着
알림, 안 읽은 알림 {count}개|Notifications, {count} unread|通知，{count}条未读|Thông báo, {count} chưa đọc|通知、未読{count}件
알림 닫기|Close notifications|关闭通知|Đóng thông báo|通知を閉じる
알림 전체 보기|View all notifications|查看所有通知|Xem tất cả thông báo|すべての通知を見る
알림을 불러오지 못했어요.|Could not load notifications.|无法加载通知。|Không tải được thông báo.|通知を読み込めませんでした。
알림을 불러오고 있어요.|Loading notifications…|正在加载通知…|Đang tải thông báo…|通知を読み込んでいます。
아직 새 알림이 없어요.|No new notifications yet.|暂无新通知。|Chưa có thông báo mới.|まだ新しい通知はありません。
내 상황에 맞는 공고가 도착하면 알려드려요.|We will let you know when a relevant notice arrives.|收到与您情况相关的公告时会通知您。|Chúng tôi sẽ báo khi có thông báo phù hợp với bạn.|状況に合った公示が届いたらお知らせします。
관련 공고 보기|View related notice|查看相关公告|Xem thông báo liên quan|関連する公示を見る
{title} 관련 공고 보기|View notice related to {title}|查看与{title}相关的公告|Xem thông báo liên quan đến {title}|{title}に関連する公示を見る
관련 공고를 여는 중이에요.|Opening the related notice…|正在打开相关公告…|Đang mở thông báo liên quan…|関連する公示を開いています。
알림을 읽음으로 저장하지 못했어요. 다시 시도해 주세요.|Could not mark the notification as read. Please try again.|无法将通知标记为已读，请重试。|Không thể đánh dấu đã đọc. Vui lòng thử lại.|通知を既読にできませんでした。もう一度お試しください。
공고가 더 이상 제공되지 않아 관련 복지 안내로 이동했어요.|This notice is no longer available. We opened the related welfare guidance.|该公告已不可用，已转到相关福利指引。|Thông báo không còn khả dụng. Đã chuyển đến hướng dẫn phúc lợi liên quan.|公示の提供が終了したため、関連する福祉案内を開きました。
관련 공고를 불러오지 못했어요. 알림을 다시 눌러 주세요.|Could not load the related notice. Please select the notification again.|无法加载相关公告，请再次点击通知。|Không tải được thông báo liên quan. Vui lòng nhấn lại.|関連する公示を読み込めませんでした。通知をもう一度押してください。
홈으로 이동|Go to home|返回首页|Về trang chủ|ホームへ
서비스 안내|Service guide|服务指南|Hướng dẫn dịch vụ|サービスガイド
내 복지 현황|My welfare overview|我的福利概况|Tổng quan phúc lợi của tôi|自分の福祉状況
공고 찾기|Find notices|查找公告|Tìm thông báo|公示を探す
신청 일정 보기|View application dates|查看申请日程|Xem lịch đăng ký|申請日程を見る
저장 목록 보기|View saved notices|查看收藏列表|Xem thông báo đã lưu|保存した公示を見る
회원 정보|Account information|账户信息|Thông tin tài khoản|会員情報
신규공고 확인하기|New notices|查看新公告|Xem thông báo mới|新着公示を確認
지속 복지 안내 설정|Ongoing welfare guidance settings|持续福利指引设置|Cài đặt hướng dẫn phúc lợi liên tục|継続的な福祉案内の設定
내 상황과 관련해 새로 도착한 공고 안내를 모아봤어요.|Find new notices related to your circumstances here.|在这里查看与您的情况相关的新公告。|Xem các thông báo mới liên quan đến hoàn cảnh của bạn tại đây.|自分の状況に関連する新着の公示案内をまとめました。
등록된 재난 지원 공고를 찾으면 실제 피해 여부부터 확인해요.|When a disaster support notice is found, we first check whether you experienced damage.|发现灾害支援公告后，会先确认您是否实际受灾。|Khi tìm thấy thông báo hỗ trợ thiên tai, trước tiên chúng tôi xác nhận bạn có bị thiệt hại hay không.|災害支援の公示が見つかったら、まず実際の被害の有無を確認します。
확인한 정보를 저장했어요. AI 비서의 지속 복지 안내를 켜면 이후 공고도 살펴볼 수 있어요.|Confirmed information saved. Turn on ongoing welfare guidance under AI assistant to explore future notices.|已保存确认信息。在AI助手中开启持续福利指引，即可查看后续公告。|Đã lưu thông tin xác nhận. Bật hướng dẫn phúc lợi liên tục trong Trợ lý AI để xem các thông báo sau.|確認した情報を保存しました。AIアシスタントの継続福祉案内を有効にすると、今後の公示も確認できます。
본인 상담은 저장한 생활정보도 참고해요. 상황이 바뀌었다면 지속 복지 안내에서 수정할 수 있어요.|Personal consultations also use saved life information. Update it in ongoing welfare guidance if your situation changes.|个人咨询也会参考已保存的生活信息。情况有变时，可在持续福利指引中修改。|Tư vấn cá nhân cũng tham khảo thông tin cuộc sống đã lưu. Nếu hoàn cảnh thay đổi, hãy cập nhật trong hướng dẫn phúc lợi liên tục.|ご本人の相談には保存した生活情報も参考にします。状況が変わった場合は、継続福祉案内で修正できます。
{menu} 하위 메뉴|{menu} submenu|{menu}子菜单|Menu con {menu}|{menu}のサブメニュー
메뉴 닫기|Close menu|关闭菜单|Đóng menu|メニューを閉じる
끄기|Turn off|关闭|Tắt|オフ
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
