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
