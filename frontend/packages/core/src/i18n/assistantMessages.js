// UI copy added by the assistant and service-introduction merge.
// Server dialogue, policy text, form values and user input remain original content.
const rows = `
AI 비서|AI assistant|AI助手|Trợ lý AI|AIアシスタント
AI 복지비서|AI welfare assistant|AI福利助手|Trợ lý phúc lợi AI|AI福祉アシスタント
서비스 소개|About this service|服务介绍|Giới thiệu dịch vụ|サービス紹介
나를 위한 지원 현황|My support overview|我的支持概况|Tổng quan hỗ trợ của tôi|自分向けの支援状況
내 상황 요약|My situation|我的情况|Tình hình của tôi|自分の状況
한눈에 보기|Overview|一览|Tổng quan|概要
지원 후보|Support options|支持候选|Các hỗ trợ phù hợp|支援候補
추가 확인|More information|补充确认|Thông tin bổ sung|追加確認
신청 현황|Application progress|申请进度|Tiến độ đăng ký|申請状況
질문할 공고|Notice to ask about|咨询的公告|Thông báo muốn hỏi|質問する公示
내 지원 현황을 가져오고 있어요.|Loading your support overview.|正在加载您的支持概况。|Đang tải tổng quan hỗ trợ của bạn.|支援状況を読み込んでいます。
내 상황을 더 알려주세요|Tell us more about your situation|请补充您的情况|Hãy cho biết thêm về tình hình của bạn|状況をもう少し教えてください
저장한 생활정보와 등록된 공고를 기준으로 정리했어요.|Based on your saved information and published notices.|根据您保存的信息和已发布的公告整理。|Dựa trên thông tin đã lưu và thông báo được công bố.|保存した生活情報と公開公示を基に整理しました。
아직 저장한 생활정보가 없어요.|No life information saved yet.|尚未保存生活信息。|Chưa lưu thông tin đời sống.|生活情報はまだ保存されていません。
생활정보 추가하기|Add life information|添加生活信息|Thêm thông tin đời sống|生活情報を追加
생활정보 수정하기|Edit life information|修改生活信息|Sửa thông tin đời sống|生活情報を編集
추가 확인 정보|Information to check|待确认信息|Thông tin cần kiểm tra|追加確認する情報
안내함 확인하기|Open updates|查看通知|Xem cập nhật|案内を確認
확인할 정보 살펴보기|Review information to check|查看待确认信息|Xem thông tin cần kiểm tra|確認する情報を見る
대화로 상황 추가하기|Add information through a conversation|通过对话补充情况|Thêm thông tin qua trò chuyện|対話で状況を追加
진행 중인 지원 보기|View support in progress|查看进行中的支持|Xem hỗ trợ đang tiến hành|進行中の支援を見る
내 정보와 안내 설정|My information and guidance settings|我的信息和指导设置|Thông tin và cài đặt hướng dẫn|自分の情報と案内設定
다시 보기|Replay|重新播放|Phát lại|もう一度見る
AI 복지비서 시작하기|Open the AI welfare assistant|打开AI福利助手|Mở trợ lý phúc lợi AI|AI福祉アシスタントを開く
챗봇 열어보기|Try the chatbot|试用聊天机器人|Thử chatbot|チャットボットを試す
AI 복지비서를 불러오고 있어요.|Loading the AI welfare assistant.|正在加载AI福利助手。|Đang tải trợ lý phúc lợi AI.|AI福祉アシスタントを読み込んでいます。
서비스 소개를 불러오고 있어요.|Loading the service introduction.|正在加载服务介绍。|Đang tải phần giới thiệu dịch vụ.|サービス紹介を読み込んでいます。
내 상황을 기억하는 복지 안내|Welfare guidance that remembers your situation|记住您情况的福利指南|Hướng dẫn phúc lợi ghi nhớ tình hình của bạn|あなたの状況を覚えている福祉案内
새로 발견한 지원부터 신청 준비까지, 나에게 필요한 다음 단계를 한곳에서 확인해요.|From new support options to application preparation, find your next steps in one place.|从新发现的支持项目到申请准备，在这里查看适合您的下一步。|Từ hỗ trợ mới đến chuẩn bị đăng ký, xem các bước tiếp theo tại một nơi.|新たな支援から申請準備まで、必要な次のステップを一か所で確認できます。
상황을 대화로 추가하기|Share your situation in a conversation|通过对话补充情况|Chia sẻ tình hình qua trò chuyện|対話で状況を伝える
필요한 정보만, 하나씩|Just the information we need, one step at a time|只问必要的信息，一步一步来|Chỉ thông tin cần thiết, từng bước một|必要な情報だけ、一つずつ
모르는 정보는 건너뛰어도 괜찮아요. 확인한 내용은 동의 후에만 내 정보로 저장해요.|You can skip anything you do not know. Confirmed information is saved to your profile only with your consent.|不知道的信息可以跳过。确认后的信息仅在您同意后保存到个人资料。|Bạn có thể bỏ qua thông tin chưa biết. Thông tin đã xác nhận chỉ được lưu vào hồ sơ khi bạn đồng ý.|分からない情報はスキップできます。確認した内容は、同意後にのみプロフィールに保存します。
내 상황 입력하기|Describe my situation|描述我的情况|Mô tả tình hình của tôi|自分の状況を入力する
현재 상황이나 궁금한 내용을 자유롭게 적어 주세요.|Describe your situation or ask a question in your own words.|请自由描述您的情况或想咨询的内容。|Hãy tự do mô tả tình hình của bạn hoặc điều bạn muốn hỏi.|現在の状況や気になることを自由に書いてください。
AI 복지비서에서 확인하기|View in the AI welfare assistant|在AI福利助手中查看|Xem trong trợ lý phúc lợi AI|AI福祉アシスタントで確認
AI 복지비서에서 이어보기|Continue in the AI welfare assistant|在AI福利助手中继续|Tiếp tục trong trợ lý phúc lợi AI|AI福祉アシスタントで続ける
AI 복지비서로 이동하면 입력한 내용을 이어볼 수 있어요.|You can continue with your current input in the AI welfare assistant.|转到AI福利助手后，可以继续使用已输入的内容。|Bạn có thể tiếp tục với nội dung đã nhập trong trợ lý phúc lợi AI.|AI福祉アシスタントに移動すると、入力した内容を引き継げます。
새로고침하거나 로그아웃하면 화면의 대화는 초기화돼요. 입력한 상담 정보는 서버에서 최대 30분간 임시로 사용하고, 저장을 선택한 생활정보만 계정에 남아요.|Refreshing or signing out clears the conversation on this screen. Consultation information is used temporarily on the server for up to 30 minutes. Only life information you choose to save remains in your account.|刷新页面或退出登录会清除屏幕上的对话。咨询信息在服务器上临时使用，最长30分钟。只有您选择保存的生活信息会保留在账户中。|Tải lại trang hoặc đăng xuất sẽ xóa cuộc trò chuyện trên màn hình. Thông tin tư vấn được dùng tạm thời trên máy chủ tối đa 30 phút. Chỉ thông tin đời sống bạn chọn lưu mới được giữ trong tài khoản.|再読み込みやログアウトで画面の対話はリセットされます。相談情報はサーバーで最大30分間、一時的に使用します。保存を選んだ生活情報だけがアカウントに残ります。
지속 안내가 꺼져 있어요. 저장된 기록은 확인할 수 있고, 안내 설정에서 다시 켤 수 있어요.|Ongoing guidance is off. You can view saved records and turn it back on in guidance settings.|持续指导已关闭。您可以查看已保存的记录，并在指导设置中重新开启。|Hướng dẫn liên tục đang tắt. Bạn có thể xem bản ghi đã lưu và bật lại trong cài đặt hướng dẫn.|継続案内はオフです。保存した記録は確認でき、案内設定で再びオンにできます。
생활정보를 추가하면 내 상황에 맞는 지원을 함께 살펴볼 수 있어요.|Add life information to explore support that fits your situation.|添加生活信息后，我们可以一起查看适合您情况的支持项目。|Thêm thông tin đời sống để cùng tìm hỗ trợ phù hợp với tình hình của bạn.|生活情報を追加すると、状況に合う支援を一緒に探せます。
최근 공고 확인 ·|Last checked ·|最近查看公告 ·|Kiểm tra gần nhất ·|公示の最終確認 ·
AI 복지비서 상세 항목|AI welfare assistant sections|AI福利助手详细栏目|Các mục của trợ lý phúc lợi AI|AI福祉アシスタントの詳細項目
신청 진행 상태|Application progress|申请进度|Tiến độ đăng ký|申請状況
안내 설정|Guidance settings|指导设置|Cài đặt hướng dẫn|案内設定
대화로 정보 추가하기|Add information through a conversation|通过对话添加信息|Thêm thông tin qua trò chuyện|対話で情報を追加
공고에서 조건 확인하기|Check the notice requirements|查看公告条件|Kiểm tra điều kiện trong thông báo|公示で条件を確認
아직 신청 진행 기록이 없어요. 관련 지원 후보에서 신청 준비 중 또는 신청 완료로 표시하면 여기에 모아볼 수 있어요.|No application progress recorded yet. Mark a support option as preparing or applied to see it here.|尚无申请进度记录。将相关支持项目标记为准备申请或已申请后，即可在这里查看。|Chưa có bản ghi tiến độ đăng ký. Đánh dấu hỗ trợ là đang chuẩn bị hoặc đã đăng ký để xem tại đây.|申請の記録はまだありません。支援候補を申請準備中や申請済みにすると、ここでまとめて確認できます。
아직 저장한 생활정보가 없어요. 내 상황을 추가하고 지속 안내를 켜면 관련 지원 후보를 찾아드려요.|No life information saved yet. Add your situation and enable ongoing guidance to find relevant support options.|尚未保存生活信息。补充您的情况并开启持续指导后，我们将为您寻找相关支持项目。|Chưa lưu thông tin đời sống. Thêm tình hình của bạn và bật hướng dẫn liên tục để tìm các hỗ trợ phù hợp.|生活情報はまだ保存されていません。状況を追加して継続案内をオンにすると、関連する支援候補を探します。
직접 저장한 정보로 살펴봐요. 상황이 달라지면 알려주세요.|We use the information you saved. Let us know if your situation changes.|我们会参考您保存的信息。情况有变化时，请告诉我们。|Chúng tôi dựa trên thông tin bạn đã lưu. Hãy cho biết nếu tình hình thay đổi.|ご自身で保存した情報を基に確認します。状況が変わったら教えてください。
주거·일·재난 피해 등 필요한 정보만 추가해 주세요.|Add only the information needed, such as housing, work or disaster damage.|请仅添加住房、工作、灾害损失等必要信息。|Chỉ thêm thông tin cần thiết như nhà ở, việc làm hoặc thiệt hại do thiên tai.|住居・仕事・災害被害など、必要な情報だけを追加してください。
새로 도착한 안내가 없어요.|No new updates yet.|暂无新通知。|Chưa có cập nhật mới.|新しい案内はありません。
지속 안내를 켜면 새 공고와 변경 내용을 모아드려요.|Enable ongoing guidance to see new notices and changes here.|开启持续指导后，我们会在这里汇总新公告和变更。|Bật hướng dẫn liên tục để xem thông báo mới và thay đổi tại đây.|継続案内をオンにすると、新しい公示や変更をここにまとめます。
현재 안내에서 추가로 요청한 정보가 없어요. 신청 자격은 공고별로 확인해 주세요.|No additional information requested at the moment. Check eligibility for each notice.|目前无需补充信息。请逐一确认各公告的申请资格。|Hiện chưa cần bổ sung thông tin. Hãy kiểm tra điều kiện đăng ký của từng thông báo.|現在、追加で必要な情報はありません。申請資格は公示ごとに確認してください。
궁금한 상황을 이야기하면 필요한 정보를 하나씩 확인해요.|Tell us about your situation, and we will check the details one at a time.|告诉我们您的情况，我们会逐一确认必要信息。|Chia sẻ tình hình của bạn để chúng tôi kiểm tra từng thông tin cần thiết.|気になる状況を伝えると、必要な情報を一つずつ確認します。
준비 중|Preparing|准备中|Đang chuẩn bị|準備中
확인 완료|Confirmed|已确认|Đã xác nhận|確認済み
직접 표시한 진행 상태예요. 기관의 접수 결과와는 별도로 관리해요.|These are the statuses you set. They are tracked separately from the agency's application results.|这是您自行标记的进度，与机构的受理结果分别管理。|Đây là trạng thái do bạn đánh dấu, được quản lý riêng với kết quả tiếp nhận của cơ quan.|ご自身で設定した状況です。機関の受付結果とは別に管理します。
{year}년 준공|Built in {year}|{year}年竣工|Hoàn thành năm {year}|{year}年竣工
주택 수리 필요|Home repairs needed|需要维修房屋|Cần sửa nhà|住宅修理が必要
재난 피해 있음|Affected by a disaster|遭受灾害损失|Bị ảnh hưởng bởi thiên tai|災害被害あり
`;
export const assistantMessages = Object.freeze(
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
