const rows = `
예: 서울 노원구 월계1동|e.g. 서울 노원구 월계1동|例如：서울 노원구 월계1동|Ví dụ: 서울 노원구 월계1동|例：서울 노원구 월계1동
중점 지역 · 노원구 월계1동|Focus area · Nowon-gu Wolgye 1-dong|重点区域 · 芦原区月溪1洞|Khu vực ưu tiên · Nowon-gu Wolgye 1-dong|重点地域 · 蘆原区月渓1洞
자료가 등록된 다른 지역|Other areas with listed services|已收录服务的其他地区|Khu vực khác có dịch vụ đã đăng|情報を掲載している他の地域
지역 선택|Choose an area|选择地区|Chọn khu vực|地域を選択
광역 전체|Province-wide|全市／道|Toàn tỉnh hoặc thành phố|市・道全域
전체 {count}개 서비스 · 공식 자료를 확인한 지역부터 넓혀가요.|{count} services in total · Expanding as official sources are reviewed.|共{count}项服务 · 按官方资料核实情况逐步扩大地区。|Tổng cộng {count} dịch vụ · Mở rộng theo nguồn chính thức đã kiểm tra.|全{count}件のサービス · 公式資料を確認した地域から拡大しています。
생활지역 범위|Area scope|生活区域范围|Phạm vi khu vực|生活エリアの範囲
구·광역 서비스 함께|Include district and regional services|包含区及市／道服务|Gồm dịch vụ quận và tỉnh, thành phố|区・広域サービスも表示
{neighborhood} 중심|Focus on {neighborhood}|以{neighborhood}为中心|Tập trung vào {neighborhood}|{neighborhood}を中心に表示
동 중심 보기에는 공식 자료에서 해당 동과의 관계를 확인한 안내만 표시해요.|Neighborhood view shows only services with an officially documented connection to that neighborhood.|社区视图仅显示官方资料确认与该洞有关的服务。|Chế độ khu phố chỉ hiển thị dịch vụ có liên hệ với khu phố được nguồn chính thức xác nhận.|洞を中心とした表示では、公式資料でその洞との関係を確認できた案内のみ表示します。
{neighborhood} 관련 안내|Related to {neighborhood}|与{neighborhood}相关的指南|Thông tin liên quan đến {neighborhood}|{neighborhood}に関する案内
생활서비스를 불러오고 있어요.|Loading local services.|正在加载生活服务。|Đang tải dịch vụ đời sống.|生活サービスを読み込んでいます。
생활서비스를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.|Could not load local services. Please try again shortly.|无法加载生活服务，请稍后重试。|Không thể tải dịch vụ. Vui lòng thử lại sau.|生活サービスを読み込めませんでした。しばらくしてから再度お試しください。
노원구·월계1동을 중심으로 다른 지역의 공식 안내도 함께 수집해요. 운영 일정과 이용 조건은 공식 안내에서 확인해 주세요.|We focus on Nowon-gu and Wolgye 1-dong while collecting official guidance for other areas. Check schedules and eligibility with the official provider.|以芦原区月溪1洞为重点，同时收集其他地区的官方信息。开放时间及使用条件请查看官方指南。|Ưu tiên Nowon-gu và Wolgye 1-dong, đồng thời thu thập thông tin chính thức ở nơi khác. Kiểm tra lịch và điều kiện sử dụng với đơn vị cung cấp.|蘆原区・月渓1洞を中心に他地域の公式案内も収集しています。運営日程と利用条件は公式案内でご確認ください。
우리 동네 복지|Neighborhood welfare|社区福利|Phúc lợi khu vực của bạn|わがまちの福祉
생활지역 서비스 보기|View local services|查看生活区域服务|Xem dịch vụ khu vực sinh hoạt|生活エリアのサービスを見る
동네에서 이용할 수 있는 도움을 찾아보세요.|Find support available in your neighborhood.|查找您所在社区可用的帮助。|Tìm hỗ trợ có sẵn trong khu vực của bạn.|身近な地域で利用できる支援を探しましょう。
무료버스·건강관리·동네 시설을 생활지역별로 살펴보세요.|Explore free buses, health services, and neighborhood facilities by area.|按生活区域查看免费巴士、健康管理和社区设施。|Khám phá xe buýt miễn phí, chăm sóc sức khỏe và cơ sở trong từng khu vực.|生活エリアごとに無料バス・健康管理・地域の施設を探しましょう。
동네 복지 둘러보기|Explore neighborhood welfare|浏览社区福利|Khám phá phúc lợi khu vực|地域の福祉を見る
동네 복지를 불러오고 있어요.|Loading neighborhood welfare.|正在加载社区福利。|Đang tải phúc lợi khu vực.|地域の福祉を読み込んでいます。
내 생활반경에서 찾는 도움|Support where you spend your day|寻找生活圈内的帮助|Hỗ trợ quanh nơi bạn sinh hoạt|生活圏で見つかる支援
무료버스부터 건강·돌봄·문화시설까지, 자주 머무는 지역의 도움을 찾아보세요.|Find support where you spend time, from free buses to health, care, and cultural facilities.|从免费巴士到健康、照护和文化设施，查找您常驻区域的帮助。|Tìm hỗ trợ tại nơi bạn thường sinh hoạt, từ xe buýt miễn phí đến sức khỏe, chăm sóc và cơ sở văn hóa.|無料バスから健康・ケア・文化施設まで、よく過ごす地域の支援を探しましょう。
어느 지역을 살펴볼까요?|Which area would you like to explore?|您想查看哪个区域？|Bạn muốn tìm hiểu khu vực nào?|どの地域を見てみますか？
예: 서울 노원구 월계동|e.g. 서울 노원구 월계동|例如：서울 노원구 월계동|Ví dụ: 서울 노원구 월계동|例：서울 노원구 월계동
이 지역 보기|View this area|查看此区域|Xem khu vực này|この地域を見る
집·직장·학교가 있는 지역을 입력하세요. 상세 주소는 필요 없어요.|Enter the area of your home, workplace, or school. A full street address is not needed.|请输入住所、工作单位或学校所在的区域，无需详细地址。|Nhập khu vực nhà ở, nơi làm việc hoặc trường học. Không cần địa chỉ chi tiết.|自宅・職場・学校がある地域を入力してください。詳しい住所は不要です。
내 주소 지역 사용|Use my saved address area|使用已保存地址的区域|Dùng khu vực trong địa chỉ đã lưu|保存した住所の地域を使う
서울 노원구 월계동 둘러보기|Explore 서울 노원구 월계동|浏览 서울 노원구 월계동|Khám phá 서울 노원구 월계동|서울 노원구 월계동を見る
가까운 곳에서 누리는 생활서비스|Everyday services close to you|身边的生活服务|Dịch vụ đời sống gần bạn|身近で利用できる生活サービス
{area}의 생활복지|Everyday welfare in {area}|{area}的生活福利|Phúc lợi đời sống tại {area}|{area}の生活福祉
내 지역부터 선택해 주세요|Choose your area first|请先选择您的区域|Hãy chọn khu vực của bạn trước|まず地域を選んでください
등록된 서비스 {count}개|{count} listed services|已收录{count}项服务|Đã đăng {count} dịch vụ|掲載サービス {count}件
선택한 시·군·구의 서비스를 모았어요. 실제 이용 장소와 대상은 서비스마다 달라요.|These services are in your selected city, county, or district. Locations and eligibility vary by service.|这里汇集了所选市、郡、区的服务。实际服务地点和对象因服务而异。|Đây là các dịch vụ tại thành phố, huyện hoặc quận đã chọn. Địa điểm và đối tượng sử dụng tùy từng dịch vụ.|選んだ市・郡・区のサービスを集めました。利用場所と対象者はサービスごとに異なります。
생활서비스 분야|Service categories|生活服务类别|Lĩnh vực dịch vụ đời sống|生活サービスの分野
지역 서비스의 상세 안내는 한국어 원문으로 제공돼요.|Local service details are provided in their original Korean.|地区服务详情以韩语原文提供。|Thông tin chi tiết về dịch vụ địa phương được cung cấp bằng tiếng Hàn gốc.|地域サービスの詳しい案内は韓国語の原文で表示されます。
어디에서 생활하고 계세요?|Where do you spend your day?|您在哪个区域生活？|Bạn sinh hoạt ở khu vực nào?|どの地域で過ごしていますか？
이 분야에 등록된 서비스가 아직 없어요|No services are listed in this category yet|此类别尚未收录服务|Chưa có dịch vụ nào được đăng trong lĩnh vực này|この分野のサービスはまだ掲載されていません
이 지역의 생활서비스를 아직 모으고 있어요|We are still gathering services for this area|我们仍在收集此区域的生活服务信息|Chúng tôi đang thu thập dịch vụ đời sống cho khu vực này|この地域の生活サービスを収集中です
시·도와 시·군·구를 입력하면 해당 지역의 안내를 볼 수 있어요.|Enter the province or metropolitan city and the city, county, or district to see local information.|输入省或广域市及市、郡、区，即可查看当地信息。|Nhập tỉnh hoặc thành phố trực thuộc trung ương và thành phố, huyện hoặc quận để xem thông tin địa phương.|市・道と市・郡・区を入力すると、その地域の案内を確認できます。
다른 분야를 선택해 동네 서비스를 살펴보세요.|Choose another category to explore neighborhood services.|请选择其他类别，查看社区服务。|Chọn lĩnh vực khác để khám phá dịch vụ trong khu vực.|別の分野を選んで地域のサービスを探しましょう。
등록된 정보가 없다는 뜻이며, 이용할 수 있는 복지가 없다는 뜻은 아니에요.|This means we have no listings yet; welfare services may still be available.|这表示尚未收录相关信息，并不代表没有可用的福利服务。|Điều này chỉ có nghĩa là chưa có thông tin được đăng, không có nghĩa là không có phúc lợi để sử dụng.|情報がまだ掲載されていないという意味で、利用できる福祉がないわけではありません。
전체 서비스 보기|View all services|查看全部服务|Xem tất cả dịch vụ|すべてのサービスを見る
현재 노원구의 공식 안내를 확인한 서비스부터 제공해요. 운영 일정과 이용 조건은 공식 안내에서 확인해 주세요.|We are starting with services verified against official information from 노원구. Check the official guidance for schedules and eligibility.|目前先提供已核对노원구官方信息的服务。请通过官方指南确认运行时间和使用条件。|Hiện chúng tôi bắt đầu với các dịch vụ đã đối chiếu thông tin chính thức của 노원구. Hãy xem hướng dẫn chính thức để kiểm tra lịch hoạt động và điều kiện sử dụng.|現在は노원구の公式案内を確認したサービスから掲載しています。運営日程と利用条件は公式案内でご確認ください。
신청할 수 있는 지원사업도 궁금하세요?|Looking for support programs you can apply for?|还想了解可以申请的支援项目吗？|Bạn cũng muốn tìm chương trình hỗ trợ có thể đăng ký?|申請できる支援事業も探しますか？
이 지역명이 언급된 공고를 찾아보세요. 공고별 거주 요건은 따로 확인할 수 있어요.|Find notices that mention this area. Check the residency requirements in each notice.|查找提及此区域名称的公告。各公告的居住条件需分别确认。|Tìm thông báo có nhắc đến khu vực này. Kiểm tra điều kiện cư trú trong từng thông báo.|この地域名が含まれる公示を探しましょう。居住要件は各公示で確認できます。
지역 관련 공고 찾기|Find notices about this area|查找地区相关公告|Tìm thông báo liên quan đến khu vực|地域に関する公示を探す
이동·교통|Mobility and transport|出行与交通|Đi lại và giao thông|移動・交通
건강|Health|健康|Sức khỏe|健康
돌봄·생활|Care and daily living|照护与生活|Chăm sóc và đời sống|ケア・生活
문화·시설|Culture and facilities|文化与设施|Văn hóa và cơ sở|文化・施設
이용 지역|Service area|服务区域|Khu vực phục vụ|利用地域
이용 대상|Who can use it|服务对象|Đối tượng sử dụng|利用対象
이용 요금|Cost|使用费用|Phí sử dụng|利用料金
안내 확인 {date}|Information checked {date}|信息核对日期：{date}|Thông tin được kiểm tra ngày {date}|案内確認日 {date}
{title} 공식 안내 (새 창)|Official information for {title} (new window)|{title}官方指南（新窗口）|Hướng dẫn chính thức về {title} (cửa sổ mới)|{title}の公式案内（新しいウィンドウ）
공식 안내 보기|View official information|查看官方指南|Xem hướng dẫn chính thức|公式案内を見る
시·도와 시·군·구를 함께 입력해 주세요. 예: 서울 노원구|Enter both the province or metropolitan city and the city, county, or district, e.g. 서울 노원구.|请同时输入省或广域市及市、郡、区。例如：서울 노원구|Nhập tỉnh hoặc thành phố trực thuộc trung ương cùng thành phố, huyện hoặc quận. Ví dụ: 서울 노원구|市・道と市・郡・区を一緒に入力してください。例：서울 노원구
`;

export const localMessages = Object.freeze(
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
