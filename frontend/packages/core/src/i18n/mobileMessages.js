// Mobile UI translations; API values and server/user content are preserved.
const rows = `
언어 선택|Choose language|选择语言|Chọn ngôn ngữ|言語を選択
공고 원문·AI 답변·서버 제공 내용은 한국어로 표시됩니다. 신청 전 공식 공고를 확인해 주세요.|Policy originals, AI answers and server content are shown in Korean. Check the official notice before applying.|政策原文、AI回答及服务器内容以韩语显示。申请前请查看官方公告。|Văn bản chính sách, câu trả lời AI và nội dung máy chủ được hiển thị bằng tiếng Hàn. Hãy kiểm tra thông báo chính thức trước khi đăng ký.|公示の原文・AIの回答・サーバーの内容は韓国語で表示されます。申請前に公式公示をご確認ください。
{name}님|Hello, {name}|您好，{name}|Xin chào, {name}|{name}さん
복지나침반|Welfare Compass|福利指南针|La bàn phúc lợi|福祉コンパス
홈|Home|首页|Trang chủ|ホーム
홈으로|Go to home|返回首页|Về trang chủ|ホームへ
공고|Notices|公告|Thông báo|公示
복지 공고|Welfare notices|福利公告|Thông báo phúc lợi|福祉の公示
계산기|Calculator|计算器|Máy tính|計算機
상담|Help|咨询|Tư vấn|相談
내 계정|My account|我的账户|Tài khoản|マイアカウント
나의 복지나침반|My Welfare Compass|我的福利指南针|La bàn phúc lợi của tôi|私の福祉コンパス
쉬운 화면|Easy view|简易界面|Giao diện đơn giản|やさしい画面
쉬운 화면으로 보기|Use easy view|使用简易界面|Dùng giao diện đơn giản|やさしい画面に切り替え
일반 화면으로 보기|Use standard view|使用普通界面|Dùng giao diện thông thường|通常の画面に切り替え
메뉴|Menu|菜单|Menu|メニュー
전체 메뉴|All menus|全部菜单|Tất cả menu|全メニュー
전체 메뉴 열기|Open menu|打开菜单|Mở menu|メニューを開く
전체 메뉴 닫기|Close menu|关闭菜单|Đóng menu|メニューを閉じる
메뉴 바깥을 눌러 닫기|Close by tapping outside|点击菜单外关闭|Chạm bên ngoài để đóng|メニューの外を押して閉じる
확인|Confirm|确认|Xác nhận|確認
취소|Cancel|取消|Hủy|キャンセル
수정|Edit|修改|Chỉnh sửa|編集
다음|Next|下一步|Tiếp theo|次へ
이전|Previous|上一步|Trước|前へ
다시 시도하기|Try again|重试|Thử lại|再試行
다시 확인|Check again|重新检查|Kiểm tra lại|再確認
자세히 보기|View details|查看详情|Xem chi tiết|詳しく見る
전체 보기|View all|查看全部|Xem tất cả|すべて見る
전체 보기 +|View all +|查看全部 +|Xem tất cả +|すべて見る +
접기|Collapse|收起|Thu gọn|閉じる
접기 −|Collapse −|收起 −|Thu gọn −|閉じる −
보기 +|View +|查看 +|Xem +|見る +
검색|Search|搜索|Tìm kiếm|検索
검색 범위|Search scope|搜索范围|Phạm vi tìm kiếm|検索範囲
검색 조건 지우기|Clear filters|清除筛选|Xóa bộ lọc|条件をリセット
분야|Category|类别|Lĩnh vực|分野
공고 분야|Notice categories|公告类别|Lĩnh vực thông báo|公示の分野
지역|Region|地区|Khu vực|地域
정렬|Sort|排序|Sắp xếp|並び替え
자동으로 찾기|Search automatically|自动搜索|Tự động tìm|自動で検索
자동 (검색할 때 관련도순)|Automatic (relevance for searches)|自动（搜索时按相关度）|Tự động (theo độ liên quan khi tìm)|自動（検索時は関連度順）
관련도순|Most relevant|相关度优先|Liên quan nhất|関連度順
인기순 (조회수)|Most viewed|浏览量优先|Nhiều lượt xem nhất|閲覧数順
최근 등록순|Newest|最新发布|Mới nhất|新着順
이름순|Name|名称顺序|Theo tên|名前順
전체|All|全部|Tất cả|すべて
전국|Nationwide|全国|Toàn quốc|全国
생활 지원|Living support|生活援助|Hỗ trợ sinh hoạt|生活支援
생활·금융|Living & finance|生活与金融|Sinh hoạt và tài chính|生活・金融
주거|Housing|住房|Nhà ở|住まい
일자리|Employment|就业|Việc làm|仕事
교육|Education|教育|Giáo dục|教育
건강·돌봄|Health & care|健康与照护|Sức khỏe và chăm sóc|健康・介護
문화|Culture|文化|Văn hóa|文化
농림축산·어업|Agriculture & fisheries|农林畜牧与渔业|Nông lâm nghiệp và thủy sản|農林畜産・漁業
사업·창업|Business & startups|经营与创业|Kinh doanh và khởi nghiệp|事業・起業
기타|Other|其他|Khác|その他
서울|Seoul|首尔|Seoul|ソウル
경기|Gyeonggi|京畿|Gyeonggi|京畿
인천|Incheon|仁川|Incheon|仁川
부산|Busan|釜山|Busan|釜山
대구|Daegu|大邱|Daegu|大邱
광주|Gwangju|光州|Gwangju|光州
대전|Daejeon|大田|Daejeon|大田
울산|Ulsan|蔚山|Ulsan|蔚山
세종|Sejong|世宗|Sejong|世宗
강원|Gangwon|江原|Gangwon|江原
충북|North Chungcheong|忠清北道|Chungcheong Bắc|忠清北道
충남|South Chungcheong|忠清南道|Chungcheong Nam|忠清南道
전북|North Jeolla|全罗北道|Jeolla Bắc|全羅北道
전남|South Jeolla|全罗南道|Jeolla Nam|全羅南道
경북|North Gyeongsang|庆尚北道|Gyeongsang Bắc|慶尚北道
경남|South Gyeongsang|庆尚南道|Gyeongsang Nam|慶尚南道
제주|Jeju|济州|Jeju|済州
생활에 보탬이 되는 정보|Information to help everyday life|让生活更轻松的信息|Thông tin hữu ích cho cuộc sống|暮らしに役立つ情報
어떤 도움이 필요하세요?|What help do you need?|您需要什么帮助？|Bạn cần hỗ trợ gì?|どんな支援が必要ですか？
나에게 필요한 지원, 여기서 찾아보세요|Find the support you need here|在这里找到您需要的援助|Tìm hỗ trợ bạn cần tại đây|必要な支援をここで探しましょう
복지 공고 찾기|Find welfare notices|查找福利公告|Tìm thông báo phúc lợi|福祉の公示を探す
궁금한 지원을 적어 주세요|Tell us what support you need|请填写您想了解的援助|Nhập loại hỗ trợ bạn muốn tìm|知りたい支援を入力してください
예: 청년 주거 지원|e.g. housing support for young adults|例如：青年住房援助|Ví dụ: hỗ trợ nhà ở cho thanh niên|例：若者向け住宅支援
지원 찾아보기|Find support|查找援助|Tìm hỗ trợ|支援を探す
중위소득 빠르게 확인하기|Quick median-income check|快速查看中位收入|Kiểm tra nhanh thu nhập trung vị|基準中位所得をすぐ確認
2026년 기준 중위소득|2026 standard median income|2026年基准中位收入|Thu nhập trung vị chuẩn năm 2026|2026年の基準中位所得
우리 집 기준은 얼마일까요?|What is my household's threshold?|我家适用的标准是多少？|Mức chuẩn của gia đình tôi là bao nhiêu?|わが家の基準額はいくら？
가구원 수로 바로 확인|Check by household size|按家庭人数立即查看|Kiểm tra theo số thành viên|世帯人数ですぐ確認
많이 찾는 공고|Popular notices|热门公告|Thông báo phổ biến|よく見られる公示
지원 내용을 비교해 보세요|Compare available support|比较援助内容|So sánh các hỗ trợ|支援内容を比べましょう
공고 다시 불러오기|Reload notices|重新加载公告|Tải lại thông báo|公示を再読み込み
공고를 불러오고 있어요.|Loading notices.|正在加载公告。|Đang tải thông báo.|公示を読み込んでいます。
현재 공개된 공고가 없어요. 다른 분야를 살펴보세요.|No public notices yet. Explore another category.|暂无公开公告。请查看其他类别。|Chưa có thông báo công khai. Hãy xem lĩnh vực khác.|公開中の公示はありません。他の分野をご覧ください。
신청 전에는 공식 공고에서 조건과 기간을 확인해 주세요.|Check eligibility and dates in the official notice before applying.|申请前请在官方公告中确认条件和期限。|Kiểm tra điều kiện và thời hạn trong thông báo chính thức trước khi đăng ký.|申請前に公式公示で条件と期間を確認してください。
일상에 힘이 되는 복지를 찾아요|Find welfare support for everyday life|寻找助力日常生活的福利|Tìm phúc lợi hỗ trợ cuộc sống|日々の暮らしを支える福祉を探す
나에게 필요한 복지 찾기|Find the welfare support you need|寻找适合您的福利|Tìm phúc lợi bạn cần|必要な福祉を探す
생활을 더 든든하게|More support for daily life|让生活更安心|Giúp cuộc sống vững vàng hơn|暮らしをもっと安心に
복지 지원 알아보기|Explore welfare support|了解福利援助|Tìm hiểu hỗ trợ phúc lợi|福祉支援を調べる
우리 집 소득, 어느 정도일까요?|How does my household income compare?|我家的收入处于什么水平？|Thu nhập gia đình tôi ở mức nào?|わが家の所得はどのくらい？
우리 집 중위소득 계산|Calculate household median income|计算家庭中位收入|Tính thu nhập trung vị gia đình|わが家の中位所得を計算
궁금한 소득 기준|Understand income thresholds|了解收入标准|Tìm hiểu mức chuẩn thu nhập|所得の基準を知る
소득 비율 확인하기|Check income ratio|查看收入比例|Kiểm tra tỷ lệ thu nhập|所得の割合を確認
저장한 내 정보, 다시 입력하지 않게|Reuse your saved information|重复使用已保存的信息|Dùng lại thông tin đã lưu|保存した情報を再入力せずに
저장한 정보를 다시 불러와요|Load your saved information|加载您保存的信息|Tải lại thông tin đã lưu|保存した情報を読み込む
다음에도 편리하게|Convenient next time too|下次也方便使用|Tiện lợi cho lần sau|次回も便利に
내 계정 살펴보기|View my account|查看我的账户|Xem tài khoản|マイアカウントを見る
이전 배너|Previous banner|上一个横幅|Biểu ngữ trước|前のバナー
다음 배너|Next banner|下一个横幅|Biểu ngữ tiếp theo|次のバナー
게시 기관|Publishing organization|发布机构|Cơ quan đăng tải|掲載機関
공고 내용|Notice content|公告内容|Nội dung thông báo|公示の内容
게시 기관은 공고를 올린 기관, 공고 내용은 제목과 본문에서 찾아요.|Organization searches the publisher; content searches titles and text.|发布机构搜索公告发布方，公告内容搜索标题和正文。|Cơ quan đăng tải tìm theo đơn vị công bố; nội dung tìm trong tiêu đề và văn bản.|掲載機関は公示の発信元、内容はタイトルと本文から検索します。
어떤 지원을 찾으세요?|What support are you looking for?|您在寻找什么援助？|Bạn đang tìm hỗ trợ gì?|どんな支援をお探しですか？
지원 내용부터 신청 조건까지 한눈에 확인해요.|See support and eligibility at a glance.|一览援助内容和申请条件。|Xem nhanh nội dung hỗ trợ và điều kiện đăng ký.|支援内容から申請条件までひと目で確認できます。
공고 검색|Search notices|搜索公告|Tìm thông báo|公示を検索
예: 광운대 학생 장학금 찾아줘|e.g. scholarships for Kwangwoon University students|例如：查找光云大学学生奖学金|Ví dụ: tìm học bổng cho sinh viên Đại học Kwangwoon|例：光云大学の学生向け奨学金
상세 조건 접기|Hide detailed filters|收起详细筛选|Ẩn bộ lọc chi tiết|詳細条件を閉じる
지역·검색 범위·정렬|Region, scope & sort|地区、搜索范围和排序|Khu vực, phạm vi và sắp xếp|地域・検索範囲・並び替え
공고를 가져오고 있어요.|Loading notices.|正在获取公告。|Đang tải thông báo.|公示を取得しています。
원래 검색어로 찾기|Use original search terms|使用原搜索词|Dùng từ khóa ban đầu|元の検索語で探す
찾은 공고|Matching notices|找到的公告|Thông báo tìm được|見つかった公示
조건에 맞는 공고가 없어요.|No notices match these filters.|没有符合条件的公告。|Không có thông báo phù hợp.|条件に合う公示がありません。
다른 조건으로 찾아보세요.|Try different filters.|请尝试其他条件。|Hãy thử điều kiện khác.|別の条件で探してください。
검색 조건을 지워 보세요. 공개된 공고가 등록되면 여기에 표시됩니다.|Try clearing the filters. New public notices will appear here.|请清除筛选条件。新公开的公告会显示在这里。|Hãy xóa bộ lọc. Thông báo công khai mới sẽ xuất hiện ở đây.|条件をリセットしてください。公開公示が登録されるとここに表示されます。
이전 페이지|Previous page|上一页|Trang trước|前のページ
다음 페이지|Next page|下一页|Trang tiếp theo|次のページ
지원 내용|Support details|援助内容|Nội dung hỗ trợ|支援内容
대상|Eligibility|对象|Đối tượng|対象
기간|Period|期限|Thời hạn|期間
이 공고를 찾은 이유|Why this notice matched|找到此公告的原因|Vì sao tìm thấy thông báo này|この公示が見つかった理由
공고 목록으로|Back to notices|返回公告列表|Về danh sách thông báo|公示一覧へ
공고 내용을 가져오고 있어요.|Loading notice details.|正在加载公告详情。|Đang tải chi tiết thông báo.|公示の内容を取得しています。
공고 제목|Notice title|公告标题|Tiêu đề thông báo|公示のタイトル
이런 지원을 받을 수 있어요|Available support|可获得的援助|Hỗ trợ có thể nhận|受けられる支援
신청 기간|Application period|申请期限|Thời gian đăng ký|申請期間
누가 받을 수 있나요?|Who can receive support?|谁可以获得援助？|Ai có thể nhận hỗ trợ?|誰が支援を受けられますか？
지원 대상|Eligible applicants|援助对象|Đối tượng được hỗ trợ|支援対象
공고 요약 전체 보기|View full notice summary|查看完整公告摘要|Xem toàn bộ tóm tắt|公示の概要をすべて見る
공식 공고에서 자세한 내용을 확인해 주세요.|See the official notice for full details.|请在官方公告中查看详细信息。|Xem chi tiết trong thông báo chính thức.|詳しくは公式公示を確認してください。
신청 전 공식 공고의 조건을 꼭 확인하세요.|Check the official eligibility requirements before applying.|申请前务必确认官方公告的条件。|Nhớ kiểm tra điều kiện chính thức trước khi đăng ký.|申請前に公式公示の条件を必ず確認してください。
신청 전 공식 공고에서 자세한 조건과 신청 방법을 확인해 주세요.|Check detailed requirements and application steps in the official notice.|申请前请在官方公告中确认详细条件和申请方法。|Kiểm tra điều kiện chi tiết và cách đăng ký trong thông báo chính thức.|申請前に公式公示で詳しい条件と申請方法を確認してください。
공식 공고 보기|View official notice|查看官方公告|Xem thông báo chính thức|公式公示を見る
등록된 공식 공고 링크가 없습니다.|No official notice link is available.|暂无官方公告链接。|Chưa có liên kết thông báo chính thức.|公式公示のリンクは登録されていません。
이 공고에 대해 질문하기|Ask about this notice|咨询此公告|Hỏi về thông báo này|この公示について質問する
공식 공고에서 확인|Check the official notice|请查看官方公告|Xem thông báo chính thức|公式公示で確認
기관 확인 필요|Organization needs checking|需确认机构|Cần kiểm tra cơ quan|機関の確認が必要
지역 확인 필요|Region needs checking|需确认地区|Cần kiểm tra khu vực|地域の確認が必要
지원 대상 확인 필요|Eligibility needs checking|需确认援助对象|Cần kiểm tra đối tượng|支援対象の確認が必要
공고 주소를 확인해 주세요.|Check the notice address.|请检查公告地址。|Kiểm tra địa chỉ thông báo.|公示のアドレスを確認してください。
공개된 공고를 찾을 수 없어요. 목록에서 다시 선택해 주세요.|Public notice not found. Choose again from the list.|未找到公开公告。请从列表重新选择。|Không tìm thấy thông báo công khai. Hãy chọn lại từ danh sách.|公開公示が見つかりません。一覧から選び直してください。
공식 공고를 열지 못했어요. 잠시 후 다시 시도해 주세요.|Could not open the official notice. Try again shortly.|无法打开官方公告。请稍后重试。|Không mở được thông báo chính thức. Hãy thử lại sau.|公式公示を開けませんでした。しばらくしてから再試行してください。
무엇이 궁금하세요?|What would you like to know?|您想了解什么？|Bạn muốn biết điều gì?|何を知りたいですか？
공고를 고르고 궁금한 내용을 확인하세요.|Choose a notice and ask what you need to know.|选择公告并了解您关心的内容。|Chọn thông báo và xem nội dung bạn quan tâm.|公示を選び、気になる内容を確認しましょう。
챗봇 상담 열기|Open chatbot help|打开聊天机器人咨询|Mở tư vấn chatbot|チャット相談を開く
복지나침반 챗봇|Welfare Compass chatbot|福利指南针聊天机器人|Chatbot La bàn phúc lợi|福祉コンパスのチャットボット
공고 원문에 따른 안내|Guidance based on the original notice|依据公告原文提供指引|Hướng dẫn dựa trên thông báo gốc|公示の原文に基づく案内
상담창 접기|Minimize chat|收起咨询窗口|Thu gọn cửa sổ tư vấn|相談画面を閉じる
챗봇 기능 끄기|Turn off chatbot|关闭聊天机器人|Tắt chatbot|チャットボットを無効にする
궁금할 땐 챗봇|Ask the chatbot|有疑问时咨询机器人|Có thắc mắc, hãy hỏi chatbot|気になることはチャットで
공고를 고르고 질문해 보세요.|Choose a notice and ask a question.|选择公告并提问。|Chọn thông báo và đặt câu hỏi.|公示を選んで質問してみましょう。
여기서 챗봇을 다시 켤 수 있어요.|You can turn the chatbot back on here.|您可以在这里重新启用聊天机器人。|Bạn có thể bật lại chatbot tại đây.|ここでチャットボットを再度有効にできます。
챗봇 상담|Chatbot help|聊天机器人咨询|Tư vấn chatbot|チャット相談
챗봇 다시 켜기|Turn chatbot back on|重新启用聊天机器人|Bật lại chatbot|チャットボットを再開
상담창을 접거나 챗봇을 끄면 질문과 답변은 지워져요.|Questions and answers are cleared when you close or disable chat.|收起咨询窗口或关闭机器人后，问题和回答将被清除。|Câu hỏi và câu trả lời sẽ bị xóa khi đóng hoặc tắt chatbot.|相談画面を閉じるか無効にすると質問と回答は消去されます。
챗봇 기능을 끄시겠습니까?|Turn off the chatbot?|要关闭聊天机器人吗？|Bạn muốn tắt chatbot?|チャットボットを無効にしますか？
챗봇을 껐어요|Chatbot is turned off|聊天机器人已关闭|Đã tắt chatbot|チャットボットを無効にしました
하단의 ‘상담’을 누르면 다시 이용할 수 있어요.|Tap Help at the bottom to use it again.|点击底部“咨询”即可再次使用。|Nhấn Tư vấn ở dưới để sử dụng lại.|下部の「相談」を押すと再び利用できます。
현재 질문과 답변은 지워져요.|Current questions and answers will be cleared.|当前问题和回答将被清除。|Câu hỏi và câu trả lời hiện tại sẽ bị xóa.|現在の質問と回答は消去されます。
계속 사용하기|Keep using|继续使用|Tiếp tục sử dụng|利用を続ける
챗봇 끄기|Turn off chatbot|关闭聊天机器人|Tắt chatbot|チャットボットを無効にする
챗봇 종료 확인|Confirm turning off chatbot|确认关闭聊天机器人|Xác nhận tắt chatbot|チャットボット終了の確認
챗봇 다시 켜기 안내|How to restart chatbot|重新启用机器人指南|Hướng dẫn bật lại chatbot|チャットボット再開の案内
어떤 공고가 궁금하세요?|Which notice are you interested in?|您想了解哪个公告？|Bạn quan tâm đến thông báo nào?|どの公示が気になりますか？
공고를 고르고 질문해 주세요.|Choose a notice and ask a question.|请选择公告并提问。|Hãy chọn thông báo và đặt câu hỏi.|公示を選んで質問してください。
준비된 질문을 고르거나 직접 물어보세요. 공고 원문을 바탕으로 안내해 드려요.|Choose a suggested question or ask your own. Guidance is based on the original notice.|选择预设问题或自行提问。我们依据公告原文提供指引。|Chọn câu hỏi gợi ý hoặc tự đặt câu hỏi. Hướng dẫn dựa trên thông báo gốc.|用意された質問を選ぶか直接質問してください。公示の原文を基に案内します。
로그인하면 웹과 같은 공고 상담을 이용할 수 있어요.|Sign in to use the same notice help as on the website.|登录后可使用与网站相同的公告咨询。|Đăng nhập để dùng tư vấn thông báo như trên website.|ログインするとウェブと同じ公示相談を利用できます。
로그인하러 가기|Go to sign in|前往登录|Đến đăng nhập|ログインへ
상담 중인 공고|Current notice|正在咨询的公告|Thông báo đang tư vấn|相談中の公示
다른 공고 선택|Choose another notice|选择其他公告|Chọn thông báo khác|別の公示を選ぶ
최신 공고를 다시 선택해 주세요. 이 공고의 질문 정보를 확인할 수 없어요.|Select the latest notice again. Questions for this notice are unavailable.|请重新选择最新公告。无法获取此公告的问题信息。|Chọn lại thông báo mới nhất. Không có thông tin câu hỏi cho thông báo này.|最新の公示を選び直してください。この公示の質問情報を確認できません。
상담할 공고 검색|Find a notice to ask about|搜索要咨询的公告|Tìm thông báo để tư vấn|相談する公示を検索
공고 이름이나 관심 단어|Notice name or keywords|公告名称或关键词|Tên thông báo hoặc từ khóa|公示名や気になるキーワード
상담할 수 있는 공개 공고가 없어요. 다른 검색어로 찾아보거나 나중에 다시 확인해 주세요.|No public notices are available for chat. Try other keywords or check later.|暂无可咨询的公开公告。请更换搜索词或稍后查看。|Không có thông báo công khai để tư vấn. Thử từ khóa khác hoặc xem lại sau.|相談できる公開公示がありません。別の検索語で探すか、後で確認してください。
이전 공고 목록|Previous notices|上一组公告|Danh sách thông báo trước|前の公示一覧
다음 공고 목록|Next notices|下一组公告|Danh sách thông báo tiếp theo|次の公示一覧
준비된 안내|Prepared guidance|预设指引|Hướng dẫn có sẵn|用意された案内
공고에 따른 안내|Notice-based guidance|基于公告的指引|Hướng dẫn theo thông báo|公示に基づく案内
원문 근거 보기|View original evidence|查看原文依据|Xem căn cứ gốc|原文の根拠を見る
원문 근거|Original evidence|原文依据|Căn cứ gốc|原文の根拠
추가로 확인할 내용|More to check|需进一步确认的内容|Nội dung cần kiểm tra thêm|追加で確認する内容
신청 자격과 현재 접수 여부는 담당 기관에서 확인해 주세요.|Confirm eligibility and whether applications are open with the responsible organization.|请向负责机构确认申请资格和当前受理状态。|Xác nhận điều kiện và tình trạng tiếp nhận với cơ quan phụ trách.|申請資格と現在の受付状況は担当機関に確認してください。
다른 질문 고르기|Choose another question|选择其他问题|Chọn câu hỏi khác|別の質問を選ぶ
자주 묻는 질문|Frequently asked questions|常见问题|Câu hỏi thường gặp|よくある質問
기본 질문을 준비하고 있어요.|Loading suggested questions.|正在准备预设问题。|Đang chuẩn bị câu hỏi gợi ý.|質問を準備しています。
기본 질문을 불러오지 못했어요. 다시 시도하거나 직접 질문해 주세요.|Could not load suggested questions. Retry or ask your own.|无法加载预设问题。请重试或自行提问。|Không tải được câu hỏi gợi ý. Hãy thử lại hoặc tự đặt câu hỏi.|質問を読み込めませんでした。再試行するか直接質問してください。
기본 질문 다시 불러오기|Reload suggested questions|重新加载预设问题|Tải lại câu hỏi gợi ý|質問を再読み込み
직접 질문하기|Ask your own question|自行提问|Tự đặt câu hỏi|直接質問する
이름·전화번호는 적지 마세요.|Do not enter names or phone numbers.|请勿填写姓名和电话号码。|Không nhập tên hoặc số điện thoại.|名前や電話番号は入力しないでください。
가입한 지역·연령대를 참고해 답변해요. 이름과 전화번호는 적지 마세요.|Your region and age group help inform answers. Do not enter names or phone numbers.|回答会参考您注册的地区和年龄段。请勿填写姓名和电话号码。|Câu trả lời tham khảo khu vực và nhóm tuổi đã đăng ký. Không nhập tên hoặc số điện thoại.|登録した地域と年齢層を参考に回答します。名前や電話番号は入力しないでください。
궁금한 내용|Your question|您想了解的内容|Nội dung muốn hỏi|知りたい内容
어떤 지원을 받을 수 있나요?|What support can I receive?|我可以获得哪些援助？|Tôi có thể nhận hỗ trợ gì?|どんな支援を受けられますか？
질문 보내기|Send question|发送问题|Gửi câu hỏi|質問を送信
원문을 확인하고 있어요. 잠시 기다려 주세요.|Checking the original notice. Please wait.|正在核对公告原文，请稍候。|Đang kiểm tra thông báo gốc. Vui lòng chờ.|原文を確認しています。しばらくお待ちください。
원문 근거를 확인한 답변을 만들지 못했어요. 준비된 질문을 선택하거나 잠시 후 다시 질문해 주세요.|Could not produce an answer backed by the original notice. Choose a suggested question or try again later.|未能生成有原文依据的回答。请选择预设问题或稍后再问。|Không tạo được câu trả lời có căn cứ gốc. Chọn câu hỏi gợi ý hoặc thử lại sau.|原文に基づく回答を作成できませんでした。用意された質問を選ぶか、後で再度質問してください。
공개된 공고를 찾을 수 없어요. 다른 공고를 선택해 주세요.|Public notice not found. Choose another notice.|未找到公开公告。请选择其他公告。|Không tìm thấy thông báo công khai. Hãy chọn thông báo khác.|公開公示が見つかりません。別の公示を選んでください。
답변이 늦어지고 있어요. 잠시 후 다시 질문해 주세요.|The answer is delayed. Try asking again shortly.|回答延迟，请稍后再次提问。|Câu trả lời đang chậm. Hãy hỏi lại sau.|回答が遅れています。しばらくしてから再度質問してください。
최신 공고를 다시 선택해 주세요.|Select the latest notice again.|请重新选择最新公告。|Chọn lại thông báo mới nhất.|最新の公示を選び直してください。
로그인한 뒤 질문해 주세요.|Sign in before asking.|请登录后提问。|Đăng nhập trước khi đặt câu hỏi.|ログインしてから質問してください。
질문을 1~2,000자로 입력해 주세요.|Enter a question of 1–2,000 characters.|请输入1至2,000字的问题。|Nhập câu hỏi từ 1 đến 2.000 ký tự.|質問を1～2,000文字で入力してください。
기본 질문을 불러오지 못했어요. 다시 시도해 주세요.|Could not load suggested questions. Try again.|无法加载预设问题。请重试。|Không tải được câu hỏi gợi ý. Hãy thử lại.|質問を読み込めませんでした。再試行してください。
답변의 근거를 확인하지 못했어요. 다시 질문해 주세요.|Could not verify the answer's evidence. Ask again.|无法确认回答的依据，请再次提问。|Không xác minh được căn cứ câu trả lời. Hãy hỏi lại.|回答の根拠を確認できませんでした。再度質問してください。
저장한 정보와 알림을 관리해요.|Manage saved information and notifications.|管理保存的信息和通知。|Quản lý thông tin đã lưu và thông báo.|保存した情報と通知を管理します。
웹과 같은 계정으로 연결됐어요.|Connected with the same account as the website.|已连接与网站相同的账户。|Đã kết nối bằng tài khoản trên website.|ウェブと同じアカウントで接続しています。
금융정보 불러오러 가기|Load financial information|加载财务信息|Tải thông tin tài chính|金融情報の読み込みへ
로그아웃|Sign out|退出登录|Đăng xuất|ログアウト
로그인|Sign in|登录|Đăng nhập|ログイン
아이디|Username|用户名|Tên đăng nhập|ユーザー名
비밀번호|Password|密码|Mật khẩu|パスワード
로그인 상태를 다시 확인해 주세요.|Check your sign-in status again.|请重新检查登录状态。|Kiểm tra lại trạng thái đăng nhập.|ログイン状態を再確認してください。
로그인 상태를 확인하고 있어요.|Checking sign-in status.|正在检查登录状态。|Đang kiểm tra trạng thái đăng nhập.|ログイン状態を確認しています。
웹에서 쓰던 계정으로 로그인해요.|Sign in with your website account.|使用网站账户登录。|Đăng nhập bằng tài khoản website.|ウェブで使用しているアカウントでログインします。
기존 복지나침반 계정으로 로그인해 주세요.|Sign in with your existing Welfare Compass account.|请使用已有的福利指南针账户登录。|Đăng nhập bằng tài khoản La bàn phúc lợi hiện có.|既存の福祉コンパスのアカウントでログインしてください。
회원가입 안내|Registration information|注册说明|Hướng dẫn đăng ký|新規登録の案内
모바일 회원가입은 다음 단계에서 제공됩니다. 먼저 웹에서 만든 계정을 이용해 주세요.|Mobile registration will be available later. Use an account created on the website for now.|手机端注册将在后续提供。请先使用在网站创建的账户。|Đăng ký trên di động sẽ có sau. Hiện hãy dùng tài khoản tạo trên website.|モバイルでの新規登録は今後提供予定です。まずウェブで作成したアカウントをご利用ください。
저장 정보 안내|About saved information|保存信息说明|Về thông tin đã lưu|保存情報の案内
로그인하면 계산기에서 저장한 금융정보를 자동으로 불러와요. 작성 중인 입력은 유지하고, 수정한 정보는 동의 후 저장 버튼을 눌러야 반영됩니다.|Signing in automatically loads saved financial information. Draft edits are kept; changes are saved only after consent and tapping Save.|登录后计算器会自动加载已保存的财务信息。正在填写的内容会保留；修改需同意后点击保存才会生效。|Đăng nhập sẽ tự tải thông tin tài chính đã lưu. Nội dung đang nhập được giữ; thay đổi chỉ được lưu sau khi đồng ý và nhấn Lưu.|ログインすると保存済みの金融情報を自動で読み込みます。入力中の内容は保持され、変更は同意後に保存を押すと反映されます。
푸시 알림 설정|Push notifications|推送通知设置|Cài đặt thông báo đẩy|プッシュ通知の設定
받고 싶은 소식만 골라 주세요. 설정은 계정에 저장돼요.|Choose the news you want. Settings are saved to your account.|选择您想收到的消息，设置会保存到账户。|Chọn tin bạn muốn nhận. Cài đặt được lưu vào tài khoản.|受け取りたい情報を選んでください。設定はアカウントに保存されます。
이 화면에서는 계정 설정을 바꿀 수 있어요. 푸시 알림은 안드로이드·iOS 앱에서 받을 수 있어요.|You can change account settings here. Push notifications are delivered in the Android and iOS apps.|您可在此更改账户设置。推送通知可在Android和iOS应用中接收。|Bạn có thể đổi cài đặt tài khoản tại đây. Thông báo đẩy được nhận trên ứng dụng Android và iOS.|ここではアカウントの設定を変更できます。プッシュ通知はAndroid・iOSアプリで受信できます。
기기 알림 허용하기|Allow device notifications|允许设备通知|Cho phép thông báo trên thiết bị|端末の通知を許可
기기 알림 설정 열기|Open device notification settings|打开设备通知设置|Mở cài đặt thông báo thiết bị|端末の通知設定を開く
기기별 알림·소리 설정|Device notifications and sound|设备通知与声音设置|Cài đặt thông báo và âm thanh|端末の通知・音の設定
허용됨|Allowed|已允许|Đã cho phép|許可済み
허용 안 됨|Not allowed|未允许|Chưa cho phép|未許可
로그인하면 전체 수신과 알림 종류를 선택할 수 있어요.|Sign in to choose notification types and enable delivery.|登录后可启用通知并选择通知类型。|Đăng nhập để bật nhận thông báo và chọn loại tin.|ログインすると通知の受信と種類を選択できます。
알림 설정을 확인하고 있어요.|Loading notification settings.|正在加载通知设置。|Đang tải cài đặt thông báo.|通知設定を確認しています。
전체 푸시 알림|All push notifications|全部推送通知|Tất cả thông báo đẩy|すべてのプッシュ通知
끄면 모든 종류의 푸시 알림을 받지 않아요.|Turning this off stops all push notifications.|关闭后将不接收任何推送通知。|Tắt sẽ ngừng nhận mọi thông báo đẩy.|オフにするとすべてのプッシュ通知を受信しません。
개별 선택은 유지돼요. 전체 수신을 켜면 선택한 소식만 받아요.|Your selections are kept. Turn delivery on to receive only selected news.|各项选择会保留。启用通知后仅接收已选消息。|Lựa chọn riêng được giữ. Bật nhận để chỉ nhận tin đã chọn.|個別の選択は保持されます。受信をオンにすると選んだ情報だけを受け取ります。
선택한 공고의 변경사항|Changes to selected notices|已选公告的变更|Thay đổi của thông báo đã chọn|選択した公示の変更
관심 공고의 신청 일정, 지원 내용 등 변경사항을 알려드려요.|Get updates to application dates and support details for notices you follow.|接收关注公告的申请时间、援助内容等变更。|Nhận cập nhật về lịch đăng ký và nội dung hỗ trợ của thông báo quan tâm.|気になる公示の申請日程や支援内容などの変更をお知らせします。
즐겨찾기와 유사한 공고|Notices similar to favorites|类似收藏的公告|Thông báo giống mục yêu thích|お気に入りに似た公示
즐겨찾기한 공고와 비슷한 새 공고를 알려드려요.|Get new notices similar to your favorites.|接收与收藏公告类似的新公告。|Nhận thông báo mới tương tự mục yêu thích.|お気に入りの公示に似た新しい公示をお知らせします。
내 조건에 맞는 공고|Notices matching my situation|符合我条件的公告|Thông báo phù hợp điều kiện của tôi|自分の条件に合う公示
입력한 조건에 맞는 공고를 알려드려요. 최종 신청 자격은 공고에서 확인해 주세요.|Get notices matching your details. Check the notice for final eligibility.|接收符合您填写条件的公告。最终申请资格请在公告中确认。|Nhận thông báo phù hợp thông tin đã nhập. Kiểm tra điều kiện cuối cùng trong thông báo.|入力した条件に合う公示をお知らせします。最終的な申請資格は公示で確認してください。
지원한 공고의 발표일|Result dates for applications|已申请公告的结果公布日|Ngày công bố kết quả đăng ký|申請した公示の発表日
지원한 공고의 결과 발표일을 알려드려요.|Get reminders of application result dates.|接收申请结果公布日期提醒。|Nhận nhắc nhở về ngày công bố kết quả.|申請した公示の結果発表日をお知らせします。
알림 설정을 저장하고 있어요.|Saving notification settings.|正在保存通知设置。|Đang lưu cài đặt thông báo.|通知設定を保存しています。
알림 설정을 저장했어요.|Notification settings saved.|通知设置已保存。|Đã lưu cài đặt thông báo.|通知設定を保存しました。
필요한 공고 소식을 알려드릴까요?|Would you like notice updates?|想接收所需公告的消息吗？|Bạn muốn nhận tin về thông báo cần thiết?|必要な公示の情報をお知らせしますか？
다음 소식을 알림으로 받을 수 있어요.|You can receive these updates.|您可以接收以下通知。|Bạn có thể nhận các tin sau.|次の情報を通知で受け取れます。
알림은 선택사항이에요. 로그인 후 내 계정에서 전체 수신을 켜고, 받고 싶은 알림을 고를 수 있어요.|Notifications are optional. Sign in, enable delivery in My account and choose the types you want.|通知为可选项。登录后在“我的账户”启用接收，并选择所需通知。|Thông báo là tùy chọn. Đăng nhập, bật nhận trong Tài khoản và chọn loại tin mong muốn.|通知は任意です。ログイン後、マイアカウントで受信をオンにし、受け取りたい種類を選べます。
알림 허용하기|Allow notifications|允许通知|Cho phép thông báo|通知を許可
나중에 설정|Set up later|稍后设置|Thiết lập sau|後で設定
알림 설정을 처리하지 못했어요. 다시 시도해 주세요.|Could not update notification settings. Try again.|无法处理通知设置。请重试。|Không cập nhật được cài đặt thông báo. Hãy thử lại.|通知設定を処理できませんでした。再試行してください。
알림 기능을 열지 못했어요. 새 버전의 앱으로 다시 설치한 뒤 확인해 주세요.|Notifications could not start. Reinstall the latest app and check again.|无法启用通知功能。请安装最新版应用后重试。|Không mở được tính năng thông báo. Cài lại ứng dụng mới nhất và kiểm tra.|通知機能を開けませんでした。最新版のアプリを再インストールして確認してください。
기기에서 알림을 허용해 주세요. 권한을 거절했다면 기기 알림 설정에서 켤 수 있어요.|Allow device notifications. If you denied permission, enable them in device settings.|请允许设备通知。如曾拒绝权限，可在设备通知设置中开启。|Cho phép thông báo trên thiết bị. Nếu đã từ chối, bạn có thể bật trong cài đặt thiết bị.|端末で通知を許可してください。拒否した場合は端末の通知設定で有効にできます。
알림 권한을 확인하지 못했어요. 앱을 다시 설치한 뒤 확인해 주세요.|Could not check notification permission. Reinstall the app and check again.|无法确认通知权限。请重新安装应用后检查。|Không kiểm tra được quyền thông báo. Cài lại ứng dụng và kiểm tra.|通知権限を確認できませんでした。アプリを再インストールして確認してください。
알림 권한을 확인하지 못했어요. 다시 시도하거나 나중에 설정해 주세요.|Could not check notification permission. Retry or set it up later.|无法确认通知权限。请重试或稍后设置。|Không kiểm tra được quyền thông báo. Thử lại hoặc thiết lập sau.|通知権限を確認できませんでした。再試行するか後で設定してください。
기기 설정을 열지 못했어요. 휴대전화 설정에서 복지나침반 알림을 확인해 주세요.|Could not open device settings. Check Welfare Compass notifications in your phone settings.|无法打开设备设置。请在手机设置中查看福利指南针通知。|Không mở được cài đặt thiết bị. Kiểm tra thông báo La bàn phúc lợi trong cài đặt điện thoại.|端末設定を開けませんでした。スマートフォンの設定で福祉コンパスの通知を確認してください。
알림 설정을 확인하지 못했어요.|Could not load notification settings.|无法确认通知设置。|Không tải được cài đặt thông báo.|通知設定を確認できませんでした。
알림 기기를 등록하지 못했어요.|Could not register the notification device.|无法注册通知设备。|Không đăng ký được thiết bị nhận thông báo.|通知端末を登録できませんでした。
기기 알림 중지를 확인하지 못했어요.|Could not confirm device notifications stopped.|无法确认设备通知已停止。|Không xác nhận được việc ngừng thông báo thiết bị.|端末通知の停止を確認できませんでした。
중위소득 계산기|Median-income calculator|中位收入计算器|Máy tính thu nhập trung vị|基準中位所得の計算機
우리 집 소득 기준 알아보기|Check my household income threshold|查看家庭收入标准|Kiểm tra mức chuẩn thu nhập gia đình|わが家の所得基準を調べる
계산 결과를 확인하세요|View your calculation results|查看计算结果|Xem kết quả tính toán|計算結果を確認してください
입력한 내용을 확인해 주세요|Review your information|请确认输入内容|Kiểm tra thông tin đã nhập|入力内容を確認してください
중위소득 빠른 확인|Quick median-income check|快速查看中位收入|Kiểm tra nhanh thu nhập trung vị|基準中位所得の簡易確認
소득·재산 상세 계산|Detailed income and asset calculation|收入与财产详细计算|Tính chi tiết thu nhập và tài sản|所得・財産の詳細計算
가구원 수만 선택하면 기준 금액이 바로 나와요.|Select your household size to see the threshold.|选择家庭人数即可查看标准金额。|Chọn số thành viên để xem mức chuẩn.|世帯人数を選ぶだけで基準額が表示されます。
모르는 정보는 모름으로 남겨두어도 괜찮아요.|You can leave uncertain information as unknown.|不确定的信息可以保留为“不知道”。|Thông tin chưa biết có thể để là Không rõ.|分からない情報は「不明」のままでも大丈夫です。
빠른 확인|Quick check|快速查看|Kiểm tra nhanh|簡易確認
상세 계산|Detailed calculation|详细计算|Tính chi tiết|詳細計算
저장한 소득·재산 정보를 불러오고 있어요.|Loading saved income and asset information.|正在加载已保存的收入与财产信息。|Đang tải thông tin thu nhập và tài sản đã lưu.|保存した所得・財産情報を読み込んでいます。
저장 정보 다시 불러오기|Reload saved information|重新加载保存的信息|Tải lại thông tin đã lưu|保存情報を再読み込み
입력 내용 확인·수정|Review and edit inputs|确认和修改输入|Kiểm tra và sửa thông tin|入力内容の確認・編集
입력한 금융정보를 내 계정에 저장하는 데 동의합니다.|I agree to save my financial information to my account.|我同意将填写的财务信息保存到账户。|Tôi đồng ý lưu thông tin tài chính vào tài khoản.|入力した金融情報をアカウントに保存することに同意します。
금융정보 계정 저장 동의|Consent to saving financial information|同意保存财务信息|Đồng ý lưu thông tin tài chính|金融情報のアカウント保存への同意
내 계정에 저장|Save to my account|保存到我的账户|Lưu vào tài khoản|マイアカウントに保存
상세 계산 진행|Detailed calculation progress|详细计算进度|Tiến trình tính chi tiết|詳細計算の進行状況
차량 한 대 추가|Add a vehicle|添加一辆车|Thêm một xe|車両を1台追加
참고 금액 계산하기|Calculate reference amounts|计算参考金额|Tính số tiền tham khảo|参考額を計算
이전 단계|Previous step|上一步|Bước trước|前のステップ
입력·저장 정보 관리|Manage draft and saved information|管理输入与保存信息|Quản lý thông tin đang nhập và đã lưu|入力・保存情報の管理
저장 정보는 자동으로 불러옵니다. 수정 내용은 동의 후 저장 버튼을 눌러야 계정에 반영돼요.|Saved information loads automatically. Changes reach your account only after consent and tapping Save.|已保存的信息会自动加载。修改需同意后点击保存才会反映到账户。|Thông tin đã lưu tự tải. Thay đổi chỉ cập nhật vào tài khoản sau khi đồng ý và nhấn Lưu.|保存情報は自動で読み込みます。変更は同意後に保存を押すとアカウントに反映されます。
로그인 없이 계산할 수 있어요. 입력 내용은 앱을 종료하면 사라집니다.|You can calculate without signing in. Inputs are cleared when the app closes.|无需登录即可计算。关闭应用后输入内容会消失。|Có thể tính mà không đăng nhập. Nội dung nhập sẽ mất khi đóng ứng dụng.|ログインせずに計算できます。アプリを終了すると入力内容は消えます。
저장한 정보로 다시 불러오기|Restore saved information|恢复保存的信息|Khôi phục thông tin đã lưu|保存した情報で再読み込み
계정에 저장한 정보 삭제|Delete saved account information|删除账户保存的信息|Xóa thông tin đã lưu vào tài khoản|アカウントの保存情報を削除
화면 입력 지우기|Clear current inputs|清除当前输入|Xóa nội dung đang nhập|画面の入力を消去
저장 정보를 삭제할까요?|Delete saved information?|删除保存的信息吗？|Xóa thông tin đã lưu?|保存情報を削除しますか？
화면 입력을 지울까요?|Clear current inputs?|清除当前输入吗？|Xóa nội dung đang nhập?|画面の入力を消去しますか？
저장한 정보로 바꿀까요?|Replace with saved information?|替换为保存的信息吗？|Thay bằng thông tin đã lưu?|保存情報に置き換えますか？
계정에 저장한 정보는 유지됩니다.|Saved account information is kept.|账户保存的信息会保留。|Thông tin đã lưu trong tài khoản được giữ.|アカウントに保存した情報は保持されます。
계정에 저장한 금융정보와 현재 입력이 삭제됩니다.|Saved financial information and current inputs will be deleted.|账户保存的财务信息和当前输入将被删除。|Thông tin tài chính đã lưu và nội dung đang nhập sẽ bị xóa.|保存した金融情報と現在の入力は削除されます。
작성 중인 입력을 저장한 정보로 바꿉니다.|Current inputs will be replaced with saved information.|当前输入将替换为保存的信息。|Nội dung đang nhập sẽ được thay bằng thông tin đã lưu.|入力中の内容を保存情報に置き換えます。
함께 사는 가구원은 몇 명인가요?|How many people live in your household?|一起生活的家庭成员有几人？|Gia đình bạn có bao nhiêu người cùng sống?|一緒に暮らす世帯員は何人ですか？
실제 가구원 수|Exact household size|实际家庭人数|Số thành viên chính xác|実際の世帯人数
실제 인원|Exact number of people|实际人数|Số người chính xác|実際の人数
본인을 포함한 인원을 선택하세요.|Include yourself in the count.|请选择包含您本人的人数。|Chọn số người bao gồm cả bạn.|本人を含む人数を選んでください。
매월 · 기준 중위소득 100%|Monthly · 100% of standard median income|每月 · 基准中位收入100%|Hàng tháng · 100% thu nhập trung vị chuẩn|毎月・基準中位所得100%
가구 전체 월소득 (선택 · 만원)|Household monthly income (optional · ₩10,000)|家庭月总收入（可选 · 万韩元）|Thu nhập tháng của gia đình (tùy chọn · 10.000 won)|世帯の月収合計（任意・万ウォン）
예: 300|e.g. 300|例如：300|Ví dụ: 300|例：300
근로소득은 세전, 사업소득은 필요경비 차감 후 금액이에요. 소득이 없으면 0을 입력하세요.|Use wages before tax and business income after expenses. Enter 0 if there is no income.|工资填税前收入，经营收入填扣除必要费用后的金额。无收入请填0。|Lương dùng số trước thuế, kinh doanh dùng số sau chi phí. Nhập 0 nếu không có thu nhập.|給与は税引前、事業所得は必要経費を引いた金額です。所得がなければ0を入力してください。
비율별 기준 금액|Thresholds by percentage|各比例标准金额|Mức chuẩn theo tỷ lệ|割合ごとの基準額
보건복지부 공식 기준 보기|View official ministry thresholds|查看保健福祉部官方标准|Xem mức chuẩn chính thức của Bộ Y tế và Phúc lợi|保健福祉部の公式基準を見る
소득과 재산까지 알아보려면|To include income and assets|若要了解收入与财产|Để xem cả thu nhập và tài sản|所得と財産も調べるには
소득 공제와 재산 환산을 반영하는 상세 계산으로 이어갈 수 있어요.|Continue to detailed calculation including income deductions and asset conversion.|可继续进行考虑收入扣除和财产折算的详细计算。|Tiếp tục tính chi tiết có khấu trừ thu nhập và quy đổi tài sản.|所得控除と財産の換算を反映する詳細計算に進めます。
빠른 확인은 월소득의 단순 비율 비교예요. 지원 자격과 지급액을 확정하지 않습니다.|The quick check compares monthly income only. It does not determine eligibility or benefit amounts.|快速查看仅比较月收入比例，不确定申请资格或补助金额。|Kiểm tra nhanh chỉ so sánh tỷ lệ thu nhập tháng, không xác định điều kiện hay mức trợ cấp.|簡易確認は月収の単純な割合比較です。支援資格や支給額を確定するものではありません。
모름|Unknown|不知道|Không rõ|不明
모르겠어요|I don't know|我不知道|Tôi không rõ|分かりません
없음|None|无|Không có|なし
있어요|Has an amount|有|Có|あり
없어요 (0원)|None (₩0)|无（0韩元）|Không có (0 won)|なし（0ウォン）
선택 · 필수 아님|Optional|可选 · 非必填|Tùy chọn · không bắt buộc|任意・必須ではありません
금액 (만원)|Amount (₩10,000 units)|金额（万韩元）|Số tiền (đơn vị 10.000 won)|金額（万ウォン）
만원|₩10,000|万韩元|10.000 won|万ウォン
모르면 비워두세요|Leave blank if unknown|不知道请留空|Để trống nếu không rõ|不明なら空欄にしてください
만원 단위로 입력해요. 예: 300 = 300만 원|Enter in ₩10,000 units. e.g. 300 = ₩3,000,000|以万韩元为单位输入。例如：300 = 300万韩元|Nhập theo đơn vị 10.000 won. Ví dụ: 300 = 3.000.000 won|万ウォン単位で入力します。例：300 = 300万ウォン
0원으로 계산해요.|Calculated as ₩0.|按0韩元计算。|Tính là 0 won.|0ウォンとして計算します。
확인할 항목으로 남겨두고 다음으로 갈 수 있어요.|Leave it for later checking and continue.|可保留为待确认项目并继续。|Có thể để lại để kiểm tra sau và tiếp tục.|確認が必要な項目として残し、次へ進めます。
이 가구원의 소득이 모두 없어요|This person has no income|该家庭成员无任何收入|Thành viên này không có thu nhập|この世帯員の所得はすべてありません
부채가 모두 없어요|No debts|无任何债务|Không có khoản nợ nào|負債はすべてありません
재산 합계|Total assets|财产总额|Tổng tài sản|財産の合計
사업별 참고 결과|Reference results by program|各项目参考结果|Kết quả tham khảo theo chương trình|制度ごとの参考結果
입력값으로 추정|Estimated from inputs|根据输入估算|Ước tính từ dữ liệu nhập|入力値から推定
추가 확인 필요|More information needed|需进一步确认|Cần kiểm tra thêm|追加確認が必要
입력값은 기준 이내|Inputs are within threshold|输入值在标准内|Dữ liệu trong mức chuẩn|入力値は基準以内
입력값은 기준 초과|Inputs exceed threshold|输入值超出标准|Dữ liệu vượt mức chuẩn|入力値は基準超過
확인 필요|Needs checking|需确认|Cần kiểm tra|確認が必要
입력 확인 필요|Check your input|需检查输入|Cần kiểm tra dữ liệu nhập|入力の確認が必要
미확인|Not confirmed|未确认|Chưa xác nhận|未確認
예|Yes|是|Có|はい
계산 내역 보기|View calculation details|查看计算明细|Xem chi tiết tính toán|計算内訳を見る
공식 출처 보기|View official sources|查看官方来源|Xem nguồn chính thức|公式の出典を見る
중위소득 비율은 확인이 필요해요|Median-income ratio needs checking|需确认中位收入比例|Cần kiểm tra tỷ lệ thu nhập trung vị|中位所得の割合は確認が必要です
모르는 소득을 0원으로 계산하지 않아요. 모든 소득 금액을 확인하면 합계를 볼 수 있어요.|Unknown income is not treated as zero. Confirm all amounts to see the total.|未知收入不会按0韩元计算。确认全部收入金额后可查看总额。|Thu nhập chưa biết không tính là 0. Xác nhận mọi khoản để xem tổng.|不明な所得を0ウォンとして計算しません。すべての金額を確認すると合計を表示できます。
입력한 소득의 단순 비교입니다. 세전 소득 또는 사업별 소득인정액과 다를 수 있어요.|This is a simple comparison of your inputs. It may differ from gross income or program-specific assessed income.|此为输入收入的简单比较，可能与税前收入或各项目认定收入不同。|Đây là so sánh đơn giản dữ liệu nhập, có thể khác thu nhập trước thuế hoặc mức được xét theo chương trình.|入力した所得の単純比較です。税引前所得や制度別の所得認定額とは異なる場合があります。
지원 자격과 지급액을 확정하는 결과가 아닙니다. 신청 전 공식 공고와 담당 기관에서 확인해 주세요.|These results do not determine eligibility or benefit amounts. Check the official notice and responsible organization before applying.|此结果不确定申请资格或补助金额。申请前请查看官方公告并咨询负责机构。|Kết quả không xác định điều kiện hay mức trợ cấp. Kiểm tra thông báo chính thức và cơ quan phụ trách trước khi đăng ký.|支援資格や支給額を確定する結果ではありません。申請前に公式公示と担当機関で確認してください。
공식 기준을 열지 못했어요.|Could not open official thresholds.|无法打开官方标准。|Không mở được mức chuẩn chính thức.|公式基準を開けませんでした。
공식 안내를 열지 못했어요.|Could not open official guidance.|无法打开官方指引。|Không mở được hướng dẫn chính thức.|公式案内を開けませんでした。
작성 중인 입력을 유지했어요. 저장한 정보는 직접 다시 불러올 수 있어요.|Your draft was kept. You can reload saved information manually.|已保留正在填写的内容。您可手动重新加载保存的信息。|Đã giữ nội dung đang nhập. Bạn có thể tự tải lại thông tin đã lưu.|入力中の内容を保持しました。保存情報は手動で再読み込みできます。
저장한 정보를 불러왔어요. 바뀐 내용만 확인해 주세요.|Saved information loaded. Review any changes.|已加载保存的信息。请确认变更内容。|Đã tải thông tin đã lưu. Kiểm tra nội dung thay đổi.|保存情報を読み込みました。変更された内容をご確認ください。
저장된 정보가 없어 현재 입력을 유지했어요.|No saved information; current inputs were kept.|没有保存的信息，已保留当前输入。|Không có thông tin đã lưu; đã giữ nội dung hiện tại.|保存情報がないため現在の入力を保持しました。
저장 정보를 불러오지 못했어요. 작성 중인 내용은 유지됩니다.|Could not load saved information. Your draft is kept.|无法加载保存的信息。正在填写的内容会保留。|Không tải được thông tin đã lưu. Nội dung đang nhập được giữ.|保存情報を読み込めませんでした。入力中の内容は保持されます。
실제 가구원 수를 선택하거나 입력해 주세요.|Select or enter the exact household size.|请选择或填写实际家庭人数。|Chọn hoặc nhập số thành viên chính xác.|実際の世帯人数を選ぶか入力してください。
화면 입력을 지웠어요. 계정 저장 정보는 유지됩니다.|Current inputs cleared. Saved account information is kept.|已清除当前输入。账户保存的信息会保留。|Đã xóa nội dung hiện tại. Thông tin trong tài khoản được giữ.|画面の入力を消去しました。アカウントの保存情報は保持されます。
내 계정에 저장했어요.|Saved to your account.|已保存到您的账户。|Đã lưu vào tài khoản.|アカウントに保存しました。
계정에 저장한 금융정보와 현재 입력을 삭제했어요.|Saved financial information and current inputs deleted.|已删除账户保存的财务信息和当前输入。|Đã xóa thông tin tài chính đã lưu và nội dung hiện tại.|保存した金融情報と現在の入力を削除しました。
계정 저장에 동의해 주세요.|Please consent to saving to your account.|请同意保存到账户。|Vui lòng đồng ý lưu vào tài khoản.|アカウントへの保存に同意してください。
서버 연결이 원활하지 않아요|Server connection is unavailable|服务器连接不畅|Kết nối máy chủ không ổn định|サーバーに接続できません
공고 조회·로그인·계산·저장은 연결이 복구된 뒤 다시 시도해 주세요.|Retry browsing, signing in, calculating and saving after the connection recovers.|请在连接恢复后重试查看公告、登录、计算和保存。|Thử lại việc xem thông báo, đăng nhập, tính và lưu khi kết nối phục hồi.|接続が復旧してから公示の閲覧・ログイン・計算・保存を再試行してください。
연결 확인 중…|Checking connection…|正在检查连接…|Đang kiểm tra kết nối…|接続を確認中…
다시 연결|Reconnect|重新连接|Kết nối lại|再接続
공고 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.|Could not connect to the notice server. Try again shortly.|无法连接公告服务器。请稍后重试。|Không kết nối được máy chủ thông báo. Hãy thử lại sau.|公示サーバーに接続できませんでした。しばらくしてから再試行してください。
서버 응답이 늦어지고 있습니다. 인터넷 연결을 확인하고 다시 연결해 주세요.|Server response is delayed. Check your internet connection and reconnect.|服务器响应延迟。请检查网络并重新连接。|Máy chủ phản hồi chậm. Kiểm tra internet và kết nối lại.|サーバーの応答が遅れています。インターネット接続を確認し、再接続してください。
서버가 꺼져 있거나 인터넷 연결이 끊겼을 수 있습니다. Wi-Fi·모바일 데이터를 확인해 주세요.|The server or internet connection may be unavailable. Check Wi-Fi or mobile data.|服务器可能已关闭或网络已断开。请检查Wi-Fi或移动数据。|Máy chủ hoặc internet có thể không hoạt động. Kiểm tra Wi-Fi hoặc dữ liệu di động.|サーバーの停止または接続切断の可能性があります。Wi-Fi・モバイルデータを確認してください。
서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 연결해 주세요.|The server is temporarily unavailable. Reconnect shortly.|服务器暂时无响应。请稍后重新连接。|Máy chủ tạm thời không phản hồi. Kết nối lại sau.|サーバーが一時的に応答していません。しばらくしてから再接続してください。
서버에서 올바른 응답을 받지 못했습니다. 잠시 후 다시 연결해 주세요.|Invalid server response. Reconnect shortly.|服务器返回无效响应。请稍后重新连接。|Phản hồi máy chủ không hợp lệ. Kết nối lại sau.|正しいサーバー応答を受信できませんでした。しばらくしてから再接続してください。
복지나침반 서버인지 확인해 주세요.|Check that this is the Welfare Compass server.|请确认这是福利指南针服务器。|Kiểm tra đây là máy chủ La bàn phúc lợi.|福祉コンパスのサーバーか確認してください。
복지나침반 서버 응답을 확인할 수 없습니다.|Could not verify the Welfare Compass server response.|无法确认福利指南针服务器响应。|Không xác minh được phản hồi máy chủ La bàn phúc lợi.|福祉コンパスのサーバー応答を確認できません。
EXPO_PUBLIC_API_BASE_URL에 서버 주소를 설정해 주세요.|Set the server address in EXPO_PUBLIC_API_BASE_URL.|请在EXPO_PUBLIC_API_BASE_URL中设置服务器地址。|Đặt địa chỉ máy chủ trong EXPO_PUBLIC_API_BASE_URL.|EXPO_PUBLIC_API_BASE_URLにサーバーのアドレスを設定してください。
서버 주소 형식이 올바르지 않습니다.|Invalid server address format.|服务器地址格式不正确。|Định dạng địa chỉ máy chủ không hợp lệ.|サーバーのアドレス形式が正しくありません。
운영 서버에는 인증정보·쿼리가 없는 HTTPS 주소를 사용해 주세요.|Use an HTTPS production address without credentials or queries.|生产服务器请使用不含凭据或查询参数的HTTPS地址。|Dùng địa chỉ HTTPS không chứa thông tin xác thực hoặc truy vấn cho máy chủ chính thức.|本番サーバーには認証情報やクエリを含まないHTTPSアドレスを使用してください。
요청을 취소했습니다.|Request cancelled.|请求已取消。|Đã hủy yêu cầu.|リクエストを取り消しました。
아이디·비밀번호를 확인하거나 다시 로그인해 주세요.|Check your username and password or sign in again.|请检查用户名和密码或重新登录。|Kiểm tra tên đăng nhập và mật khẩu hoặc đăng nhập lại.|ユーザー名・パスワードを確認するか再度ログインしてください。
요청을 확인할 수 없습니다. 앱을 업데이트해 주세요.|Could not validate the request. Update the app.|无法验证请求。请更新应用。|Không xác thực được yêu cầu. Hãy cập nhật ứng dụng.|リクエストを確認できません。アプリを更新してください。
아직 제공되지 않는 기능입니다.|This feature is not available yet.|此功能尚未提供。|Tính năng này chưa khả dụng.|この機能はまだ提供されていません。
입력한 값과 저장 동의를 확인해 주세요.|Check your inputs and consent to save.|请检查输入值和保存同意。|Kiểm tra dữ liệu nhập và đồng ý lưu.|入力値と保存への同意を確認してください。
요청이 많습니다. 잠시 후 다시 시도해 주세요.|Too many requests. Try again shortly.|请求过多。请稍后重试。|Quá nhiều yêu cầu. Hãy thử lại sau.|リクエストが多くなっています。しばらくしてから再試行してください。
서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.|The server could not process the request. Try again shortly.|服务器无法处理请求。请稍后重试。|Máy chủ không xử lý được yêu cầu. Hãy thử lại sau.|サーバーで処理できませんでした。しばらくしてから再試行してください。
서버 응답을 읽을 수 없습니다.|Could not read the server response.|无法读取服务器响应。|Không đọc được phản hồi máy chủ.|サーバーの応答を読み取れません。
연결이 지연됩니다. 다시 시도해 주세요.|Connection timed out. Try again.|连接超时。请重试。|Kết nối bị chậm. Hãy thử lại.|接続が遅れています。再試行してください。
서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.|Could not connect to the server. Check your network.|无法连接服务器。请检查网络。|Không kết nối được máy chủ. Kiểm tra mạng.|サーバーに接続できませんでした。ネットワークを確認してください。
로그인 결과를 읽을 수 없습니다.|Could not read the sign-in result.|无法读取登录结果。|Không đọc được kết quả đăng nhập.|ログイン結果を読み取れません。
계정 정보를 읽을 수 없습니다.|Could not read account information.|无法读取账户信息。|Không đọc được thông tin tài khoản.|アカウント情報を読み取れません。
로그인 상태를 확인하지 못했습니다. 연결과 보안 저장소를 확인하고 다시 시도해 주세요.|Could not check sign-in status. Check your connection and secure storage, then retry.|无法检查登录状态。请检查连接和安全存储后重试。|Không kiểm tra được trạng thái đăng nhập. Kiểm tra kết nối và bộ nhớ an toàn rồi thử lại.|ログイン状態を確認できませんでした。接続と安全な保存領域を確認して再試行してください。
로그인을 안전하게 저장하지 못했습니다. 다시 확인해 주세요.|Could not securely save sign-in. Check again.|无法安全保存登录信息。请重新检查。|Không lưu an toàn được thông tin đăng nhập. Kiểm tra lại.|ログイン情報を安全に保存できませんでした。再確認してください。
로그아웃을 완료하지 못했습니다. 연결 후 다시 시도해 주세요.|Could not finish signing out. Reconnect and retry.|无法完成退出登录。请连接后重试。|Không hoàn tất được đăng xuất. Kết nối lại và thử.|ログアウトを完了できませんでした。接続してから再試行してください。
로그인이 만료되었습니다.|Your session expired.|登录已过期。|Phiên đăng nhập đã hết hạn.|ログインの有効期限が切れました。
보안 저장소를 정리하지 못했습니다. 다시 시도해 주세요.|Could not clear secure storage. Try again.|无法清理安全存储。请重试。|Không dọn được bộ nhớ an toàn. Hãy thử lại.|安全な保存領域を消去できませんでした。再試行してください。
보안 저장소를 정리하지 못했습니다. 다시 확인해 주세요.|Could not clear secure storage. Check again.|无法清理安全存储。请重新检查。|Không dọn được bộ nhớ an toàn. Kiểm tra lại.|安全な保存領域を消去できませんでした。再確認してください。
저장 정보를 읽을 수 없습니다.|Could not read saved information.|无法读取保存的信息。|Không đọc được thông tin đã lưu.|保存情報を読み取れません。
저장 결과를 확인하지 못했습니다.|Could not verify the save result.|无法确认保存结果。|Không xác minh được kết quả lưu.|保存結果を確認できませんでした。
삭제 결과를 확인하지 못했습니다.|Could not verify deletion.|无法确认删除结果。|Không xác minh được kết quả xóa.|削除結果を確認できませんでした。
공고 정보를 읽을 수 없어요. 다시 시도해 주세요.|Could not read notice information. Try again.|无法读取公告信息。请重试。|Không đọc được thông tin thông báo. Hãy thử lại.|公示情報を読み取れません。再試行してください。
공고 목록을 읽을 수 없어요. 다시 시도해 주세요.|Could not read the notice list. Try again.|无法读取公告列表。请重试。|Không đọc được danh sách thông báo. Hãy thử lại.|公示一覧を読み取れません。再試行してください。
공고 목록의 개수를 확인할 수 없어요.|Could not verify the notice count.|无法确认公告数量。|Không xác minh được số thông báo.|公示件数を確認できません。
{label} {action}|{label} {action}|{label} {action}|{label} {action}|{label} {action}
{category} 공고 찾기|Find {category} notices|查找{category}公告|Tìm thông báo {category}|{category}の公示を探す
배너 {current} / {total}|Banner {current} of {total}|横幅 {current} / {total}|Biểu ngữ {current} / {total}|バナー {current} / {total}
{count}명|{count} people|{count}人|{count} người|{count}人
{count}명 이상|{count} or more people|{count}人以上|Từ {count} người|{count}人以上
{label}를 선택해 주세요.|Select {label}.|请选择{label}。|Chọn {label}.|{label}を選んでください。
{count}명 이상 직접 입력|Enter {count} or more people|手动输入{count}人以上|Nhập từ {count} người|{count}人以上は直接入力
{label} (명)|{label} (people)|{label}（人）|{label} (người)|{label}（人）
{min}~{max}명|{min}–{max} people|{min}至{max}人|{min}–{max} người|{min}～{max}人
{label} 도움말|Help for {label}|{label}帮助|Hướng dẫn {label}|{label}のヘルプ
입력한 금액: {amount}|Entered amount: {amount}|输入金额：{amount}|Số tiền đã nhập: {amount}|入力金額：{amount}
{year}년 · {count}인 가구 기준 중위소득|{year} · Standard median income for a {count}-person household|{year}年 · {count}人家庭基准中位收入|{year} · Thu nhập trung vị chuẩn cho gia đình {count} người|{year}年・{count}人世帯の基準中位所得
입력한 월소득 {amount}|Entered monthly income {amount}|输入月收入 {amount}|Thu nhập tháng đã nhập {amount}|入力した月収 {amount}
기준 중위소득의 {percent}%|{percent}% of standard median income|基准中位收入的{percent}%|{percent}% thu nhập trung vị chuẩn|基準中位所得の{percent}%
{year}년 기준 · 입력한 월소득 합계|{year} reference · Total entered monthly income|{year}年标准 · 输入月收入总额|Chuẩn {year} · Tổng thu nhập tháng đã nhập|{year}年基準・入力した月収の合計
차량 포함 {amount}|Including vehicles: {amount}|含车辆：{amount}|Bao gồm xe: {amount}|車両を含む {amount}
계산값 {value} · 기준 {limit}|Calculated {value} · Threshold {limit}|计算值 {value} · 标准 {limit}|Giá trị {value} · Mức chuẩn {limit}|計算値 {value}・基準 {limit}
{label} 계산 내역|Calculation details for {label}|{label}计算明细|Chi tiết tính toán {label}|{label}の計算内訳
{title} 자세히 보기|View details: {title}|查看详情：{title}|Xem chi tiết: {title}|{title}の詳細を見る
원문 근거 {action}|Original evidence: {action}|原文依据：{action}|Căn cứ gốc: {action}|原文の根拠：{action}
검색 범위 {scope}|Search scope: {scope}|搜索范围：{scope}|Phạm vi: {scope}|検索範囲：{scope}
{corrections}로 찾았어요.|Searched using {corrections}.|已使用{corrections}搜索。|Đã tìm bằng {corrections}.|{corrections}で検索しました。
{label} {count}개|{label} ({count})|{label}（{count}项）|{label} ({count})|{label}（{count}件）
{count}개|{count} items|{count}项|{count} mục|{count}件
{page}번째 페이지|Page {page}|第{page}页|Trang {page}|{page}ページ目
기기 알림 권한: {status}|Device notification permission: {status}|设备通知权限：{status}|Quyền thông báo thiết bị: {status}|端末の通知権限：{status}
{section} 정보를 알려주세요|Tell us about {section}|请提供{section}信息|Cho biết thông tin về {section}|{section}の情報を教えてください
{step}단계 {group}|Step {step}: {group}|第{step}步：{group}|Bước {step}: {group}|ステップ{step}：{group}
{step} / 6단계 · 금액은 만원 단위|Step {step} / 6 · Amounts in ₩10,000 units|第{step} / 6步 · 金额单位为万韩元|Bước {step} / 6 · Đơn vị 10.000 won|ステップ{step} / 6・金額は万ウォン単位
{section} 정보|{section} information|{section}信息|Thông tin {section}|{section}の情報
{section} 정보 수정|Edit {section} information|修改{section}信息|Sửa thông tin {section}|{section}の情報を編集
{section} 입력 내역 펼치기|Expand {section} inputs|展开{section}输入明细|Mở nội dung nhập {section}|{section}の入力内容を開く
차량 {count}대|{count} vehicles|{count}辆车|{count} xe|車両 {count}台
차량 {index} 삭제|Delete vehicle {index}|删除车辆{index}|Xóa xe {index}|車両{index}を削除
다음 · {section}|Next · {section}|下一步 · {section}|Tiếp · {section}|次へ・{section}
가구원 {index} / {total}|Household member {index} / {total}|家庭成员 {index} / {total}|Thành viên {index} / {total}|世帯員 {index} / {total}
차량 {index} / {total}|Vehicle {index} / {total}|车辆 {index} / {total}|Xe {index} / {total}|車両 {index} / {total}
가구원 {index} / {total} · {topic}|Household member {index} / {total} · {topic}|家庭成员 {index} / {total} · {topic}|Thành viên {index} / {total} · {topic}|世帯員 {index} / {total}・{topic}
차량 {index} / {total} · {topic}|Vehicle {index} / {total} · {topic}|车辆 {index} / {total} · {topic}|Xe {index} / {total} · {topic}|車両 {index} / {total}・{topic}
{label}을(를) 입력해 주세요.|Enter {label}.|请输入{label}。|Nhập {label}.|{label}を入力してください。
{label}은(는) 0 이상의 정수로 입력해 주세요.|Enter {label} as a non-negative whole number.|{label}请输入0以上的整数。|Nhập {label} bằng số nguyên không âm.|{label}は0以上の整数で入力してください。
{label}의 입력 범위를 확인해 주세요.|Check the allowed range for {label}.|请检查{label}的允许范围。|Kiểm tra phạm vi cho phép của {label}.|{label}の入力範囲を確認してください。
{label}을(를) 입력하거나 없음·모름을 선택해 주세요.|Enter {label} or choose None/Unknown.|请输入{label}或选择无／不知道。|Nhập {label} hoặc chọn Không có/Không rõ.|{label}を入力するか、なし・不明を選んでください。
{label}은(는) 만원 단위 숫자로 입력해 주세요. 소수점은 넷째 자리까지 가능해요.|Enter {label} in ₩10,000 units with up to four decimal places.|{label}请以万韩元为单位输入，最多保留四位小数。|Nhập {label} theo đơn vị 10.000 won, tối đa bốn chữ số thập phân.|{label}は万ウォン単位で入力してください。小数点以下4桁まで入力できます。
{label}을(를) 선택해 주세요.|Select {label}.|请选择{label}。|Chọn {label}.|{label}を選んでください。
나이·공제 유형|Age and deduction type|年龄与扣除类型|Tuổi và loại khấu trừ|年齢・控除の種類
월급이 있나요?|Do you receive wages?|有工资收入吗？|Bạn có nhận lương không?|給与収入はありますか？
사업소득이 있나요?|Do you have business income?|有经营收入吗？|Bạn có thu nhập kinh doanh không?|事業所得はありますか？
그 밖에 받는 돈이 있나요?|Do you receive other income?|还有其他收入吗？|Bạn có thu nhập khác không?|他に受け取る収入はありますか？
명의와 사용 목적|Ownership and use|所有权与用途|Chủ sở hữu và mục đích sử dụng|名義と使用目的
차량 가액|Vehicle value|车辆价值|Giá trị xe|車両の価額
차량 제원과 보조금|Vehicle specifications and subsidies|车辆参数与补助|Thông số xe và trợ cấp|車両の仕様と補助金
푸시 서비스 연결을 준비 중이에요. 알림 권한과 수신 설정은 저장할 수 있어요.|Push service connection is being prepared. You can save notification permissions and preferences.|推送服务连接正在准备中。您可保存通知权限和接收设置。|Đang chuẩn bị kết nối dịch vụ đẩy. Bạn có thể lưu quyền và cài đặt nhận thông báo.|プッシュサービスの接続を準備中です。通知の権限と受信設定は保存できます。
알림 기기를 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.|Could not connect the notification device. Check your network and retry.|无法连接通知设备。请检查网络后重试。|Không kết nối được thiết bị nhận thông báo. Kiểm tra mạng và thử lại.|通知端末を接続できませんでした。ネットワークを確認して再試行してください。
안드로이드 앱에서 이용해 주세요.|Please use the Android app.|请使用Android应用。|Vui lòng dùng ứng dụng Android.|Androidアプリをご利用ください。
언어 설정을 저장하지 못했어요. 현재 화면에는 적용되지만 다음 실행 때 다시 선택해야 할 수 있어요.|Could not save the language preference. It applies now, but you may need to select it again next time.|无法保存语言设置。当前界面已应用，但下次可能需要重新选择。|Không lưu được ngôn ngữ. Hiện đã áp dụng, nhưng lần sau có thể cần chọn lại.|言語設定を保存できませんでした。現在の画面には反映されますが、次回は再選択が必要になる場合があります。
`;

export const mobileMessages = Object.fromEntries(
  rows
    .trim()
    .split("\n")
    .map((row) => {
      const [ko, en, zh, vi, ja] = row.split("|");
      return [ko, { en, zh, vi, ja }];
    }),
);
