// UI copy added by the assistant and service-introduction merge.
// Server dialogue, policy text, form values and user input remain original content.
const rows = `
AI 비서와 대화하기|Chat with the AI assistant|与AI助手对话|Trò chuyện với trợ lý AI|AIアシスタントと対話する
AI 비서 대화|AI assistant conversation|AI助手对话|Cuộc trò chuyện với trợ lý AI|AIアシスタントとの会話
대화 이용 안내|Conversation guide|对话使用指南|Hướng dẫn trò chuyện|会話の利用案内
상황을 알려주시면 필요한 지원과 신청 준비를 함께 확인해요.|Tell us about your situation to find support and prepare your application together.|告诉我们您的情况，我们将一起查找所需支持并准备申请。|Hãy chia sẻ hoàn cảnh để cùng tìm hỗ trợ và chuẩn bị đăng ký.|状況を教えていただければ、必要な支援と申請準備を一緒に確認します。
추천 공고로 돌아가기|Back to recommendations|返回推荐公告|Quay lại thông báo được đề xuất|おすすめの公示に戻る
AI 비서에게 물어보기|Ask the AI assistant|向AI助手提问|Hỏi trợ lý AI|AIアシスタントに質問する
지원 공고를 찾고, 신청 준비까지 함께 이야기해요.|Let's find support notices and talk through how to apply.|一起查找支持公告，并讨论申请准备。|Cùng tìm thông báo hỗ trợ và trao đổi về cách chuẩn bị đăng ký.|支援の公示を探し、申請準備まで一緒に話しましょう。
이렇게 물어보세요|Try asking|您可以这样提问|Bạn có thể hỏi như sau|こんな質問ができます
일자리 지원을 찾고 있어요|I am looking for employment support|我正在寻找就业支持|Tôi đang tìm hỗ trợ việc làm|就労支援を探しています
집수리 지원을 알아보고 싶어요|I would like to find home repair support|我想了解房屋维修支持|Tôi muốn tìm hiểu hỗ trợ sửa nhà|住宅修理の支援を調べたいです
신청 방법과 필요한 서류가 궁금해요|How do I apply and which documents do I need?|如何申请，需要哪些材料？|Đăng ký như thế nào và cần giấy tờ gì?|申請方法と必要な書類を知りたいです
이전 대화|Previous messages|之前的对话|Tin nhắn trước|これまでの会話
Enter로 보내고, Shift+Enter로 줄을 바꿀 수 있어요.|Press Enter to send and Shift+Enter for a new line.|按Enter发送，按Shift+Enter换行。|Nhấn Enter để gửi, Shift+Enter để xuống dòng.|Enterで送信、Shift+Enterで改行できます。
새로고침하거나 로그아웃하면 화면의 대화는 초기화돼요. 대화는 마지막 입력 후 30분 동안 임시로 이어지고, 저장을 선택한 생활정보만 계정에 남아요.|Refreshing or signing out clears the conversation on screen. The conversation can continue for 30 minutes after your last input. Only personal circumstances you choose to save remain in your account.|刷新或退出登录会清除屏幕上的对话。最后一次输入后，对话可临时延续30分钟。只有您选择保存的生活信息会保留在账户中。|Tải lại trang hoặc đăng xuất sẽ xóa cuộc trò chuyện trên màn hình. Cuộc trò chuyện được duy trì tạm thời trong 30 phút sau lần nhập cuối. Chỉ thông tin hoàn cảnh bạn chọn lưu mới được giữ trong tài khoản.|再読み込みやログアウトで画面の会話は消去されます。会話は最後の入力から30分間、一時的に継続でき、保存を選んだ生活情報だけがアカウントに残ります。
신청 방법과 서류 확인|Check application instructions and documents|查看申请方法与材料|Xem cách đăng ký và giấy tờ|申請方法と書類を確認する
접수가 마감된 공고예요. 최신 접수 여부는 담당 기관에 확인해 주세요.|Applications have closed. Ask the responsible office about current availability.|此公告的申请已截止。请向负责机构确认最新受理情况。|Thông báo đã hết hạn nhận hồ sơ. Hãy hỏi cơ quan phụ trách về tình trạng hiện tại.|受付が終了した公示です。最新の受付状況は担当機関へ確認してください。
이 공고 신청하기|Apply for this notice|申请此公告|Đăng ký thông báo này|この公示に申請する
신청 방법과 서류 준비|How to apply and prepare documents|申请方法与材料准备|Cách đăng ký và chuẩn bị hồ sơ|申請方法と書類の準備
현재 접수 상태를 먼저 확인해 주세요.|Check whether applications are currently open.|请先确认目前是否接受申请。|Hãy kiểm tra tình trạng tiếp nhận hồ sơ hiện tại.|現在の受付状況を先に確認してください。
신청 방법은 공식 공고에서 확인해 주세요.|Check the official notice for application instructions.|请查看官方公告中的申请方法。|Xem cách đăng ký trong thông báo chính thức.|申請方法は公式の公示で確認してください。
온라인으로 신청하기|Apply online|在线申请|Đăng ký trực tuyến|オンラインで申請する
온라인 신청 주소를 확인하지 못했어요. 공식 공고의 신청 방법을 확인해 주세요.|The online application address has not been confirmed. Check the official application instructions.|尚未确认在线申请地址。请查看官方公告中的申请方法。|Chưa xác nhận được địa chỉ đăng ký trực tuyến. Hãy xem hướng dẫn đăng ký chính thức.|オンライン申請先を確認できませんでした。公式の公示で申請方法を確認してください。
전화로 신청하기|Apply by phone|电话申请|Đăng ký qua điện thoại|電話で申請する
신청 방법 전화 문의|Call about how to apply|电话咨询申请方法|Gọi để hỏi cách đăng ký|申請方法を電話で問い合わせる
방문 신청 안내|Applying in person|现场申请指南|Hướng dẫn đăng ký trực tiếp|窓口での申請案内
공식 공고에서 신청 방법 확인|Check the official application instructions|查看官方申请指南|Xem hướng dẫn đăng ký chính thức|公式の公示で申請方法を確認する
필요한 서류|Documents to prepare|所需材料|Giấy tờ cần chuẩn bị|必要な書類
준비한 서류 {count}/{total}|Documents prepared {count}/{total}|已准备材料 {count}/{total}|Giấy tờ đã chuẩn bị {count}/{total}|準備済み書類 {count}/{total}
준비한 서류를 직접 확인해 주세요. 파일을 제출하거나 신청한 것으로 처리하지 않아요.|Confirm which documents you have prepared. This does not submit files or an application.|请自行确认已准备的材料。勾选不会提交文件或申请。|Hãy xác nhận giấy tờ bạn đã chuẩn bị. Thao tác này không gửi tệp hay nộp đơn.|準備した書類を自分で確認してください。ファイルの提出や申請は行われません。
서류 준비를 확인했어요. 신청 완료를 뜻하지 않아요.|Your document preparation is checked. The application has not been submitted.|已确认材料准备情况。这并不代表申请已提交。|Đã xác nhận việc chuẩn bị hồ sơ. Điều này không có nghĩa là đã nộp đơn.|書類の準備を確認しました。申請完了を意味するものではありません。
공고에 제출 서류가 없다고 안내되어 있어요.|The notice states that no documents are required.|公告说明无需提交材料。|Thông báo ghi rằng không cần nộp giấy tờ.|公示には提出書類が不要と記載されています。
필요한 서류가 원문에 명확히 안내되지 않았어요. 신청 전에 담당 기관에 확인해 주세요.|The original notice does not clearly list required documents. Ask the responsible office before applying.|原文未明确列出所需材料。请在申请前向负责机构确认。|Thông báo gốc chưa nêu rõ giấy tờ cần thiết. Hãy hỏi cơ quan phụ trách trước khi đăng ký.|原文に必要な書類が明記されていません。申請前に担当機関へ確認してください。
공고가 변경되어 서류 준비 항목을 다시 확인해야 해요.|The notice has changed. Review the document checklist again.|公告已更新，请重新确认材料准备清单。|Thông báo đã thay đổi. Hãy kiểm tra lại danh sách giấy tờ.|公示が変更されたため、書類の準備項目を再確認してください。
공고가 변경되어 서류 준비 항목을 다시 확인해야 해요. 공고 다시 확인을 눌러 주세요.|The notice has changed. Select Check notices again to update your checklist.|公告已更新。请点击重新查看公告以更新材料清单。|Thông báo đã thay đổi. Chọn kiểm tra lại thông báo để cập nhật danh sách hồ sơ.|公示が変更されました。公示を再確認して書類の準備項目を更新してください。
서류 준비 상태를 저장하지 못했어요. 다시 시도해 주세요.|Could not save document preparation. Please try again.|无法保存材料准备状态，请重试。|Không lưu được tình trạng chuẩn bị hồ sơ. Vui lòng thử lại.|書類の準備状況を保存できませんでした。もう一度お試しください。
서류 준비 상태를 저장했어요.|Document preparation saved.|已保存材料准备状态。|Đã lưu tình trạng chuẩn bị hồ sơ.|書類の準備状況を保存しました。
준비할 서류 정보를 다시 확인해 주세요.|Check the document information again.|请重新确认所需材料信息。|Vui lòng kiểm tra lại thông tin giấy tờ cần chuẩn bị.|準備する書類の情報をもう一度確認してください。
신청 안내 정보의 형식을 확인하지 못했어요.|Could not read the application guidance.|无法读取申请指南。|Không đọc được hướng dẫn đăng ký.|申請案内を読み取れませんでした。
추천에서 제외한 공고 외에 현재 안내할 지원 후보가 없어요.|Aside from the notices you excluded, there are no support recommendations right now.|除您排除的公告外，目前没有可推荐的援助公告。|Ngoài những thông báo bạn đã loại, hiện không có đề xuất hỗ trợ nào.|除外した公示以外に、現在案内できる支援候補はありません。
이 공고 추천하지 않기|Do not recommend this notice|不再推荐此公告|Không đề xuất thông báo này|この公示をおすすめしない
이 공고를 추천하지 않는 이유|Why should we stop recommending this notice?|为什么不再推荐此公告？|Vì sao bạn không muốn nhận đề xuất này?|この公示をおすすめしない理由
지원 대상이 아니에요|I am not eligible|我不符合申请条件|Tôi không thuộc đối tượng hỗ trợ|支援対象ではありません
관심 없는 공고예요|I am not interested|我不感兴趣|Tôi không quan tâm|興味がありません
이 공고를 제외하고, 비슷한 공고의 추천 순위를 낮춰요.|We will exclude this notice and rank similar notices lower.|我们将排除此公告并降低类似公告的推荐顺序。|Chúng tôi sẽ loại thông báo này và giảm thứ hạng của các thông báo tương tự.|この公示を除外し、似た公示のおすすめ順位を下げます。
이 공고를 다시 추천하지 않아요. 제외한 공고는 언제든 다시 추천받을 수 있어요.|We will stop recommending this notice. You can restore it at any time.|我们将不再推荐此公告。您可以随时恢复推荐。|Chúng tôi sẽ không đề xuất thông báo này nữa. Bạn có thể khôi phục bất cứ lúc nào.|この公示をおすすめから除外します。いつでも元に戻せます。
추천에서 제외|Exclude from recommendations|从推荐中排除|Loại khỏi đề xuất|おすすめから除外
추천에서 제외한 공고|Excluded notices|已排除的公告|Thông báo đã loại khỏi đề xuất|おすすめから除外した公示
다시 추천받기|Restore recommendations|恢复推荐|Khôi phục đề xuất|おすすめに戻す
추천에서 제외했어요. 선택한 이유를 다음 추천에 반영할게요.|Notice excluded. Your reason will inform future recommendations.|已从推荐中排除。您的理由将用于调整后续推荐。|Đã loại khỏi đề xuất. Lý do bạn chọn sẽ được áp dụng cho các đề xuất tiếp theo.|おすすめから除外しました。選んだ理由を今後のおすすめに反映します。
이 공고를 다시 추천받도록 변경했어요.|Recommendations for this notice restored.|已恢复此公告的推荐。|Đã khôi phục đề xuất cho thông báo này.|この公示のおすすめを再開しました。
아직 저장된 신청 기록이 없어요.|No saved application records yet.|尚无保存的申请记录。|Chưa có hồ sơ đăng ký đã lưu.|保存された申請記録はまだありません。
공고 질문과 챗봇은 로그인 없이 이용할 수 있어요. AI 복지비서는 로그인이 필요해요.|You can use policy questions and the chatbot without signing in. The AI welfare assistant requires sign-in.|公告提问和聊天机器人无需登录即可使用。AI福利助手需要登录。|Bạn có thể hỏi về thông báo và dùng chatbot mà không cần đăng nhập. Trợ lý phúc lợi AI yêu cầu đăng nhập.|公示への質問とチャットボットはログインせずに利用できます。AI福祉アシスタントにはログインが必要です。
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
보내기|Send|发送|Gửi|送信
AI 복지비서 열기|Open AI welfare assistant|打开AI福利助手|Mở trợ lý phúc lợi AI|AI福祉アシスタントを開く
나에게 발견된 지원, 필요한 정보와 신청 현황|Your support options, required details, and application progress|适合您的支持、所需信息与申请进度|Hỗ trợ phù hợp, thông tin cần thiết và tiến độ đăng ký|見つかった支援、必要な情報と申請状況
AI 복지비서 안내|AI welfare assistant guide|AI福利助手指南|Hướng dẫn trợ lý phúc lợi AI|AI福祉アシスタントの案内
내 상황에 맞는 지원을 계속 살펴보세요|Keep exploring support that fits your circumstances|持续查看适合您情况的支持|Tiếp tục tìm hỗ trợ phù hợp với hoàn cảnh|今の状況に合った支援を継続して確認しましょう
AI 복지비서에서 새 안내와 신청 준비 상황을 한곳에서 확인하세요.|See new guidance and your application preparations together in the AI welfare assistant.|在AI福利助手中集中查看新指南和申请准备情况。|Xem hướng dẫn mới và tiến độ chuẩn bị đăng ký tại trợ lý phúc lợi AI.|AI福祉アシスタントで、新しい案内と申請準備の状況をまとめて確認できます。
세부 신청 조건은 공식 공고의 지원 대상·신청 제외 대상 안내를 확인해 주세요.|Check the official notice for detailed eligibility and exclusions.|请查看官方公告中的支持对象及申请排除对象，确认详细条件。|Hãy xem thông báo chính thức để kiểm tra điều kiện và đối tượng không được đăng ký.|詳しい申請条件は、公式公示の対象者・申請対象外の案内を確認してください。
신청 제외 대상|Excluded applicants|申请排除对象|Đối tượng không được đăng ký|申請対象外
우대사항|Preferences|优先条件|Điều kiện ưu tiên|優遇事項
참고사항|Notes|参考事项|Thông tin tham khảo|参考事項
접수 기간|Application period|申请期间|Thời gian đăng ký|受付期間
광운대|Kwangwoon University|光云大学|Đại học Kwangwoon|光云大学
생활서비스 응답을 확인하지 못했어요.|Unable to read the local services response.|无法读取生活服务响应。|Không đọc được phản hồi dịch vụ địa phương.|地域サービスの応答を確認できませんでした。
생활지역을 확인해 주세요.|Please check your local area.|请确认您的生活地区。|Vui lòng kiểm tra khu vực sinh sống.|生活地域を確認してください。
추천에서 제외할 이유를 선택해 주세요.|Select a reason to exclude this recommendation.|请选择排除此推荐的原因。|Chọn lý do loại khỏi đề xuất.|おすすめから除外する理由を選んでください。
검색 범위를 불러오지 못했어요.|Unable to load search options.|无法加载搜索范围。|Không tải được phạm vi tìm kiếm.|検索範囲を読み込めませんでした。
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
