// UI copy added by the assistant and service-introduction merge.
// Server dialogue, policy text, form values and user input remain original content.
const rows = `
맞춤 지원 탐색|Find relevant support|查找适合的支持|Tìm hỗ trợ phù hợp|自分に合う支援を探す
거주 지역과 생활정보를 바탕으로 관련 지원 공고를 확인합니다.|Find relevant support notices based on your location and circumstances.|根据您的居住地区和生活信息，查找相关支持公告。|Tìm thông báo hỗ trợ liên quan dựa trên nơi cư trú và hoàn cảnh của bạn.|居住地域や生活情報を基に、関連する支援の公示を確認します。
부족한 정보 확인|Fill in missing details|补充所需信息|Bổ sung thông tin còn thiếu|不足している情報を確認
확인되지 않은 조건은 질문으로 보완하고, 신청 전 준비 사항을 안내합니다.|We ask about missing details and help you prepare before applying.|我们会通过提问补充尚未确认的条件，并说明申请前需要准备的事项。|Chúng tôi hỏi thêm về các điều kiện chưa rõ và hướng dẫn chuẩn bị trước khi đăng ký.|未確認の条件は質問で補い、申請前に準備することをご案内します。
새 공고와 진행 관리|New notices and application progress|新公告与申请进度|Thông báo mới và tiến độ đăng ký|新しい公示と申請状況の管理
지속 안내를 켜면 새 공고를 모아보고, 신청 진행 상태를 직접 관리할 수 있습니다.|Turn on ongoing guidance to collect new notices and track your application progress.|开启持续指导后，即可汇总查看新公告，并自行管理申请进度。|Bật hướng dẫn liên tục để xem thông báo mới và tự quản lý tiến độ đăng ký.|継続案内をオンにすると、新しい公示をまとめて確認し、申請の進み具合をご自身で管理できます。
나에게 맞는 복지,|Support that fits your needs,|适合您的福利，|Phúc lợi phù hợp với bạn,|自分に合う福祉を、
한곳에서 관리하세요.|all in one place.|在此统一管理。|quản lý tại một nơi.|ひとつの場所で管理。
내 정보에 맞는 지원을 찾고, 신청 준비와 새로운 기회까지 이어드립니다.|Find support that fits your circumstances, prepare your applications, and keep up with new opportunities.|寻找适合您情况的支持，协助准备申请，并及时了解新的机会。|Tìm hỗ trợ phù hợp với hoàn cảnh, chuẩn bị đăng ký và nắm bắt cơ hội mới.|ご自身の情報に合う支援を探し、申請準備や新しい機会の確認までお手伝いします。
로그인하고 시작하기|Sign in to get started|登录并开始|Đăng nhập để bắt đầu|ログインして始める
필요한 정보만 선택 입력하고, 동의한 정보만 저장합니다.|Share only the information you choose. We save it only with your consent.|按需选择填写信息，仅在您同意后保存。|Chỉ nhập thông tin bạn chọn. Chúng tôi chỉ lưu khi bạn đồng ý.|必要な情報だけを選んで入力でき、同意した情報だけが保存されます。
AI 복지비서 주요 기능|AI welfare assistant features|AI福利助手主要功能|Tính năng chính của trợ lý phúc lợi AI|AI福祉アシスタントの主な機能
시작은 간단한 정보 등록부터|Start by adding a few details|填写简单信息，即可开始|Bắt đầu bằng vài thông tin cơ bản|簡単な情報登録からスタート
경제활동 상태, 가구 구성, 관심 분야를 선택하세요. 필요한 경우 주거·피해 정보를 추가할 수 있습니다.|Select your employment status, household composition, and interests. You can also add housing or damage information when relevant.|选择您的就业状态、家庭构成及关注领域。如有需要，还可补充住房或受损信息。|Chọn tình trạng việc làm, thành phần hộ gia đình và lĩnh vực quan tâm. Bạn có thể thêm thông tin nhà ở hoặc thiệt hại khi cần.|就業状況、世帯構成、関心のある分野を選択してください。必要に応じて住居・被害情報も追加できます。
정보 수정·삭제와 지속 안내 설정은 언제든 변경할 수 있습니다.|You can edit or delete your information and change ongoing guidance settings at any time.|您随时可以修改或删除信息，并更改持续指导设置。|Bạn có thể sửa hoặc xóa thông tin và thay đổi cài đặt hướng dẫn liên tục bất cứ lúc nào.|情報の変更・削除や継続案内の設定変更はいつでもできます。
AI 복지비서 이용 안내|How to use the AI welfare assistant|AI福利助手使用指南|Hướng dẫn sử dụng trợ lý phúc lợi AI|AI福祉アシスタントのご利用案内
경제활동 구분|Employment category|就业类别|Nhóm tình trạng việc làm|就業区分
취업·사업|Employment or self-employment|受雇或经营业务|Làm công hoặc kinh doanh|雇用・自営業
미취업|Not employed|未就业|Chưa có việc làm|未就業
세부 상태|Detailed status|具体状态|Tình trạng cụ thể|詳細な状況
임금근로자|Employee|受雇员工|Người làm công hưởng lương|賃金労働者
무직|Not currently working|目前无职业|Hiện không làm việc|無職
경제활동 상태 확인 필요|Employment status needs confirmation|需要确认就业状态|Cần xác nhận tình trạng việc làm|就業状況の確認が必要
기존 은퇴 정보가 저장되어 있습니다. 현재 경제활동 상태를 선택해 주세요.|Retirement was saved previously. Please select your current employment status.|此前已保存退休信息。请选择您目前的就业状态。|Trước đây bạn đã lưu thông tin nghỉ hưu. Vui lòng chọn tình trạng việc làm hiện tại.|以前の退職情報が保存されています。現在の就業状況を選択してください。
가구 구성|Household composition|家庭构成|Thành phần hộ gia đình|世帯構成
1인 가구|One-person household|一人家庭|Hộ một người|単身世帯
가족 동거 가구|Household living with family|与家人同住的家庭|Hộ sống cùng gia đình|家族と同居する世帯
구직 상태|Job-seeking status|求职状态|Tình trạng tìm việc|求職状況
구직 활동 없음|Not looking for work|未在求职|Không tìm việc|求職活動なし
경제활동 정보는 맞춤 공고 추천에 활용됩니다. 지원 자격과 가구원 수는 사업별 기준을 확인해 주세요.|Employment information is used to recommend relevant notices. Check each program’s criteria for eligibility and household size.|就业信息用于推荐相关公告。申请资格及家庭人数请以各项目标准为准。|Thông tin việc làm được dùng để gợi ý thông báo phù hợp. Vui lòng kiểm tra tiêu chí của từng chương trình về điều kiện và số thành viên hộ.|就業情報は関連する公示のおすすめに使用します。対象条件と世帯人数は事業ごとの基準をご確認ください。
경제활동 상태와 가구 구성|Employment status and household composition|就业状态与家庭构成|Tình trạng việc làm và thành phần hộ gia đình|就業状況と世帯構成
경제활동 상태|Employment status|就业状态|Tình trạng việc làm|就業状況
나이와 지역을 바꾸려면 회원 정보로 이동해요. 작성 중인 내용은 먼저 저장해 주세요.|Go to your account information to change your age or region. Save your current edits first.|如需更改年龄或地区，请前往账户信息。请先保存正在填写的内容。|Đến thông tin tài khoản để đổi tuổi hoặc khu vực. Hãy lưu nội dung đang nhập trước.|年齢や地域の変更は会員情報で行います。入力中の内容は先に保存してください。
내 정보가 저장됐어요. 새 공고 안내를 켜면 관련 지원을 찾아드려요.|Your information is saved. Turn on new notice updates to find relevant support.|您的信息已保存。开启新公告通知后，我们会为您寻找相关支持。|Thông tin của bạn đã được lưu. Bật thông báo mới để chúng tôi tìm hỗ trợ phù hợp.|情報を保存しました。新しい公示の案内をオンにすると、関連する支援を探します。
새 공고 안내 켜기|Turn on new notice updates|开启新公告通知|Bật thông báo mới|新しい公示の案内をオンにする
나이|Age|年龄|Tuổi|年齢
나에게 맞는 지원을 위한 정보|Information to find support for you|寻找适合您的支持所需的信息|Thông tin để tìm hỗ trợ phù hợp|自分に合う支援を探すための情報
아는 항목만 선택해 주세요. 모르는 정보는 비워 두어도 괜찮아요.|Fill in what you know. You can leave anything you are unsure about blank.|请填写您了解的项目，不确定的信息可以留空。|Chỉ điền thông tin bạn biết. Bạn có thể để trống những mục chưa rõ.|分かる項目だけ入力してください。分からない情報は空欄でも大丈夫です。
기본 생활정보|Basic life information|基本生活信息|Thông tin đời sống cơ bản|基本的な生活情報
관심 있는 지원|Support you are interested in|您感兴趣的支持|Hỗ trợ bạn quan tâm|関心のある支援
여러 개를 선택해도 좋아요. 나중에 바꿀 수 있어요.|Choose as many as you like. You can change them later.|可选择多项，之后也可以修改。|Bạn có thể chọn nhiều mục và thay đổi sau.|複数選べます。後から変更できます。
필요한 정보가 더 있다면 함께 입력해 주세요.|Add any other relevant information here.|如有其他相关信息，也请在这里填写。|Hãy bổ sung thông tin liên quan khác tại đây.|ほかに関連する情報があれば、こちらに入力してください。
주거 정보|Housing information|住房信息|Thông tin nhà ở|住居情報
모르면 비워 두세요.|Leave blank if you do not know.|不知道可以留空。|Để trống nếu bạn chưa biết.|分からなければ空欄にしてください。
최근 피해 정보|Recent damage information|近期受损信息|Thông tin thiệt hại gần đây|最近の被害情報
직접 겪은 피해만 알려주세요. 지역의 재난 발생만으로 피해를 판단하지 않아요.|Tell us only about damage you experienced. We do not assume you were affected just because a disaster occurred in your area.|请只填写您实际遭受的损失。我们不会仅因所在地区发生灾害就认定您受灾。|Chỉ cho biết thiệt hại bạn thực sự trải qua. Chúng tôi không mặc định bạn bị ảnh hưởng chỉ vì nơi bạn sống có thiên tai.|実際に受けた被害だけを教えてください。地域で災害が起きただけで被害があったとは判断しません。
정보 저장과 안내 설정|Information storage and update settings|信息保存与通知设置|Cài đặt lưu thông tin và cập nhật|情報の保存と案内設定
새 공고도 계속 알려받기|Keep me updated on new notices|持续接收新公告通知|Tiếp tục nhận thông báo mới|新しい公示の案内を受け取る
저장한 정보로 새 공고를 확인하고, 이 화면에서 알려드려요.|We check new notices using your saved information and show updates on this page.|我们会根据您保存的信息查看新公告，并在此页面提供通知。|Chúng tôi dùng thông tin đã lưu để kiểm tra thông báo mới và cập nhật tại trang này.|保存した情報を基に新しい公示を確認し、この画面でお知らせします。
새 공고도 계속 알려받기 (선택)|Keep me updated on new notices (optional)|持续接收新公告通知（可选）|Tiếp tục nhận thông báo mới (không bắt buộc)|新しい公示の案内を受け取る（任意）
저장한 정보는 언제든 수정하거나 삭제할 수 있어요.|You can edit or delete your saved information at any time.|您随时可以修改或删除已保存的信息。|Bạn có thể sửa hoặc xóa thông tin đã lưu bất cứ lúc nào.|保存した情報はいつでも変更・削除できます。
저장하고 지원 찾기|Save and find support|保存并查找支持|Lưu và tìm hỗ trợ|保存して支援を探す
내 정보 저장하기|Save my information|保存我的信息|Lưu thông tin của tôi|自分の情報を保存
내 정보부터 간단히 알려주세요|Start with a little about yourself|先简单介绍一下您的情况|Bắt đầu với một chút thông tin về bạn|まずはご自身の情報を教えてください
생활정보와 관심 분야를 알려주시면 나에게 맞는 지원을 찾는 데 도움이 돼요.|Your life information and interests help us find support that fits your needs.|您的生活信息和兴趣领域有助于我们寻找适合您的支持。|Thông tin đời sống và lĩnh vực quan tâm giúp chúng tôi tìm hỗ trợ phù hợp với bạn.|生活情報や関心のある分野を教えていただくと、自分に合う支援を探しやすくなります。
내 정보 입력하기|Add my information|填写我的信息|Nhập thông tin của tôi|自分の情報を入力
모든 정보는 선택 사항이에요. 아는 내용만 입력해 주세요.|All information is optional. Fill in only what you know.|所有信息均为选填，请只填写您了解的内容。|Mọi thông tin đều không bắt buộc. Chỉ điền những gì bạn biết.|すべて任意です。分かる内容だけ入力してください。
맞춤 지원|Support for you|适合您的支持|Hỗ trợ phù hợp|自分に合う支援
새 공고를 계속 확인하고 있어요.|We are checking for new notices.|我们会持续查看新公告。|Chúng tôi đang tiếp tục kiểm tra thông báo mới.|新しい公示を継続して確認しています。
새 공고 알림이 꺼져 있어요.|New notice updates are off.|新公告通知已关闭。|Thông báo về các công bố mới đang tắt.|新しい公示の案内はオフです。
AI에게 물어보기|Ask AI|向AI提问|Hỏi AI|AIに質問する
생활정보를 더 입력하면 지원을 찾는 데 도움이 돼요.|Adding more life information helps us find support for you.|补充生活信息有助于我们为您寻找支持。|Bổ sung thông tin đời sống giúp chúng tôi tìm hỗ trợ cho bạn.|生活情報を追加すると、支援を探しやすくなります。
내 정보 수정|Edit my information|修改我的信息|Sửa thông tin của tôi|自分の情報を編集
새 안내 {count}개 보기|View {count} new updates|查看{count}条新通知|Xem {count} cập nhật mới|新しい案内{count}件を見る
신청 현황 {count}개 보기|View {count} applications|查看{count}项申请进度|Xem tiến độ {count} đơn đăng ký|申請状況{count}件を見る
새 공고 안내 켜짐|New notice updates on|新公告通知已开启|Thông báo mới đang bật|新しい公示の案内：オン
새 공고 안내 꺼짐|New notice updates off|新公告通知已关闭|Thông báo mới đang tắt|新しい公示の案内：オフ
더 정확한 안내를 위해 확인할 정보가 있어요.|There is some information to check for more accurate guidance.|有些信息需要确认，以便提供更准确的指导。|Cần kiểm tra một số thông tin để hướng dẫn chính xác hơn.|より正確な案内のために、確認が必要な情報があります。
{count}개 확인하기|Review {count} items|确认{count}项|Kiểm tra {count} mục|{count}件を確認
나에게 맞는 복지를 찾고, 다음 기회도 챙겨요.|Find support that fits your needs and keep up with new opportunities.|寻找适合您的福利，及时了解新的机会。|Tìm phúc lợi phù hợp và nắm bắt các cơ hội mới.|自分に合う福祉を探し、新しい機会も確認しましょう。
내 정보를 알려주시면 지원받을 만한 공고와 신청 준비를 도와드려요.|Share your information to find relevant support notices and prepare your applications.|提供您的信息，我们会帮助您查找可能适用的支持公告并准备申请。|Chia sẻ thông tin để được giúp tìm thông báo hỗ trợ phù hợp và chuẩn bị đăng ký.|情報を入力すると、利用できそうな支援の公示探しや申請準備をお手伝いします。
궁금한 점 물어보기|Ask a question|咨询问题|Đặt câu hỏi|質問する
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
