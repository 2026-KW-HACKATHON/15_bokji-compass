// The first column is the unchanged Korean UI source; other columns are en, zh, vi, ja.
const rows = String.raw`
인증번호를 보냈어요. | Verification code sent. | 验证码已发送。 | Đã gửi mã xác minh. | 認証コードを送信しました。
이메일 인증이 완료됐어요. | Email verification is complete. | 邮箱验证已完成。 | Đã hoàn tất xác minh email. | メール認証が完了しました。
회원가입이 완료됐어요. 로그인해 주세요. | Sign-up is complete. Please log in. | 注册已完成，请登录。 | Đã đăng ký thành công. Vui lòng đăng nhập. | 登録が完了しました。ログインしてください。
회원가입이 완료됐어요. | Sign-up is complete. | 注册已完成。 | Đã đăng ký thành công. | 登録が完了しました。
로그아웃했어요. | You have logged out. | 已退出登录。 | Đã đăng xuất. | ログアウトしました。
인증 메일 발송 설정이 필요해요. | Verification email is not configured yet. | 验证邮件发送功能尚未配置。 | Chưa thiết lập gửi email xác minh. | 認証メールの送信設定が必要です。
인증번호를 확인해 주세요. | Check the verification code. | 请确认验证码。 | Kiểm tra mã xác minh. | 認証コードを確認してください。
이메일 인증이 만료됐어요. 다시 인증해 주세요. | Email verification expired. Please verify again. | 邮箱验证已过期，请重新验证。 | Xác minh email đã hết hạn. Vui lòng xác minh lại. | メール認証の有効期限が切れました。再認証してください。
카카오 인증이 만료됐어요. 다시 로그인해 주세요. | Kakao verification expired. Please log in again. | Kakao验证已过期，请重新登录。 | Xác minh Kakao đã hết hạn. Vui lòng đăng nhập lại. | Kakao認証の有効期限が切れました。再度ログインしてください。
{label} 추가 | Add {label} | 添加{label} | Thêm {label} | {label}を追加
{label} 수정 | Edit {label} | 修改{label} | Sửa {label} | {label}を編集
탈퇴 결과를 확인하지 못했어요. 다시 확인해 주세요. | We could not confirm your account deletion. Please try again. | 无法确认账号注销结果，请重试。 | Không thể xác nhận việc xóa tài khoản. Vui lòng thử lại. | 退会結果を確認できませんでした。もう一度ご確認ください。
탈퇴 전에 삭제할 정보를 확인해 주세요 | Review the information that will be deleted | 注销前请确认将删除的信息 | Xem lại thông tin sẽ bị xóa trước khi rời dịch vụ | 退会前に削除される情報をご確認ください
이 브라우저에 기억한 추천 설정과 저장한 공고도 지웁니다. | Recommendation preferences and notices saved in this browser will also be removed. | 此浏览器中记住的推荐设置和已收藏公告也会被删除。 | Các tùy chọn gợi ý và thông báo đã lưu trong trình duyệt này cũng sẽ bị xóa. | このブラウザーに記憶したおすすめ設定と保存したお知らせも削除します。
최신 삭제 안내를 확인하고 있어요… | Checking the latest deletion notice… | 正在确认最新删除说明… | Đang kiểm tra hướng dẫn xóa mới nhất… | 最新の削除案内を確認しています…
안내 다시 불러오기 | Reload notice | 重新加载说明 | Tải lại hướng dẫn | 案内を再読み込み
삭제되는 정보를 확인했고 회원 탈퇴에 동의합니다. | I have reviewed the information to be deleted and agree to close my account. | 我已确认将删除的信息，并同意注销账号。 | Tôi đã xem thông tin sẽ bị xóa và đồng ý đóng tài khoản. | 削除される情報を確認し、退会に同意します。
개인정보 삭제 중… | Deleting personal information… | 正在删除个人信息… | Đang xóa thông tin cá nhân… | 個人情報を削除しています…
탈퇴하고 개인정보 삭제 | Close account and delete personal information | 注销账号并删除个人信息 | Đóng tài khoản và xóa thông tin cá nhân | 退会して個人情報を削除
취소 | Cancel | 取消 | Hủy | キャンセル
회원 탈퇴 | Close account | 注销账号 | Đóng tài khoản | 退会
탈퇴하면 저장한 개인정보를 즉시 삭제합니다. | Your stored personal information is deleted immediately when you close your account. | 注销账号后，已保存的个人信息将立即删除。 | Thông tin cá nhân đã lưu sẽ bị xóa ngay khi bạn đóng tài khoản. | 退会すると、保存された個人情報を直ちに削除します。
홈으로 돌아가기 | Back to home | 返回首页 | Về trang chủ | ホームに戻る
복지나침반 | Welfare Compass | 福利指南针 | La bàn Phúc lợi | 福祉コンパス
나를 위한 복지, | Welfare for you, | 适合您的福利， | Phúc lợi dành cho bạn, | あなたのための福祉を、
조금 더 가까이. | a little closer. | 更近一步。 | gần hơn một chút. | もっと身近に。
필요한 공고를 찾는 길에 함께할게요. | We will help you find the notices you need. | 我们陪您寻找所需的公告。 | Chúng tôi giúp bạn tìm thông báo phù hợp. | 必要なお知らせを探すお手伝いをします。
계정 메뉴 | Account menu | 账号菜单 | Menu tài khoản | アカウントメニュー
로그인 | Log in | 登录 | Đăng nhập | ログイン
회원가입 | Sign up | 注册 | Đăng ký | 新規登録
아이디는 영문, 숫자, 밑줄(_)을 사용해 4~20자로 입력해 주세요. | Use 4–20 letters, numbers, or underscores (_) for your username. | 用户名须为4至20位英文字母、数字或下划线（_）。 | Tên đăng nhập gồm 4–20 chữ cái Latin, chữ số hoặc dấu gạch dưới (_). | ユーザーIDは英字・数字・下線（_）を使い、4〜20文字で入力してください。
비밀번호를 8자 이상 입력해 주세요. | Enter a password with at least 8 characters. | 请输入至少8位的密码。 | Nhập mật khẩu có ít nhất 8 ký tự. | パスワードは8文字以上で入力してください。
아이디와 비밀번호를 입력해 주세요. | Enter your username and password. | 请输入用户名和密码。 | Nhập tên đăng nhập và mật khẩu. | ユーザーIDとパスワードを入力してください。
반가워요. 편한 방법으로 로그인해 주세요. | Welcome. Choose a convenient way to log in. | 欢迎，请选择方便的方式登录。 | Chào bạn. Chọn cách đăng nhập thuận tiện. | ようこそ。お好きな方法でログインしてください。
또는 | or | 或 | hoặc | または
아이디로 로그인 | Log in with username | 使用用户名登录 | Đăng nhập bằng tên đăng nhập | ユーザーIDでログイン
로그인 정보 | Login details | 登录信息 | Thông tin đăng nhập | ログイン情報
로그인하는 중입니다… | Logging in… | 正在登录… | Đang đăng nhập… | ログインしています…
아이디 | Username | 用户名 | Tên đăng nhập | ユーザーID
가입한 아이디 | Your registered username | 注册的用户名 | Tên đăng nhập đã đăng ký | 登録したユーザーID
비밀번호 | Password | 密码 | Mật khẩu | パスワード
로그인 중… | Logging in… | 正在登录… | Đang đăng nhập… | ログイン中…
카카오로도 로그인할 수 있어요. | You can also log in with Kakao. | 您也可以使用Kakao登录。 | Bạn cũng có thể đăng nhập bằng Kakao. | Kakaoでもログインできます。
처음 방문하셨나요? | New here? | 首次访问？ | Lần đầu sử dụng? | 初めてご利用ですか？
카카오 로그인을 취소했어요. 다시 시도할 수 있어요. | Kakao login was cancelled. You can try again. | 已取消Kakao登录，您可以重试。 | Đã hủy đăng nhập Kakao. Bạn có thể thử lại. | Kakaoログインをキャンセルしました。再試行できます。
로그인 요청이 만료됐어요. 카카오 로그인을 다시 눌러 주세요. | The login request expired. Select Kakao login again. | 登录请求已过期，请再次点击Kakao登录。 | Yêu cầu đăng nhập đã hết hạn. Hãy chọn đăng nhập Kakao lần nữa. | ログイン要求の有効期限が切れました。Kakaoログインをもう一度押してください。
카카오 로그인에 연결하지 못했어요. 다시 시도해 주세요. | Could not connect to Kakao login. Please try again. | 无法连接Kakao登录，请重试。 | Không thể kết nối đăng nhập Kakao. Vui lòng thử lại. | Kakaoログインに接続できませんでした。再試行してください。
카카오 로그인 | Log in with Kakao | Kakao登录 | Đăng nhập bằng Kakao | Kakaoでログイン
카카오 로그인 주소를 확인하지 못했어요. | Could not verify the Kakao login address. | 无法验证Kakao登录地址。 | Không thể xác minh địa chỉ đăng nhập Kakao. | Kakaoのログイン先を確認できませんでした。
카카오로 이동 중… | Opening Kakao… | 正在跳转至Kakao… | Đang mở Kakao… | Kakaoに移動しています…
로그인 방법을 확인하고 있어요… | Checking login options… | 正在确认登录方式… | Đang kiểm tra cách đăng nhập… | ログイン方法を確認しています…
카카오 로그인을 준비 중이에요. 아이디로 가입하거나 로그인할 수 있어요. | Kakao login is being prepared. You can sign up or log in with a username. | Kakao登录正在准备中，您可以使用用户名注册或登录。 | Đăng nhập Kakao đang được chuẩn bị. Bạn có thể đăng ký hoặc đăng nhập bằng tên đăng nhập. | Kakaoログインは準備中です。ユーザーIDで登録・ログインできます。
개인정보 안내를 확인하고 필수 동의 항목을 선택해 주세요. | Review the privacy notice and select the required consent. | 请阅读个人信息说明并勾选必需的同意项。 | Xem thông báo quyền riêng tư và chọn mục đồng ý bắt buộc. | 個人情報の案内を確認し、必須の同意項目を選択してください。
카카오로 가입하기 | Sign up with Kakao | 使用Kakao注册 | Đăng ký bằng Kakao | Kakaoで登録
이메일을 입력하면 가입을 마칠 수 있어요. | Enter your email to finish signing up. | 输入邮箱即可完成注册。 | Nhập email để hoàn tất đăng ký. | メールアドレスを入力して登録を完了できます。
카카오 인증이 완료됐어요. | Kakao verification is complete. | Kakao验证已完成。 | Đã xác minh Kakao. | Kakao認証が完了しました。
{name}님의 카카오 인증이 완료됐어요. | Kakao verification is complete for {name}. | {name}的Kakao验证已完成。 | Đã xác minh Kakao cho {name}. | {name}さんのKakao認証が完了しました。
카카오 인증을 확인하고 있어요… | Checking Kakao verification… | 正在确认Kakao验证… | Đang kiểm tra xác minh Kakao… | Kakao認証を確認しています…
동의하고 가입 계속하기 | Agree and continue signing up | 同意并继续注册 | Đồng ý và tiếp tục đăng ký | 同意して登録を続ける
맞춤 안내를 위한 나이와 지역은 가입 후 선택할 수 있어요. | You can optionally add your age and region after signing up for personalized guidance. | 注册后可选择填写年龄和地区，以获取个性化指南。 | Bạn có thể chọn nhập tuổi và khu vực sau khi đăng ký để nhận hướng dẫn phù hợp. | 登録後に、個別の案内に使う年齢や地域を任意で設定できます。
맞춤 정보를 입력하지 않고 가입할 수 있어요. | You can sign up without entering personalization details. | 无需填写个性化信息也可注册。 | Bạn có thể đăng ký mà không nhập thông tin cá nhân hóa. | 個別の案内用の情報を入力せずに登録できます。
카카오 회원가입 정보 | Kakao sign-up details | Kakao注册信息 | Thông tin đăng ký Kakao | Kakao登録情報
이메일 | Email | 邮箱 | Email | メールアドレス
가입하는 중… | Signing up… | 正在注册… | Đang đăng ký… | 登録しています…
가입하고 시작하기 | Sign up and get started | 注册并开始使用 | Đăng ký và bắt đầu | 登録して始める
돌아가는 중… | Going back… | 正在返回… | Đang quay lại… | 戻っています…
가입 방법 다시 선택 | Choose sign-up method again | 重新选择注册方式 | Chọn lại cách đăng ký | 登録方法を選び直す
개인정보 안내와 동의 다시 확인 | Review privacy notice and consent | 重新查看个人信息说明和同意项 | Xem lại thông báo quyền riêng tư và lựa chọn đồng ý | 個人情報の案内と同意を再確認
회원 거주 주소 (선택) | Residential address (optional) | 居住地址（选填） | Địa chỉ cư trú (không bắt buộc) | 住所（任意）
거주 주소 검색 | Search residential address | 搜索居住地址 | Tìm địa chỉ cư trú | 住所を検索
우편번호 | Postal code | 邮政编码 | Mã bưu chính | 郵便番号
주소 검색 | Search address | 搜索地址 | Tìm địa chỉ | 住所検索
주소 검색 닫기 | Close address search | 关闭地址搜索 | Đóng tìm địa chỉ | 住所検索を閉じる
주소 검색을 불러오고 있어요… | Loading address search… | 正在加载地址搜索… | Đang tải tìm địa chỉ… | 住所検索を読み込んでいます…
기본 주소 | Street address | 基本地址 | Địa chỉ cơ bản | 基本住所
주소 검색에서 도로명 또는 지번 주소를 선택해 주세요 | Select a street or lot-number address from the address search | 请在地址搜索中选择道路名或地号地址 | Chọn địa chỉ theo tên đường hoặc số lô đất trong tìm địa chỉ | 住所検索で道路名または地番の住所を選択してください
상세 주소 | Address details | 详细地址 | Địa chỉ chi tiết | 詳細住所
동·호수 등 상세 주소 | Building, unit, or other address details | 楼栋、房号等详细地址 | Tòa nhà, số phòng hoặc chi tiết địa chỉ khác | 棟・部屋番号など
도로명·건물명·지번으로 검색한 뒤 상세 주소를 입력해 주세요. | Search by street, building, or lot number, then enter address details. | 按道路名、建筑名或地号搜索后，填写详细地址。 | Tìm theo tên đường, tòa nhà hoặc số lô đất, rồi nhập địa chỉ chi tiết. | 道路名・建物名・地番で検索してから詳細住所を入力してください。
주소 검색은 카카오 우편번호 서비스를 이용해요. 상세 주소는 회원 정보에 저장돼요. | Address search uses Kakao's postal-code service. Address details are saved in your account. | 地址搜索使用Kakao邮政编码服务。详细地址保存在会员信息中。 | Tìm địa chỉ sử dụng dịch vụ mã bưu chính Kakao. Địa chỉ chi tiết được lưu trong tài khoản. | 住所検索にはKakaoの郵便番号サービスを使います。詳細住所は会員情報に保存されます。
거주 지역 · {region}. 주소에서 확인한 지역을 복지 안내에 참고해요. | Region · {region}. We use the region identified from your address for welfare guidance. | 居住地区 · {region}。福利指南会参考地址中确认的地区。 | Khu vực · {region}. Chúng tôi tham khảo khu vực từ địa chỉ để hướng dẫn phúc lợi. | 居住地域 · {region}。住所から確認した地域を福祉の案内に参考として使います。
기존 거주 지역 · {region}. 주소 검색으로 정확한 주소를 추가할 수 있어요. | Existing region · {region}. Add your exact address using address search. | 现有居住地区 · {region}。可通过地址搜索添加准确地址。 | Khu vực hiện tại · {region}. Bạn có thể thêm địa chỉ chính xác bằng tìm địa chỉ. | 現在の居住地域 · {region}。住所検索で正確な住所を追加できます。
주소 지우기 | Clear address | 清除地址 | Xóa địa chỉ | 住所を消去
주소 검색에서 거주 주소를 선택해 주세요. | Select your residential address from the address search. | 请在地址搜索中选择居住地址。 | Chọn địa chỉ cư trú trong tìm địa chỉ. | 住所検索で住所を選択してください。
회원 정보를 저장했어요. | Your account details were saved. | 会员信息已保存。 | Đã lưu thông tin tài khoản. | 会員情報を保存しました。
맞춤 정보 설정 | Personalization settings | 个性化信息设置 | Thiết lập thông tin cá nhân hóa | 個別の案内用情報の設定
회원 정보 수정 | Edit account details | 修改会员信息 | Sửa thông tin tài khoản | 会員情報の編集
맞춤 복지 정보를 설정할까요? | Set up personalized welfare guidance? | 要设置个性化福利指南吗？ | Thiết lập hướng dẫn phúc lợi phù hợp? | あなたに合う福祉の案内を設定しますか？
나이와 거주 주소를 알려주세요. 주소에서 확인한 지역을 복지 안내에 참고해요. 모두 선택 사항이에요. | You may provide your age and address. We use the region from your address for welfare guidance. All fields are optional. | 可填写年龄和居住地址。福利指南会参考地址中的地区。所有项目均为选填。 | Bạn có thể cung cấp tuổi và địa chỉ. Khu vực từ địa chỉ được dùng để hướng dẫn phúc lợi. Tất cả đều không bắt buộc. | 年齢と住所をご入力ください。住所から確認した地域を福祉の案内に参考として使います。すべて任意です。
모두 선택 사항이에요. 주소 검색으로 거주 주소를 입력할 수 있고, 비워 두면 기본 안내를 제공해요. | All fields are optional. Add your address using address search, or leave it blank for general guidance. | 所有项目均为选填。可通过搜索填写居住地址，留空则提供一般指南。 | Tất cả đều không bắt buộc. Bạn có thể tìm địa chỉ cư trú hoặc để trống để nhận hướng dẫn chung. | すべて任意です。住所検索で住所を入力できます。空欄の場合は一般的な案内を表示します。
카카오 계정 | Kakao account | Kakao账号 | Tài khoản Kakao | Kakaoアカウント
가입한 아이디는 변경할 수 없어요. | Your registered username cannot be changed. | 注册的用户名无法更改。 | Không thể thay đổi tên đăng nhập đã đăng ký. | 登録したユーザーIDは変更できません。
카카오로 가입한 계정이에요. | This account was created with Kakao. | 此账号通过Kakao注册。 | Tài khoản này được đăng ký bằng Kakao. | Kakaoで登録したアカウントです。
등록된 이메일 없음 | No email registered | 未登记邮箱 | Chưa đăng ký email | メールアドレス未登録
인증한 이메일이에요. | This email is verified. | 此邮箱已验证。 | Email này đã được xác minh. | 認証済みのメールアドレスです。
가입 시 입력한 이메일이에요. | This is the email you entered when signing up. | 这是注册时填写的邮箱。 | Đây là email bạn nhập khi đăng ký. | 登録時に入力したメールアドレスです。
이름 | Name | 姓名 | Tên | 名前
화면에 표시할 이름이에요. 실명을 입력하지 않아도 돼요. | This is your display name. You do not need to use your real name. | 这是显示名称，无需使用真实姓名。 | Đây là tên hiển thị. Bạn không cần dùng tên thật. | 画面に表示する名前です。本名でなくてもかまいません。
나이 (만 나이) | Age (completed years) | 年龄（周岁） | Tuổi (đủ năm) | 年齢（満年齢）
연령 조건이 있는 복지 정보를 안내할 때 참고해요. | Used as a reference for welfare programs with age requirements. | 用于参考有年龄条件的福利信息。 | Dùng để tham khảo khi hướng dẫn chương trình phúc lợi có điều kiện tuổi. | 年齢条件のある福祉の案内に参考として使います。
성별 | Gender | 性别 | Giới tính | 性別
원하지 않으면 ‘응답하지 않음’을 선택할 수 있어요. | You can choose “Prefer not to say.” | 您可以选择“不愿透露”。 | Bạn có thể chọn “Không muốn trả lời”. | 希望しない場合は「回答しない」を選べます。
거주 주소 (선택) | Residential address (optional) | 居住地址（选填） | Địa chỉ cư trú (không bắt buộc) | 住所（任意）
저장 중… | Saving… | 正在保存… | Đang lưu… | 保存中…
저장하고 시작하기 | Save and get started | 保存并开始使用 | Lưu và bắt đầu | 保存して始める
회원 정보 저장 | Save account details | 保存会员信息 | Lưu thông tin tài khoản | 会員情報を保存
나중에 하기 | Do this later | 稍后设置 | Để sau | 後で設定
숨기기 | Hide | 隐藏 | Ẩn | 非表示
보기 | Show | 显示 | Hiện | 表示
{label} 숨기기 | Hide {label} | 隐藏{label} | Ẩn {label} | {label}を非表示
{label} 보기 | Show {label} | 显示{label} | Hiện {label} | {label}を表示
가입 방법을 선택해 주세요 | Choose how to sign up | 请选择注册方式 | Chọn cách đăng ký | 登録方法を選択してください
사용할 아이디를 정해 주세요 | Choose a username | 请设置用户名 | Chọn tên đăng nhập | ユーザーIDを決めてください
비밀번호를 만들어 주세요 | Create a password | 请设置密码 | Tạo mật khẩu | パスワードを作成してください
비밀번호를 한 번 더 입력해 주세요 | Enter your password again | 请再次输入密码 | Nhập lại mật khẩu | パスワードをもう一度入力してください
이메일을 인증해 주세요 | Verify your email | 请验证邮箱 | Xác minh email | メールアドレスを認証してください
이름을 알려주세요 | Enter your name | 请填写姓名 | Nhập tên của bạn | 名前を入力してください
만 나이를 알려주세요 | Enter your age in completed years | 请填写周岁年龄 | Nhập tuổi đủ năm | 満年齢を入力してください
성별을 선택해 주세요 | Select your gender | 请选择性别 | Chọn giới tính | 性別を選択してください
거주 주소를 입력해 주세요 | Enter your residential address | 请填写居住地址 | Nhập địa chỉ cư trú | 住所を入力してください
가입 정보를 확인해 주세요 | Review your sign-up details | 请确认注册信息 | Kiểm tra thông tin đăng ký | 登録情報をご確認ください
이메일 인증 | Email verification | 邮箱验证 | Xác minh email | メール認証
기본 정보 | Basic details | 基本信息 | Thông tin cơ bản | 基本情報
가입 확인 | Review sign-up | 确认注册 | Kiểm tra đăng ký | 登録確認
이메일 인증을 완료해 주세요. | Complete email verification. | 请完成邮箱验证。 | Hoàn tất xác minh email. | メール認証を完了してください。
비밀번호는 영문과 숫자를 포함해 8~128자로 입력해 주세요. | Use 8–128 characters including letters and numbers for your password. | 密码须为8至128位，并包含英文字母和数字。 | Mật khẩu gồm 8–128 ký tự, có chữ cái Latin và chữ số. | パスワードは英字と数字を含めて8〜128文字で入力してください。
비밀번호가 일치하지 않습니다. 다시 입력해 주세요. | Passwords do not match. Please enter them again. | 两次密码不一致，请重新输入。 | Mật khẩu không khớp. Vui lòng nhập lại. | パスワードが一致しません。もう一度入力してください。
요청이 취소됐습니다. | The request was cancelled. | 请求已取消。 | Yêu cầu đã bị hủy. | リクエストをキャンセルしました。
이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요. | This username is already taken. Choose another one. | 此用户名已被使用，请填写其他用户名。 | Tên đăng nhập đã được sử dụng. Hãy chọn tên khác. | このユーザーIDは使用中です。別のIDを入力してください。
사용할 수 있는 아이디예요. 다음으로 진행해 주세요. | This username is available. Continue to the next step. | 此用户名可用，请进入下一步。 | Tên đăng nhập có thể sử dụng. Hãy sang bước tiếp theo. | 使用できるユーザーIDです。次に進んでください。
6자리 인증번호를 입력해 주세요. | Enter the 6-digit verification code. | 请输入6位验证码。 | Nhập mã xác minh 6 chữ số. | 6桁の認証コードを入力してください。
아이디 중복확인을 해주세요. | Check username availability first. | 请先检查用户名是否可用。 | Kiểm tra tên đăng nhập có thể sử dụng trước. | ユーザーIDの重複確認をしてください。
다음 | Next | 下一步 | Tiếp | 次へ
카카오톡으로 로그인/회원가입하기 | Log in / sign up with KakaoTalk | 使用KakaoTalk登录／注册 | Đăng nhập / đăng ký bằng KakaoTalk | KakaoTalkでログイン・登録
개인정보 안내를 확인한 뒤 가입을 시작해요. | Review the privacy notice before signing up. | 请先阅读个人信息说明再开始注册。 | Xem thông báo quyền riêng tư trước khi đăng ký. | 個人情報の案内を確認してから登録を始めます。
로그인하러 가기 | Go to login | 前往登录 | Đến trang đăng nhập | ログインへ
회원가입 정보 | Sign-up details | 注册信息 | Thông tin đăng ký | 登録情報
회원가입 단계 | Sign-up steps | 注册步骤 | Các bước đăng ký | 登録の手順
단계 | step | 步 | bước | ステップ
{current} / {total}단계 | Step {current} of {total} | 第{current}步，共{total}步 | Bước {current} / {total} | {total}段階中{current}段階
회원가입 진행 | Sign-up progress | 注册进度 | Tiến độ đăng ký | 登録の進捗
아이디를 확인하는 중입니다… | Checking username… | 正在检查用户名… | Đang kiểm tra tên đăng nhập… | ユーザーIDを確認しています…
인증번호를 보내는 중입니다… | Sending verification code… | 正在发送验证码… | Đang gửi mã xác minh… | 認証コードを送信しています…
인증번호를 확인하는 중입니다… | Checking verification code… | 正在检查验证码… | Đang kiểm tra mã xác minh… | 認証コードを確認しています…
가입하는 중입니다… | Signing up… | 正在注册… | Đang đăng ký… | 登録しています…
아이디로 회원가입 | Sign up with username | 使用用户名注册 | Đăng ký bằng tên đăng nhập | ユーザーIDで登録
아이디와 기본 정보를 입력해요 | Enter a username and basic details | 填写用户名和基本信息 | Nhập tên đăng nhập và thông tin cơ bản | ユーザーIDと基本情報を入力します
영문, 숫자, 밑줄(_) 4~20자. 대소문자는 구분하지 않습니다. | 4–20 letters, numbers, or underscores (_). Case is ignored. | 4至20位英文字母、数字或下划线（_），不区分大小写。 | 4–20 chữ cái Latin, chữ số hoặc dấu gạch dưới (_). Không phân biệt hoa thường. | 英字・数字・下線（_）で4〜20文字。大文字・小文字は区別しません。
중복확인 완료 | Availability checked | 已检查可用性 | Đã kiểm tra tên đăng nhập | 重複確認済み
중복확인 | Check availability | 检查可用性 | Kiểm tra tên đăng nhập | 重複確認
비밀번호 확인 | Confirm password | 确认密码 | Xác nhận mật khẩu | パスワード確認
영문과 숫자를 포함해 8~128자로 입력해 주세요. | Use 8–128 characters including letters and numbers. | 请输入8至128位，包含英文字母和数字。 | Nhập 8–128 ký tự, gồm chữ cái Latin và chữ số. | 英字と数字を含めて8〜128文字で入力してください。
앞에서 입력한 비밀번호와 똑같이 입력해 주세요. | Enter the same password as before. | 请再次输入相同的密码。 | Nhập mật khẩu giống như trước. | 前に入力したパスワードと同じものを入力してください。
실명을 입력하지 않아도 돼요. 표시할 이름만 알려주세요. | You do not need your real name. Enter a display name. | 无需填写真实姓名，只需填写显示名称。 | Không cần dùng tên thật. Chỉ nhập tên hiển thị. | 本名でなくてもかまいません。表示する名前を入力してください。
이메일 인증 완료 | Email verified | 邮箱已验证 | Đã xác minh email | メール認証済み
재발송까지 {seconds}초 | Resend in {seconds}s | {seconds}秒后可重发 | Gửi lại sau {seconds} giây | 再送信まで{seconds}秒
인증번호 다시 발송 | Resend verification code | 重新发送验证码 | Gửi lại mã xác minh | 認証コードを再送信
인증번호 발송 | Send verification code | 发送验证码 | Gửi mã xác minh | 認証コードを送信
이메일 인증번호 | Email verification code | 邮箱验证码 | Mã xác minh email | メール認証コード
메일로 받은 6자리 번호를 10분 안에 입력해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요. | Enter the 6-digit code from your email within 10 minutes. Check your spam folder if you cannot find it. | 请在10分钟内输入邮件中的6位验证码。如未收到邮件，请查看垃圾邮件。 | Nhập mã 6 chữ số trong email trong vòng 10 phút. Kiểm tra thư rác nếu không thấy email. | メールで届いた6桁のコードを10分以内に入力してください。届かない場合は迷惑メールも確認してください。
인증번호 확인 | Verify code | 验证验证码 | Xác minh mã | 認証コードを確認
인증 시간이 만료됐어요. 인증번호를 다시 발송해 주세요. | The code expired. Please send a new verification code. | 验证已过期，请重新发送验证码。 | Mã đã hết hạn. Vui lòng gửi lại mã xác minh. | 認証の有効期限が切れました。コードを再送信してください。
이메일 인증이 완료됐어요. 다음 단계로 진행해 주세요. | Your email is verified. Continue to the next step. | 邮箱验证已完成，请进入下一步。 | Đã xác minh email. Hãy sang bước tiếp theo. | メール認証が完了しました。次に進んでください。
만 나이를 0~120 사이의 숫자로 입력해 주세요. | Enter your age in completed years, from 0 to 120. | 请输入0至120之间的周岁年龄。 | Nhập tuổi đủ năm từ 0 đến 120. | 満年齢を0〜120の数字で入力してください。
선택해 주세요 | Please select | 请选择 | Vui lòng chọn | 選択してください
입력하지 않음 | Not provided | 未填写 | Chưa nhập | 未入力
만 나이 | Age (completed years) | 周岁年龄 | Tuổi đủ năm | 満年齢
{age}세 | Age {age} | {age}岁 | {age} tuổi | {age}歳
응답하지 않음 | Prefer not to say | 不愿透露 | Không muốn trả lời | 回答しない
거주 주소 | Residential address | 居住地址 | Địa chỉ cư trú | 住所
수정할 내용이 있으면 이전 단계로 돌아가 주세요. | Go back to an earlier step if you need to make changes. | 如需修改，请返回上一步。 | Quay lại bước trước nếu cần sửa. | 修正する場合は前の手順に戻ってください。
개인정보 수집·이용 동의를 확인했어요. 맞춤 정보: | Privacy consent reviewed. Personalization: | 已确认个人信息收集与使用同意。个性化信息： | Đã kiểm tra đồng ý thu thập và sử dụng thông tin cá nhân. Cá nhân hóa: | 個人情報の収集・利用への同意を確認しました。個別の案内用情報：
동의 | Agreed | 同意 | Đồng ý | 同意
동의하지 않음 | Not agreed | 不同意 | Không đồng ý | 同意しない
· 외부 AI 처리: | · External AI processing: | · 外部AI处理： | · Xử lý AI bên ngoài: | · 外部AI処理：
이전 | Back | 上一步 | Quay lại | 戻る
건너뛰기 | Skip | 跳过 | Bỏ qua | スキップ
처리 중… | Processing… | 正在处理… | Đang xử lý… | 処理中…
이미 가입하셨나요? | Already have an account? | 已有账号？ | Đã có tài khoản? | 登録済みですか？
남성 | Male | 男性 | Nam | 男性
여성 | Female | 女性 | Nữ | 女性
기타 | Other | 其他 | Khác | その他
올바른 이메일 주소를 입력해 주세요. | Enter a valid email address. | 请输入有效的邮箱地址。 | Nhập địa chỉ email hợp lệ. | 有効なメールアドレスを入力してください。
이름을 1~50자로 입력해 주세요. | Enter a name with 1–50 characters. | 姓名须为1至50个字符。 | Nhập tên từ 1–50 ký tự. | 名前は1〜50文字で入力してください。
성별을 선택해 주세요. 원하지 않으면 ‘응답하지 않음’을 선택할 수 있습니다. | Select your gender, or choose “Prefer not to say.” | 请选择性别，也可选择“不愿透露”。 | Chọn giới tính hoặc “Không muốn trả lời”. | 性別を選択してください。希望しない場合は「回答しない」を選べます。
허용되지 않은 요청입니다. | This request is not allowed. | 此请求不被允许。 | Yêu cầu này không được phép. | このリクエストは許可されていません。
요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요. | Could not process the request. Please try again shortly. | 无法处理请求，请稍后重试。 | Không thể xử lý yêu cầu. Vui lòng thử lại sau. | リクエストを処理できませんでした。しばらくしてから再試行してください。
연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요. | Connection failed. Please try again shortly. | 连接不畅，请稍后重试。 | Kết nối không ổn định. Vui lòng thử lại sau. | 接続が不安定です。しばらくしてから再試行してください。
주소는 줄바꿈 없이 200자 이내로 입력해 주세요. | Enter the address within 200 characters without line breaks. | 地址请在200个字符以内输入，不要换行。 | Nhập địa chỉ tối đa 200 ký tự, không xuống dòng. | 住所は改行せず200文字以内で入力してください。
선택한 주소의 지역을 확인하지 못했어요. 다른 주소를 선택해 주세요. | Could not identify the region of this address. Choose another address. | 无法确认所选地址的地区，请选择其他地址。 | Không xác định được khu vực của địa chỉ. Hãy chọn địa chỉ khác. | 選択した住所の地域を確認できませんでした。別の住所を選択してください。
주소 검색을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. | Could not load address search. Check your internet connection and try again. | 无法加载地址搜索，请检查网络连接后重试。 | Không thể tải tìm địa chỉ. Kiểm tra kết nối internet và thử lại. | 住所検索を読み込めませんでした。インターネット接続を確認して再試行してください。
`
  .trim()
  .split("\n")
  .map((row) => row.split(" | "));

const profileRows = String.raw`
선택 항목은 건너뛰어도 괜찮아요. 나중에 수정할 수 있어요. | You can skip optional fields and edit them later. | 可跳过选填项目，稍后再修改。 | Bạn có thể bỏ qua mục không bắt buộc và sửa sau. | 任意の項目は飛ばして、後で修正できます。
입력할 수 있는 항목만 선택해 주세요. 입력한 정보는 언제든 수정할 수 있어요. | Fill in only the fields you can. You can edit your details at any time. | 只需选择可以填写的项目，信息随时可修改。 | Chỉ nhập những mục bạn có thể. Bạn có thể sửa thông tin bất cứ lúc nào. | 入力できる項目だけ選んでください。いつでも修正できます。
지역과 연령 | Region and age | 地区和年龄 | Khu vực và tuổi | 地域と年齢
거주 지역 | Residential region | 居住地区 | Khu vực cư trú | 居住地域
연령대 (선택) | Age group (optional) | 年龄段（选填） | Nhóm tuổi (không bắt buộc) | 年齢層（任意）
생활 정보 | Life details | 生活信息 | Thông tin sinh hoạt | 生活情報
선택 | Optional | 可选 | Không bắt buộc | 任意
일·학업 상태 (선택) | Work / study status (optional) | 工作／学习状态（选填） | Tình trạng việc làm / học tập (không bắt buộc) | 仕事・学業の状況（任意）
함께 사는 사람 (선택) | Who you live with (optional) | 同住人员（选填） | Người sống cùng (không bắt buộc) | 同居する人（任意）
일·학업 상태는 공고 추천을 위한 선택 정보예요. 중위소득 기준은 가구원 수로 확인할 수 있어요. | Work / study status is optional information for recommendations. Check median-income thresholds using household size. | 工作／学习状态是推荐公告用的选填信息。可根据家庭人数查看收入中位数标准。 | Tình trạng việc làm / học tập là thông tin tùy chọn cho gợi ý. Xem mức thu nhập trung vị theo số thành viên hộ. | 仕事・学業の状況はおすすめに使う任意の情報です。世帯人数で基準中位所得を確認できます。
관심 분야 | Interests | 关注领域 | Lĩnh vực quan tâm | 関心分野
여러 개 선택할 수 있어요 | You can select more than one | 可选择多项 | Có thể chọn nhiều mục | 複数選択できます
이 브라우저에 내 정보 저장 | Save my details in this browser | 在此浏览器保存我的信息 | Lưu thông tin trong trình duyệt này | このブラウザーに情報を保存
선택하면 다음 방문에도 입력한 정보를 사용할 수 있어요. 공용 기기에서는 선택하지 마세요. | Select this to reuse your details next time. Do not select it on a shared device. | 选择后下次访问可使用这些信息。请勿在共用设备上选择。 | Chọn để sử dụng lại thông tin lần sau. Không chọn trên thiết bị dùng chung. | 選択すると次回も入力情報を使えます。共用の端末では選択しないでください。
선택하지 않으면 새로고침할 때 입력 정보가 사라져요. | If not selected, your input will be lost when you refresh. | 未选择时，刷新页面会丢失输入的信息。 | Nếu không chọn, thông tin sẽ mất khi tải lại trang. | 選択しない場合、再読み込みで入力情報が消えます。
다음 방문에도 이 정보로 추천을 요청해요. | We will request recommendations using these details on your next visit. | 下次访问也会使用这些信息请求推荐。 | Lần truy cập sau cũng sẽ yêu cầu gợi ý bằng thông tin này. | 次回もこの情報でおすすめをリクエストします。
체험 중에는 이 화면에서 입력한 정보를 서버로 보내지 않아요. | During the demo, details entered here are not sent to the server. | 体验模式不会将此页面填写的信息发送至服务器。 | Trong bản trải nghiệm, thông tin nhập ở đây không được gửi đến máy chủ. | 体験中はこの画面の入力情報をサーバーへ送信しません。
저장하면 입력한 추천 정보를 복지나침반 서버에 보내요. | Saving sends your recommendation details to the Welfare Compass server. | 保存时会将推荐信息发送至福利指南针服务器。 | Khi lưu, thông tin gợi ý được gửi đến máy chủ La bàn Phúc lợi. | 保存するとおすすめ用の情報を福祉コンパスのサーバーへ送信します。
추천받기를 누르면 입력한 정보를 복지나침반 서버에 보내요. | Selecting recommendations sends your details to the Welfare Compass server. | 点击获取推荐会将信息发送至福利指南针服务器。 | Chọn nhận gợi ý sẽ gửi thông tin đến máy chủ La bàn Phúc lợi. | おすすめを受け取ると、入力情報を福祉コンパスのサーバーへ送信します。
정보 저장 | Save details | 保存信息 | Lưu thông tin | 情報を保存
내 정보로 추천받기 | Get recommendations using my details | 根据我的信息获取推荐 | Nhận gợi ý theo thông tin của tôi | 自分の情報でおすすめを見る
전체 요약 | Overview | 总览 | Tổng quan | 全体の概要
미입력 · 추가하기 | Not provided · Add | 未填写 · 添加 | Chưa nhập · Thêm | 未入力 · 追加
미입력 | Not provided | 未填写 | Chưa nhập | 未入力
작성 중 | In progress | 填写中 | Đang nhập | 入力中
확인 중 | Checking | 确认中 | Đang kiểm tra | 確認中
확인 필요 | Needs review | 需要确认 | Cần kiểm tra | 要確認
이번 방문에 사용할 정보를 저장했어요. 브라우저 저장 설정을 변경하지 못했어요. | Details were saved for this visit. Browser storage preferences could not be changed. | 已保存本次访问使用的信息，但无法更改浏览器保存设置。 | Đã lưu thông tin cho lần truy cập này. Không thể thay đổi tùy chọn lưu của trình duyệt. | 今回使う情報を保存しました。ブラウザーの保存設定は変更できませんでした。
{category} 저장이 완료됐어요. | {category} saved. | {category}已保存。 | Đã lưu {category}. | {category}を保存しました。
회원·추천 정보 | Account and recommendation details | 会员及推荐信息 | Thông tin tài khoản và gợi ý | 会員・おすすめ用情報
내 정보 | My details | 我的信息 | Thông tin của tôi | 自分の情報
입력한 정보를 확인하고, 필요한 항목만 추가하거나 수정해요. | Review your details and add or edit only what you need. | 查看已填写的信息，只添加或修改所需项目。 | Xem thông tin và chỉ thêm hoặc sửa những mục cần thiết. | 入力情報を確認して、必要な項目だけ追加・修正できます。
내 정보 카테고리 | My details categories | 我的信息分类 | Danh mục thông tin của tôi | 自分の情報のカテゴリー
저장 전 입력이 있어요. | There are unsaved changes. | 有尚未保存的输入。 | Có thông tin chưa lưu. | 未保存の入力があります。
입력한 정보 한눈에 보기 | Your details at a glance | 一览已填写信息 | Xem nhanh thông tin đã nhập | 入力情報を一覧で確認
카테고리를 선택하면 상세 정보를 볼 수 있어요. 모든 항목은 선택 사항이에요. | Select a category for details. All fields are optional. | 选择分类查看详情，所有项目均为选填。 | Chọn danh mục để xem chi tiết. Tất cả đều không bắt buộc. | カテゴリーを選ぶと詳細を確認できます。すべて任意です。
입력됨 | Provided | 已填写 | Đã nhập | 入力済み
저장 전 | Unsaved | 未保存 | Chưa lưu | 未保存
계정에 저장된 정보를 확인하고 있어요. | Checking details saved in your account. | 正在确认账号中保存的信息。 | Đang kiểm tra thông tin đã lưu trong tài khoản. | アカウントに保存された情報を確認しています。
저장된 정보를 불러오지 못했어요. | Could not load saved details. | 无法加载已保存的信息。 | Không thể tải thông tin đã lưu. | 保存された情報を読み込めませんでした。
계산기에서 입력을 이어갈 수 있어요. | You can continue in the calculator. | 可在计算器继续填写。 | Bạn có thể tiếp tục nhập trong máy tính. | 計算機で入力を続けられます。
아직 입력한 정보가 없어요. | No details have been entered yet. | 尚未填写任何信息。 | Chưa nhập thông tin. | まだ情報が入力されていません。
정보 보기 | View details | 查看信息 | Xem thông tin | 情報を見る
추천 정보는 로그인 없이 입력할 수 있어요. 회원 정보와 소득·재산을 계정에 저장하려면 로그인해 주세요. | You can enter recommendation details without logging in. Log in to save account details, income, and assets to your account. | 无需登录即可填写推荐信息。要将会员信息及收入财产保存至账号，请登录。 | Bạn có thể nhập thông tin gợi ý mà không đăng nhập. Đăng nhập để lưu thông tin tài khoản, thu nhập và tài sản vào tài khoản. | おすすめ用の情報はログインせず入力できます。会員情報や所得・財産をアカウントに保存するにはログインしてください。
추가 | Add | 添加 | Thêm | 追加
수정 | Edit | 修改 | Sửa | 編集
{label} 입력하기 | Add {label} | 填写{label} | Nhập {label} | {label}を入力
{label} 상세 보기 | View {label} details | 查看{label}详情 | Xem chi tiết {label} | {label}の詳細を見る
입력한 소득·재산 상세 보기 | View entered income and asset details | 查看已填写的收入与财产详情 | Xem chi tiết thu nhập và tài sản đã nhập | 入力した所得・財産の詳細を見る
입력한 정보 기준이에요. 모르는 금액은 ‘확인 필요’로 표시해요. 계정 저장은 계산기에서 동의 후 진행할 수 있어요. | Based on your input. Unknown amounts are marked “Needs review.” You can save to your account in the calculator after giving consent. | 依据您填写的信息。未知金额显示为“需要确认”。可在计算器中同意后保存至账号。 | Dựa trên thông tin đã nhập. Số tiền chưa biết được đánh dấu “Cần kiểm tra”. Bạn có thể đồng ý lưu vào tài khoản trong máy tính. | 入力情報に基づきます。不明な金額は「要確認」と表示します。計算機で同意するとアカウントに保存できます。
작성 중인 정보가 있어요 | You have details in progress | 有正在填写的信息 | Có thông tin đang nhập | 入力途中の情報があります
저장된 정보를 확인하고 있어요 | Checking your saved details | 正在确认已保存的信息 | Đang kiểm tra thông tin đã lưu | 保存された情報を確認しています
저장된 정보를 확인하지 못했어요 | Could not check your saved details | 无法确认已保存的信息 | Không thể kiểm tra thông tin đã lưu | 保存された情報を確認できませんでした
소득·재산 정보를 추가해 보세요 | Add income and asset details | 添加收入与财产信息 | Thêm thông tin thu nhập và tài sản | 所得・財産の情報を追加しましょう
계산기에서 작성하던 내용을 이어서 입력할 수 있어요. | Continue the details you started in the calculator. | 可在计算器继续填写之前的内容。 | Tiếp tục nhập nội dung đang làm trong máy tính. | 計算機で入力途中の内容を続けられます。
가구원별 소득과 재산을 차례로 입력하고 계산할 수 있어요. | Enter household members' income and assets step by step, then calculate. | 可依次填写家庭成员的收入与财产并计算。 | Nhập lần lượt thu nhập và tài sản của thành viên hộ rồi tính. | 世帯員ごとの所得や財産を順番に入力して計算できます。
계산기에서 확인·수정 | Review / edit in calculator | 在计算器查看／修改 | Xem / sửa trong máy tính | 計算機で確認・編集
계산기에서 이어서 입력 | Continue in calculator | 在计算器继续填写 | Tiếp tục nhập trong máy tính | 計算機で入力を続ける
소득·재산 입력하기 | Enter income and assets | 填写收入与财产 | Nhập thu nhập và tài sản | 所得・財産を入力
기본 정보를 저장했어요. | Basic details saved. | 基本信息已保存。 | Đã lưu thông tin cơ bản. | 基本情報を保存しました。
추천에 사용할 지역·연령대 별도로 설정 | Set a separate region and age group for recommendations | 单独设置推荐使用的地区和年龄段 | Thiết lập riêng khu vực và nhóm tuổi cho gợi ý | おすすめに使う地域・年齢層を別に設定
회원 정보와 다른 기준으로 공고를 추천받고 싶을 때 설정해요. | Use this to get recommendations with criteria different from your account details. | 如需按不同于会员信息的条件推荐公告，可进行此设置。 | Thiết lập khi muốn nhận gợi ý theo tiêu chí khác thông tin tài khoản. | 会員情報とは別の条件でおすすめを受けたい場合に設定します。
아이디 · | Username · | 用户名 · | Tên đăng nhập · | ユーザーID ·
/ 회원 정보는 계정에 저장돼요. | / Account details are stored in your account. | / 会员信息保存在账号中。 | / Thông tin tài khoản được lưu trong tài khoản. | / 会員情報はアカウントに保存されます。
이 브라우저에 저장된 추천 정보예요. | These recommendation details are saved in this browser. | 这是保存在此浏览器中的推荐信息。 | Đây là thông tin gợi ý lưu trong trình duyệt này. | このブラウザーに保存されたおすすめ用の情報です。
이번 방문에 사용할 추천 정보예요. 수정할 때 브라우저 저장 여부를 선택할 수 있어요. | These recommendation details are for this visit. When editing, you can choose whether to save them in this browser. | 这是本次访问使用的推荐信息。修改时可选择是否保存在浏览器。 | Đây là thông tin gợi ý cho lần truy cập này. Khi sửa, bạn có thể chọn lưu trong trình duyệt. | 今回の訪問で使うおすすめ用の情報です。編集時にブラウザーへ保存するか選べます。
추천 설정을 지우면 회원 정보와 소득·재산은 유지돼요. | Clearing recommendation preferences keeps your account details, income, and assets. | 清除推荐设置后，会员信息及收入财产仍会保留。 | Xóa tùy chọn gợi ý vẫn giữ thông tin tài khoản, thu nhập và tài sản. | おすすめ設定を消しても会員情報や所得・財産は残ります。
맞춤 추천 설정을 지웠어요. | Personalized recommendation preferences cleared. | 个性化推荐设置已清除。 | Đã xóa tùy chọn gợi ý cá nhân hóa. | 個別のおすすめ設定を消去しました。
맞춤 추천 설정 지우기 | Clear personalized recommendation preferences | 清除个性化推荐设置 | Xóa tùy chọn gợi ý cá nhân hóa | 個別のおすすめ設定を消去
선택하지 않음 | Not selected | 未选择 | Chưa chọn | 未選択
19세 미만 | Under 19 | 19岁以下 | Dưới 19 tuổi | 19歳未満
19~34세 | Ages 19–34 | 19至34岁 | 19–34 tuổi | 19〜34歳
35~49세 | Ages 35–49 | 35至49岁 | 35–49 tuổi | 35〜49歳
50~64세 | Ages 50–64 | 50至64岁 | 50–64 tuổi | 50〜64歳
65세 이상 | Ages 65 and over | 65岁及以上 | Từ 65 tuổi | 65歳以上
학생 | Student | 学生 | Học sinh / sinh viên | 学生
취업 준비 중 | Job seeking | 求职中 | Đang tìm việc | 求職中
직장인 | Employee | 上班族 | Người làm công | 会社員
자영업자 | Self-employed | 个体经营者 | Người tự kinh doanh | 自営業
혼자 살아요 | I live alone | 独居 | Tôi sống một mình | 一人暮らし
가족과 살아요 | I live with family | 与家人同住 | Tôi sống cùng gia đình | 家族と同居
은퇴 후 | Retired | 已退休 | Đã nghỉ hưu | 退職後
올바른 사용자 정보가 필요합니다. | Valid user details are required. | 需要有效的用户信息。 | Cần thông tin người dùng hợp lệ. | 有効な利用者情報が必要です。
이름·나이·거주 지역과 주소 | Name, age, region, and address | 姓名、年龄、居住地区与地址 | Tên, tuổi, khu vực và địa chỉ | 名前・年齢・居住地域と住所
직업·가구 | Work and household | 职业与家庭 | Việc làm và hộ gia đình | 職業・世帯
일·학업 상태와 함께 사는 사람 | Work / study status and who you live with | 工作／学习状态与同住人员 | Tình trạng việc làm / học tập và người sống cùng | 仕事・学業の状況と同居する人
소득·재산 | Income and assets | 收入与财产 | Thu nhập và tài sản | 所得・財産
가구 소득과 재산·부채 | Household income, assets, and debts | 家庭收入、财产与债务 | Thu nhập, tài sản và nợ của hộ | 世帯の所得と財産・負債
관심 있는 복지 분야 | Welfare areas you are interested in | 您关注的福利领域 | Lĩnh vực phúc lợi bạn quan tâm | 関心のある福祉分野
연령대 | Age group | 年龄段 | Nhóm tuổi | 年齢層
추천에 사용할 지역 | Region used for recommendations | 推荐使用的地区 | Khu vực dùng cho gợi ý | おすすめに使う地域
추천에 사용할 연령대 | Age group used for recommendations | 推荐使用的年龄段 | Nhóm tuổi dùng cho gợi ý | おすすめに使う年齢層
일·학업 상태 | Work / study status | 工作／学习状态 | Tình trạng việc làm / học tập | 仕事・学業の状況
함께 사는 사람 | Who you live with | 同住人员 | Người sống cùng | 同居する人
일부 입력 | Partially provided | 已填写部分 | Đã nhập một phần | 一部入力済み
가구원 | Household members | 家庭成员 | Thành viên hộ | 世帯員
월 소득 | Monthly income | 月收入 | Thu nhập hàng tháng | 月収
재산·부채 | Assets and debts | 财产与债务 | Tài sản và nợ | 財産・負債
차량 | Vehicles | 车辆 | Xe | 車両
없음 | None | 无 | Không có | なし
{count}명 | {count} people | {count}人 | {count} người | {count}人
{count}대 | {count} vehicles | {count}辆 | {count} xe | {count}台
{filled} / {total}개 항목 입력 | {filled} of {total} fields provided | 已填写{filled}／{total}项 | Đã nhập {filled} / {total} mục | {total}項目中{filled}項目を入力
`
  .trim()
  .split("\n")
  .map((row) => row.split(" | "));

const privacyRows = String.raw`
계정과 회원정보, 저장한 금융정보, 카카오 연결정보, 동의 기록, 알림 설정과 기기 푸시 토큰을 즉시 삭제합니다. 모든 기기의 로그인 세션도 종료됩니다. 삭제한 정보는 복구할 수 없습니다. | Your account, member details, saved financial details, Kakao connection details, consent records, notification preferences, and device push tokens are deleted immediately. All login sessions on every device end. Deleted information cannot be recovered. | 账号与会员信息、已保存的金融信息、Kakao关联信息、同意记录、通知设置及设备推送令牌将立即删除。所有设备上的登录会话也将结束。删除的信息无法恢复。 | Tài khoản, thông tin thành viên, thông tin tài chính đã lưu, liên kết Kakao, lịch sử đồng ý, tùy chọn thông báo và token đẩy của thiết bị sẽ bị xóa ngay. Mọi phiên đăng nhập trên mọi thiết bị đều kết thúc. Không thể khôi phục thông tin đã xóa. | アカウント・会員情報、保存した金融情報、Kakao連携情報、同意記録、通知設定、端末のプッシュトークンを直ちに削除します。すべての端末のログインセッションも終了します。削除した情報は復元できません。
은 아래 목적과 범위에서 개인정보를 처리합니다. 필요한 항목만 선택해 주세요. 선택 항목에 동의하지 않아도 회원가입과 공고 탐색을 이용할 수 있습니다. | processes personal information for the purposes and within the scope below. Select only the items you need. You can sign up and browse notices without consenting to optional items. | 按以下目的及范围处理个人信息。请只选择所需项目。即使不同意可选项目，也可以注册和浏览公告。 | xử lý thông tin cá nhân theo mục đích và phạm vi bên dưới. Chỉ chọn các mục cần thiết. Bạn vẫn có thể đăng ký và xem thông báo khi không đồng ý các mục tùy chọn. | は以下の目的と範囲で個人情報を取り扱います。必要な項目だけ選択してください。任意項目に同意しなくても登録とお知らせの閲覧ができます。
회원가입 개인정보 안내 | Privacy notice for sign-up | 注册个人信息说明 | Thông báo quyền riêng tư khi đăng ký | 登録時の個人情報の案内
회원가입과 계정 관리 · 필수 | Sign-up and account management · Required | 注册与账号管理 · 必需 | Đăng ký và quản lý tài khoản · Bắt buộc | 登録とアカウント管理 · 必須
수집 항목 | Information collected | 收集项目 | Thông tin thu thập | 収集する項目
일반 가입: 아이디, 비밀번호, 이메일. 카카오 가입: 카카오 계정 식별정보, 직접 입력한 이메일. 서비스가 생성하는 회원 식별자, 가입·수정 시각, 동의 항목·안내문 버전·동의 시각, 인증·로그인 세션 정보도 처리합니다. | Standard sign-up: username, password, and email. Kakao sign-up: Kakao account identifiers and the email you enter. We also process service-generated member identifiers, sign-up and update times, consent choices, notice versions and consent times, and verification and login session data. | 普通注册：用户名、密码、邮箱。Kakao注册：Kakao账号标识信息和您填写的邮箱。还处理服务生成的会员标识、注册及修改时间、同意项目、说明版本与同意时间、验证及登录会话信息。 | Đăng ký thông thường: tên đăng nhập, mật khẩu, email. Đăng ký Kakao: thông tin định danh tài khoản Kakao và email bạn nhập. Chúng tôi cũng xử lý mã thành viên do dịch vụ tạo, thời gian đăng ký và sửa, lựa chọn đồng ý, phiên bản thông báo, thời gian đồng ý, dữ liệu xác minh và phiên đăng nhập. | 通常登録：ユーザーID・パスワード・メールアドレス。Kakao登録：Kakaoアカウントの識別情報・入力したメールアドレス。サービスが生成する会員識別子、登録・更新時刻、同意項目・案内文のバージョン・同意時刻、認証・ログインセッション情報も取り扱います。
이용 목적 | Purpose of use | 使用目的 | Mục đích sử dụng | 利用目的
회원가입 의사 확인, 회원 식별, 로그인 및 계정 관리. 일반 가입의 이메일 인증과 부정 이용 방지. | Confirming intent to sign up, identifying members, login and account management, email verification for standard sign-up, and preventing misuse. | 确认注册意愿、识别会员、登录及账号管理、普通注册的邮箱验证和防止滥用。 | Xác nhận ý định đăng ký, nhận diện thành viên, đăng nhập và quản lý tài khoản, xác minh email khi đăng ký thông thường và ngăn chặn lạm dụng. | 登録意思の確認、会員の識別、ログインとアカウント管理、通常登録時のメール認証、不正利用の防止。
보유 기간 | Retention period | 保存期限 | Thời gian lưu giữ | 保有期間
거부 권리 | Right to refuse | 拒绝权利 | Quyền từ chối | 拒否する権利
동의를 거부할 수 있습니다. 거부하면 회원가입은 할 수 없지만 공개 공고 탐색은 이용할 수 있습니다. | You may refuse consent. If you refuse, you cannot sign up, but you can browse public notices. | 您可以拒绝同意。拒绝后无法注册，但仍可浏览公开公告。 | Bạn có thể từ chối đồng ý. Nếu từ chối, bạn không thể đăng ký nhưng vẫn có thể xem thông báo công khai. | 同意を拒否できます。拒否すると登録はできませんが、公開されたお知らせは閲覧できます。
비밀번호는 복원할 수 없는 해시로 저장합니다. 인증·가입 대기 정보는 만료 후 정리하며, 로그인 세션은 최대 7일 동안 유지되고 탈퇴하면 즉시 종료됩니다. 부정 요청을 제한하기 위해 IP 주소의 해시와 요청 횟수를 일시적으로 처리하며, 제한 기간이 만료되면 정리합니다. | Passwords are stored as irreversible hashes. Pending verification and sign-up data are cleared after expiry. Login sessions last up to 7 days and end immediately upon account deletion. To limit abusive requests, we temporarily process IP-address hashes and request counts, clearing them when the restriction period expires. | 密码以不可还原的哈希值保存。验证及待注册信息过期后清理。登录会话最长保留7天，注销后立即结束。为限制恶意请求，临时处理IP地址哈希值与请求次数，限制期限届满后清理。 | Mật khẩu được lưu dưới dạng hàm băm không thể khôi phục. Dữ liệu xác minh và đăng ký đang chờ được dọn sau khi hết hạn. Phiên đăng nhập kéo dài tối đa 7 ngày và kết thúc ngay khi đóng tài khoản. Để hạn chế yêu cầu lạm dụng, chúng tôi tạm xử lý hàm băm địa chỉ IP và số yêu cầu, rồi dọn khi hết thời gian hạn chế. | パスワードは復元できないハッシュとして保存します。認証・登録待ち情報は期限後に削除します。ログインセッションは最長7日間保持し、退会時に直ちに終了します。不正なリクエストを制限するため、IPアドレスのハッシュとリクエスト数を一時的に処理し、制限期間後に削除します。
카카오가 제공한 닉네임은 가입 진행 확인을 위해 최대 10분간 대기 정보로 처리합니다. 아래 맞춤 안내에 동의한 경우에만 회원의 표시 이름으로 저장합니다. | The nickname provided by Kakao is processed as pending data for up to 10 minutes to confirm sign-up progress. It is saved as your display name only if you consent to personalized guidance below. | Kakao提供的昵称作为待注册信息最多处理10分钟，用于确认注册进度。仅在同意下方个性化指南时，才作为会员显示名称保存。 | Biệt danh Kakao cung cấp được xử lý tạm tối đa 10 phút để xác nhận tiến trình đăng ký. Chỉ lưu làm tên hiển thị khi bạn đồng ý hướng dẫn cá nhân hóa bên dưới. | Kakaoが提供したニックネームは登録の進行確認のため、最長10分間の待機情報として処理します。以下の個別の案内に同意した場合だけ、会員の表示名として保存します。
맞춤 안내용 개인정보 안내 | Privacy notice for personalized guidance | 个性化指南个人信息说明 | Thông báo quyền riêng tư cho hướng dẫn cá nhân hóa | 個別の案内用の個人情報の説明
표시 이름과 맞춤 복지 안내 · 선택 | Display name and personalized welfare guidance · Optional | 显示名称与个性化福利指南 · 可选 | Tên hiển thị và hướng dẫn phúc lợi cá nhân hóa · Tùy chọn | 表示名と個別の福祉案内 · 任意
표시 이름 또는 카카오 닉네임, 만 나이, 성별, 거주 지역, 우편번호, 기본 주소와 상세 주소. 원하는 항목만 입력할 수 있습니다. | Display name or Kakao nickname, age in completed years, gender, residential region, postal code, street address, and address details. Enter only the fields you choose. | 显示名称或Kakao昵称、周岁年龄、性别、居住地区、邮政编码、基本地址及详细地址。只需填写您选择的项目。 | Tên hiển thị hoặc biệt danh Kakao, tuổi đủ năm, giới tính, khu vực cư trú, mã bưu chính, địa chỉ cơ bản và chi tiết. Chỉ nhập các mục bạn muốn. | 表示名またはKakaoのニックネーム、満年齢、性別、居住地域、郵便番号、基本住所、詳細住所。希望する項目だけ入力できます。
화면에 이름 표시, 거주 주소 관리, 나이·성별·주소에서 확인한 지역 조건에 맞는 복지 공고 안내. 회원정보 수정 화면에서 변경하거나 비울 수 있습니다. | Displaying your name, managing your residential address, and guiding you to welfare notices matching your age, gender, and region identified from your address. You can change or clear these in account settings. | 显示名称、管理居住地址，并按年龄、性别和地址确认的地区条件提供福利公告指南。可在会员信息修改页面更改或清空。 | Hiển thị tên, quản lý địa chỉ cư trú và hướng dẫn thông báo phù hợp với tuổi, giới tính, khu vực từ địa chỉ. Bạn có thể sửa hoặc xóa trong màn hình sửa thông tin tài khoản. | 名前の表示、住所の管理、年齢・性別・住所から確認した地域の条件に合う福祉のお知らせの案内。会員情報の編集画面で変更・消去できます。
개별 항목을 삭제하면 해당 정보를 더 이상 사용하지 않습니다. | When you delete an individual field, we stop using that information. | 删除单个项目后，不再使用该信息。 | Khi bạn xóa từng mục, thông tin đó không còn được sử dụng. | 個別の項目を削除すると、その情報は使わなくなります。
동의하지 않아도 가입할 수 있습니다. 선택한 정보를 이용한 맞춤 안내만 제한됩니다. | You can sign up without consenting. Only personalized guidance using the optional details is limited. | 不同意也可注册，仅限制使用选填信息的个性化指南。 | Bạn vẫn có thể đăng ký khi không đồng ý. Chỉ hướng dẫn cá nhân hóa dùng thông tin tùy chọn bị hạn chế. | 同意しなくても登録できます。任意の情報を使う個別の案内のみ制限されます。
AI 개인정보 처리 안내 | Privacy notice for AI processing | AI个人信息处理说明 | Thông báo xử lý thông tin cá nhân bằng AI | AIによる個人情報処理の案内
외부 AI 질문·답변 · 선택 | Questions and answers with external AI · Optional | 外部AI问答 · 可选 | Hỏi đáp bằng AI bên ngoài · Tùy chọn | 外部AIの質問・回答 · 任意
AI에 직접 질문하는 경우 질문 내용, 회원의 지역·연령대, 선택한 공고 내용을 외부 AI 서비스에 보내 답변을 만듭니다. 이름·이메일·성별·우편번호·기본 주소·상세 주소·저장한 금융정보는 자동 첨부하지 않습니다. | When you ask AI a question, the question, your region and age group, and the selected notice are sent to an external AI service to generate an answer. Your name, email, gender, postal code, street address, address details, and saved financial details are not automatically attached. | 向AI提问时，问题内容、会员地区及年龄段、所选公告内容将发送至外部AI服务生成回答。不会自动附加姓名、邮箱、性别、邮政编码、基本地址、详细地址和已保存的金融信息。 | Khi hỏi AI, nội dung câu hỏi, khu vực và nhóm tuổi của bạn cùng thông báo đã chọn được gửi đến dịch vụ AI bên ngoài để tạo câu trả lời. Tên, email, giới tính, mã bưu chính, địa chỉ cơ bản, chi tiết địa chỉ và thông tin tài chính đã lưu không được tự động đính kèm. | AIに質問すると、質問内容、会員の地域・年齢層、選択したお知らせを外部AIサービスへ送り、回答を作成します。名前・メール・性別・郵便番号・基本住所・詳細住所・保存した金融情報は自動で添付しません。
공개된 복지 공고의 AI 정리에는 회원가입 정보나 회원의 질문을 포함하지 않습니다. | AI summaries of public welfare notices do not include sign-up details or members' questions. | 公开福利公告的AI整理不包含注册信息或会员的问题。 | Bản tóm tắt AI của thông báo công khai không gồm thông tin đăng ký hay câu hỏi của thành viên. | 公開された福祉のお知らせのAI整理には、登録情報や会員の質問を含めません。
질문에는 주민등록번호, 연락처, 건강·장애 정보 등 민감한 내용을 입력하지 마세요. AI 답변은 참고용이며 지원 자격은 담당 기관에서 확인해야 합니다. | Do not include sensitive information such as resident registration numbers, contact details, or health and disability information in questions. AI answers are for reference; confirm eligibility with the responsible organization. | 提问时请勿输入居民登记号码、联系方式、健康或残障信息等敏感内容。AI回答仅供参考，申请资格须向主管机构确认。 | Không nhập thông tin nhạy cảm như số đăng ký cư dân, liên hệ, sức khỏe hoặc khuyết tật trong câu hỏi. Câu trả lời AI chỉ để tham khảo; hãy xác nhận điều kiện với cơ quan phụ trách. | 質問に住民登録番号、連絡先、健康・障害情報などの機微な情報を入力しないでください。AIの回答は参考情報です。申請資格は担当機関で確認してください。
처리 업체·연락처 | Processor and contact | 处理机构与联系方式 | Đơn vị xử lý và liên hệ | 処理事業者・連絡先
이전 국가 | Destination countries | 转移国家 | Quốc gia tiếp nhận | 移転先の国
목적·항목 | Purpose and information | 目的与项目 | Mục đích và thông tin | 目的・項目
이전 시기·방법 | Transfer timing and method | 转移时间与方式 | Thời điểm và cách chuyển | 移転時期・方法
모델 학습 이용 | Use for model training | 模型训练用途 | Sử dụng để huấn luyện mô hình | モデル学習への利用
거부·철회 | Refusal and withdrawal | 拒绝与撤回 | Từ chối và rút lại | 拒否・撤回
동의하지 않아도 가입, 공고 탐색, 준비된 FAQ를 이용할 수 있습니다. 동의 철회는 개인정보 문의 이메일로 요청할 수 있습니다. | Without consenting, you can still sign up, browse notices, and use the prepared FAQ. Request withdrawal of consent through the privacy contact email. | 不同意也可注册、浏览公告和使用已准备的FAQ。可通过个人信息咨询邮箱申请撤回同意。 | Không đồng ý vẫn có thể đăng ký, xem thông báo và dùng FAQ có sẵn. Yêu cầu rút lại đồng ý qua email liên hệ về quyền riêng tư. | 同意しなくても登録、お知らせの閲覧、用意されたFAQを使えます。同意の撤回は個人情報の問い合わせ先メールで依頼できます。
외부 AI의 처리 업체·국외이전·보유기간 안내를 준비 중입니다. 안내와 별도 동의가 갖춰지기 전에는 회원 질문을 외부 AI로 전송하지 않습니다. 공고 탐색과 준비된 FAQ는 계속 이용할 수 있습니다. | Information about external AI processors, international transfers, and retention is being prepared. Members' questions are not sent to external AI until the notice and separate consent are ready. You can continue browsing notices and using the prepared FAQ. | 外部AI处理机构、境外转移及保存期限说明正在准备中。在说明和单独同意准备就绪前，不会将会员问题发送给外部AI。公告浏览和已准备的FAQ仍可使用。 | Đang chuẩn bị hướng dẫn về đơn vị AI bên ngoài, chuyển dữ liệu ra nước ngoài và thời gian lưu. Câu hỏi thành viên không được gửi đến AI bên ngoài trước khi có hướng dẫn và đồng ý riêng. Bạn vẫn có thể xem thông báo và dùng FAQ có sẵn. | 外部AIの処理事業者・国外移転・保有期間の案内を準備中です。案内と別途の同意が整うまで、会員の質問を外部AIへ送りません。お知らせの閲覧と用意されたFAQは引き続き使えます。
추가 개인정보와 권리 안내 | Additional personal information and rights | 其他个人信息与权利说明 | Thông tin cá nhân bổ sung và quyền | 追加の個人情報と権利の案内
추가 정보와 삭제 요청 | Additional details and deletion requests | 其他信息与删除请求 | Thông tin bổ sung và yêu cầu xóa | 追加情報と削除の依頼
소득·재산·가구·차량 정보는 계산기 이용 시 별도로 안내하며, 계정 저장에는 별도 동의를 받습니다. 회원가입 동의에는 금융정보 저장이나 건강·장애 등 민감정보 처리가 포함되지 않습니다. | Income, assets, household, and vehicle information are explained separately when you use the calculator, and account storage requires separate consent. Sign-up consent does not include storing financial details or processing sensitive information such as health or disability data. | 收入、财产、家庭及车辆信息在使用计算器时另行说明，保存至账号需单独同意。注册同意不包含金融信息保存或健康、残障等敏感信息处理。 | Thông tin thu nhập, tài sản, hộ gia đình và xe được hướng dẫn riêng khi dùng máy tính; lưu vào tài khoản cần đồng ý riêng. Đồng ý đăng ký không bao gồm lưu thông tin tài chính hay xử lý dữ liệu nhạy cảm như sức khỏe hoặc khuyết tật. | 所得・財産・世帯・車両情報は計算機の利用時に別途案内し、アカウントへの保存には別の同意を得ます。登録時の同意には、金融情報の保存や健康・障害などの機微な情報の処理は含まれません。
회원정보는 ‘내 정보’에서 수정하거나 비울 수 있습니다. ‘내 정보’의 회원 탈퇴에서 계정, 저장한 금융정보, 카카오 연결정보, 동의 기록, 알림 설정과 기기 푸시 토큰을 즉시 삭제하고 모든 로그인 세션을 종료합니다. 개인정보 열람·정정·동의 철회에 관한 문의는 아래 이메일로 접수합니다: | You can edit or clear account details in “My details.” Closing your account there immediately deletes the account, saved financial details, Kakao connections, consent records, notification preferences, and device push tokens, and ends all login sessions. Send requests for access, correction, or withdrawal of consent to this email: | 可在“我的信息”修改或清空会员信息。在该页面注销账号后，将立即删除账号、已保存的金融信息、Kakao关联信息、同意记录、通知设置及设备推送令牌，并结束全部登录会话。个人信息查阅、更正及撤回同意的咨询请发送至以下邮箱： | Bạn có thể sửa hoặc xóa thông tin trong “Thông tin của tôi”. Đóng tài khoản tại đó sẽ xóa ngay tài khoản, thông tin tài chính đã lưu, liên kết Kakao, lịch sử đồng ý, tùy chọn thông báo và token đẩy thiết bị, đồng thời kết thúc mọi phiên đăng nhập. Gửi yêu cầu xem, sửa hoặc rút lại đồng ý đến email: | 「自分の情報」で会員情報を編集・消去できます。同画面の退会から、アカウント、保存した金融情報、Kakao連携情報、同意記録、通知設定、端末のプッシュトークンを直ちに削除し、すべてのログインセッションを終了します。個人情報の閲覧・訂正・同意撤回の問い合わせは次のメールへ：
관련 법령 확인 | View applicable legislation | 查看相关法律 | Xem pháp luật liên quan | 関連法令を確認
개인정보 보호법 제15조(수집·이용), 제16조(최소 수집), 제21조(파기), 제22조(구분된 동의), 제23조(민감정보), 제26조(처리 위탁), 제28조의8(국외이전), 제30조(처리방침 공개)를 기준으로 안내합니다. | This notice refers to Korea's Personal Information Protection Act: Articles 15 (collection and use), 16 (minimum collection), 21 (destruction), 22 (separate consent), 23 (sensitive information), 26 (outsourced processing), 28-8 (international transfers), and 30 (publication of privacy policies). | 本说明依据韩国《个人信息保护法》第15条（收集与使用）、第16条（最少收集）、第21条（销毁）、第22条（区分同意）、第23条（敏感信息）、第26条（委托处理）、第28条之8（境外转移）、第30条（公开处理政策）。 | Thông báo dựa trên Luật Bảo vệ Thông tin Cá nhân Hàn Quốc: Điều 15 (thu thập và sử dụng), 16 (thu thập tối thiểu), 21 (hủy), 22 (đồng ý riêng), 23 (thông tin nhạy cảm), 26 (ủy thác xử lý), 28-8 (chuyển ra nước ngoài), 30 (công bố chính sách). | 韓国の個人情報保護法第15条（収集・利用）、第16条（最小限の収集）、第21条（破棄）、第22条（区分された同意）、第23条（機微な情報）、第26条（処理委託）、第28条の8（国外移転）、第30条（方針の公開）に基づいて案内します。
국가법령정보센터에서 법령 보기 | View the law at the Korean Law Information Center | 在韩国国家法令信息中心查看法律 | Xem luật tại Trung tâm Thông tin Pháp luật Hàn Quốc | 韓国の国家法令情報センターで法令を見る
안내문 버전 | Notice version | 说明版本 | Phiên bản thông báo | 案内文のバージョン
· 운영자 | · Operator | · 运营者 | · Đơn vị vận hành | · 運営者
최신 개인정보 안내를 확인하지 못했어요. 다시 불러와 주세요. | Could not verify the latest privacy notice. Please reload it. | 无法确认最新个人信息说明，请重新加载。 | Không thể xác nhận thông báo quyền riêng tư mới nhất. Vui lòng tải lại. | 最新の個人情報の案内を確認できませんでした。再読み込みしてください。
동의하고 가입 방법 선택 | Agree and choose sign-up method | 同意并选择注册方式 | Đồng ý và chọn cách đăng ký | 同意して登録方法を選択
개인정보 수집·이용 안내 | Personal information collection and use | 个人信息收集与使用说明 | Thu thập và sử dụng thông tin cá nhân | 個人情報の収集・利用の案内
개인정보 안내를 불러오고 있어요… | Loading privacy notice… | 正在加载个人信息说明… | Đang tải thông báo quyền riêng tư… | 個人情報の案内を読み込んでいます…
아래 안내를 확인하고 동의 여부를 선택해 주세요 | Review the notice and choose whether to consent | 请阅读以下说明并选择是否同意 | Xem hướng dẫn và chọn có đồng ý hay không | 以下の案内を確認し、同意するか選択してください
[필수] 회원가입 개인정보 수집·이용에 동의합니다. | [Required] I agree to personal information collection and use for sign-up. | [必需] 我同意注册所需的个人信息收集与使用。 | [Bắt buộc] Tôi đồng ý thu thập và sử dụng thông tin cá nhân để đăng ký. | [必須] 登録のための個人情報の収集・利用に同意します。
[선택] 맞춤 안내용 개인정보 수집·이용에 동의합니다. | [Optional] I agree to personal information collection and use for personalized guidance. | [可选] 我同意个性化指南所需的个人信息收集与使用。 | [Tùy chọn] Tôi đồng ý thu thập và sử dụng thông tin cá nhân cho hướng dẫn cá nhân hóa. | [任意] 個別の案内用の個人情報の収集・利用に同意します。
[선택] 외부 AI 처리 및 개인정보 국외이전에 동의합니다. | [Optional] I agree to external AI processing and international transfer of personal information. | [可选] 我同意外部AI处理和个人信息境外转移。 | [Tùy chọn] Tôi đồng ý xử lý bằng AI bên ngoài và chuyển thông tin cá nhân ra nước ngoài. | [任意] 外部AIによる処理と個人情報の国外移転に同意します。
동의하지 않고 공고 둘러보기 | Browse notices without consenting | 不同意并浏览公告 | Xem thông báo mà không đồng ý | 同意せずお知らせを見る
다시 불러오기 | Reload | 重新加载 | Tải lại | 再読み込み
안내를 불러오고 있어요… | Loading notice… | 正在加载说明… | Đang tải hướng dẫn… | 案内を読み込んでいます…
개인정보 처리 안내 다시 보기 | View privacy notice again | 再次查看个人信息处理说明 | Xem lại thông báo xử lý thông tin cá nhân | 個人情報の取り扱いの案内を再表示
`
  .trim()
  .split("\n")
  .map((row) => row.split(" | "));

const guideRows = String.raw`
주거 | Housing | 住房 | Nhà ở | 住まい
청년 주거 지원 안내 | Housing support for young adults | 青年住房支援指南 | Hỗ trợ nhà ở cho thanh niên | 若者向け住宅支援の案内
주거비 부담을 덜어주는 지원을 살펴보세요. | Explore support that helps reduce housing costs. | 查看减轻住房费用负担的支援。 | Tìm hỗ trợ giúp giảm chi phí nhà ở. | 住居費の負担を減らす支援を探しましょう。
거주 지역과 연령, 소득 등 신청 조건을 확인해요. | Check requirements such as region, age, and income. | 确认居住地区、年龄、收入等申请条件。 | Kiểm tra điều kiện như khu vực, tuổi và thu nhập. | 居住地域・年齢・所得などの申請条件を確認します。
일자리 | Jobs | 就业 | Việc làm | 仕事
취업 준비와 직무 교육 | Job preparation and skills training | 求职准备与职业培训 | Chuẩn bị tìm việc và đào tạo nghề | 就職準備と職業訓練
새로운 일을 준비하는 데 필요한 지원을 살펴보세요. | Explore support for preparing for a new job. | 查看为新工作做准备所需的支援。 | Tìm hỗ trợ chuẩn bị cho công việc mới. | 新しい仕事の準備に必要な支援を探しましょう。
모집 대상과 교육 일정, 참여 조건을 확인해요. | Check who can apply, training schedules, and participation requirements. | 确认招募对象、培训日程和参加条件。 | Kiểm tra đối tượng, lịch đào tạo và điều kiện tham gia. | 募集対象・研修日程・参加条件を確認します。
생활·금융 | Living and finance | 生活与金融 | Sinh hoạt và tài chính | 生活・金融
생활 안정을 위한 지원 | Support for financial stability | 生活稳定支援 | Hỗ trợ ổn định cuộc sống | 生活の安定を支える支援
일상에 도움이 되는 생활 지원을 살펴보세요. | Explore support for everyday living. | 查看有助于日常生活的支援。 | Tìm hỗ trợ cho cuộc sống hằng ngày. | 日常の暮らしに役立つ支援を探しましょう。
가구 구성과 소득 등 신청 조건을 확인해요. | Check requirements such as household composition and income. | 确认家庭构成、收入等申请条件。 | Kiểm tra điều kiện như thành phần hộ và thu nhập. | 世帯構成・所得などの申請条件を確認します。
교육 | Education | 教育 | Giáo dục | 教育
배움의 기회를 넓히는 지원 | Support for more learning opportunities | 扩大学习机会的支援 | Hỗ trợ mở rộng cơ hội học tập | 学ぶ機会を広げる支援
학업과 배움에 필요한 지원을 살펴보세요. | Explore support for study and learning. | 查看学业与学习所需的支援。 | Tìm hỗ trợ cho học tập. | 学業や学びに必要な支援を探しましょう。
지원 대상과 교육 과정, 신청 방법을 확인해요. | Check eligibility, courses, and how to apply. | 确认支援对象、课程与申请方式。 | Kiểm tra đối tượng, khóa học và cách đăng ký. | 支援対象・教育課程・申請方法を確認します。
건강·돌봄 | Health and care | 健康与照护 | Sức khỏe và chăm sóc | 健康・ケア
건강과 돌봄 서비스 | Health and care services | 健康与照护服务 | Dịch vụ sức khỏe và chăm sóc | 健康とケアのサービス
나와 가족을 위한 건강·돌봄 지원을 살펴보세요. | Explore health and care support for you and your family. | 查看为您及家人提供的健康与照护支援。 | Tìm hỗ trợ sức khỏe và chăm sóc cho bạn và gia đình. | 自分や家族のための健康・ケア支援を探しましょう。
이용 대상과 서비스 내용, 담당 기관을 확인해요. | Check who can use the service, what it offers, and the responsible organization. | 确认服务对象、内容与主管机构。 | Kiểm tra đối tượng, nội dung dịch vụ và cơ quan phụ trách. | 利用対象・サービス内容・担当機関を確認します。
공고 찾기 | Find notices | 查找公告 | Tìm thông báo | お知らせを探す
맞춤 추천 | Personalized recommendations | 个性化推荐 | Gợi ý phù hợp | あなた向けのおすすめ
저장과 일정 | Saved notices and dates | 收藏与日程 | Lưu và lịch | 保存と日程
쉬운 화면 | Easy view | 简易界面 | Giao diện dễ dùng | やさしい画面
이해를 돕기 위한 예시 화면 | Example screen to explain the service | 帮助理解的示例画面 | Màn hình minh họa để giải thích dịch vụ | 理解を助ける画面例
당신의 일상을 위한 복지 길잡이 | Your guide to welfare for everyday life | 为您的日常生活提供福利指南 | Hướng dẫn phúc lợi cho cuộc sống của bạn | 日々の暮らしの福祉ガイド
필요한 복지를, | Find the support you need. | 找到所需的福利， | Tìm phúc lợi bạn cần. | 必要な福祉を、
발견하는 기쁨. | Enjoy the discovery. | 享受发现的喜悦。 | Niềm vui khi khám phá. | 見つける喜び。
복지나침반. | Welfare Compass. | 福利指南针。 | La bàn Phúc lợi. | 福祉コンパス。
어디서부터 찾아야 할지 막막할 때. | When you do not know where to start. | 不知道从哪里开始寻找时。 | Khi chưa biết bắt đầu từ đâu. | どこから探せばよいか分からないとき。
나에게 필요한 공고부터 신청 준비까지, | From finding suitable notices to preparing to apply, | 从寻找所需公告到准备申请， | Từ tìm thông báo phù hợp đến chuẩn bị đăng ký, | 必要なお知らせから申請の準備まで、
한 걸음씩 함께해요. | we will help you one step at a time. | 我们陪您一步步前进。 | chúng tôi đồng hành cùng bạn từng bước. | 一歩ずつお手伝いします。
나에게 필요한 공고 찾기 | Find the notices I need | 查找我需要的公告 | Tìm thông báo tôi cần | 必要なお知らせを探す
푸른 유리와 은색 금속으로 표현한 나침반 | Compass made of blue glass and silver metal | 蓝色玻璃与银色金属构成的指南针 | La bàn bằng kính xanh và kim loại bạc | 青いガラスと銀色の金属で表現したコンパス
가능성을 향한 새로운 방향 | A new direction toward possibilities | 朝向可能性的新方向 | Hướng mới tới những cơ hội | 可能性への新しい方向
찾고. 이해하고. 준비하고. | Find. Understand. Prepare. | 寻找。理解。准备。 | Tìm. Hiểu. Chuẩn bị. | 探す。理解する。準備する。
복지를 만나는 과정이 한결 가벼워집니다. | Discovering welfare becomes easier. | 了解福利的过程更加轻松。 | Tiếp cận phúc lợi trở nên dễ dàng hơn. | 福祉に出会うまでの道のりが、もっと軽やかに。
복지나침반 알아보기 | Discover Welfare Compass | 了解福利指南针 | Tìm hiểu La bàn Phúc lợi | 福祉コンパスについて知る
서비스 소개 목차 | Service guide contents | 服务介绍目录 | Mục lục hướng dẫn dịch vụ | サービス紹介の目次
복지나침반 사용 안내 | Welfare Compass guide | 福利指南针使用指南 | Hướng dẫn La bàn Phúc lợi | 福祉コンパスの使い方
01 · 필요한 공고 찾기 | 01 · Find the notices you need | 01 · 寻找所需公告 | 01 · Tìm thông báo bạn cần | 01 · 必要なお知らせを探す
복지 정보는 많으니까. | There is a lot of welfare information. | 福利信息很多， | Có nhiều thông tin phúc lợi. | 福祉の情報はたくさんあるから。
내게 필요한 것부터. | Start with what you need. | 从我需要的开始。 | Bắt đầu với những gì bạn cần. | 自分に必要なものから。
지역과 관심 분야로 범위를 좁혀보세요. | Narrow your search by region and interests. | 按地区和关注领域缩小范围。 | Thu hẹp tìm kiếm theo khu vực và lĩnh vực quan tâm. | 地域と関心分野で絞り込みましょう。
정확한 사업 이름을 몰라도, 필요한 도움에서 시작할 수 있어요. | You can start with the help you need, even without knowing a program's exact name. | 即使不知道项目的准确名称，也可从所需帮助开始。 | Bạn có thể bắt đầu từ hỗ trợ cần thiết dù không biết tên chương trình chính xác. | 正確な事業名が分からなくても、必要な助けから探せます。
어떤 도움이 필요하세요? | What help do you need? | 您需要什么帮助？ | Bạn cần hỗ trợ gì? | どんな助けが必要ですか？
서비스 미리보기 | Service preview | 服务预览 | Xem trước dịch vụ | サービスのプレビュー
관심 있는 분야를 눌러보세요 | Select a field you are interested in | 点击关注的领域 | Chọn lĩnh vực bạn quan tâm | 関心のある分野を押してください
공고 예시의 관심 분야 선택 | Select an interest for the example notice | 选择示例公告的关注领域 | Chọn lĩnh vực cho thông báo minh họa | お知らせ例の関心分野を選択
· 공고 예시 | · Example notice | · 示例公告 | · Thông báo minh họa | · お知らせの例
공고의 구성과 탐색 방식을 보여주는 예시입니다. 실제 모집 공고가 아닙니다. | This example shows how notices are organized and browsed. It is not an actual call for applications. | 此示例展示公告结构与浏览方式，不是真实招募公告。 | Đây là ví dụ về cấu trúc và cách xem thông báo, không phải thông báo tuyển đăng ký thực tế. | お知らせの構成と探し方を示す例です。実際の募集ではありません。
실제 공고 찾아보기 | Browse actual notices | 浏览真实公告 | Xem thông báo thực tế | 実際のお知らせを探す
02 · 내 정보로 맞춤 추천 | 02 · Recommendations using your details | 02 · 根据我的信息推荐 | 02 · Gợi ý theo thông tin của bạn | 02 · 自分の情報でおすすめを見る
내 정보를 알려주면, | Share your details, | 提供我的信息， | Cung cấp thông tin của bạn, | 自分の情報を入力すれば、
찾는 길은 더 짧게. | and find your way faster. | 寻找的路更短。 | để tìm nhanh hơn. | 探す道のりがもっと短く。
거주 지역, 연령대, 관심 분야. | Your region, age group, and interests. | 居住地区、年龄段、关注领域。 | Khu vực, nhóm tuổi và lĩnh vực quan tâm. | 居住地域、年齢層、関心分野。
입력한 정보를 바탕으로 공고를 추천해요. | We recommend notices based on the details you enter. | 根据填写的信息推荐公告。 | Chúng tôi gợi ý thông báo theo thông tin bạn nhập. | 入力した情報に基づいてお知らせをおすすめします。
어떤 점이 맞는지, 추천 이유도 함께 살펴보세요. | Review why each notice is recommended and how it matches. | 查看匹配内容和推荐理由。 | Xem điểm phù hợp và lý do gợi ý. | どこが合うか、おすすめの理由も確認しましょう。
내 정보로 맞춤 공고 찾기 | Find notices using my details | 根据我的信息查找公告 | Tìm thông báo theo thông tin của tôi | 自分の情報でお知らせを探す
추천은 탐색을 돕는 참고 정보예요. | Recommendations are guidance to help your search. | 推荐是帮助查找的参考信息。 | Gợi ý chỉ để tham khảo khi tìm kiếm. | おすすめは探すための参考情報です。
신청 전에 공식 공고의 자격 조건을 확인해 주세요. | Check eligibility in the official notice before applying. | 申请前请确认正式公告的资格条件。 | Kiểm tra điều kiện trong thông báo chính thức trước khi đăng ký. | 申請前に公式のお知らせで資格条件を確認してください。
나의 관심사를 담아서 | Reflecting my interests | 根据我的关注点 | Theo lĩnh vực tôi quan tâm | 自分の関心を反映して
추천에 쓰는 내 정보 | My details used for recommendations | 推荐使用的我的信息 | Thông tin dùng cho gợi ý | おすすめに使う自分の情報
25–29세 | Ages 25–29 | 25至29岁 | 25–29 tuổi | 25〜29歳
입력한 정보와 공고 조건 비교 | Compare your details with notice requirements | 比较输入信息与公告条件 | So sánh thông tin với điều kiện thông báo | 入力情報とお知らせの条件を比較
함께 살펴볼 공고 | Notices to explore | 可一起查看的公告 | Thông báo để xem | 一緒に確認したいお知らせ
예시 | Example | 示例 | Ví dụ | 例
지역과 연령 등 세부 신청 조건을 확인해 보세요. | Check detailed requirements such as region and age. | 请确认地区、年龄等具体申请条件。 | Kiểm tra điều kiện chi tiết như khu vực và tuổi. | 地域や年齢などの詳しい申請条件を確認しましょう。
선택한 관심 분야 ‘주거’와 관련 있어요 | Related to your selected interest, “Housing” | 与所选关注领域“住房”有关 | Liên quan đến lĩnh vực “Nhà ở” đã chọn | 選択した関心分野「住まい」に関連しています
03 · 관심 공고와 신청 일정 | 03 · Saved notices and application dates | 03 · 关注的公告与申请日程 | 03 · Thông báo quan tâm và lịch đăng ký | 03 · 関心のあるお知らせと申請日程
좋은 발견이, | Let a useful discovery | 让好的发现， | Để khám phá hữu ích | よい発見が、
다음 행동으로 이어지도록. | lead to your next step. | 引领下一步行动。 | dẫn đến bước tiếp theo. | 次の行動につながるように。
관심 있는 공고는 저장하고, 신청 일정은 캘린더에서. | Save notices you like and check application dates in the calendar. | 收藏感兴趣的公告，在日历查看申请日程。 | Lưu thông báo quan tâm và xem lịch đăng ký trong lịch. | 関心のあるお知らせは保存し、申請日程はカレンダーで。
다시 찾는 수고를 줄이고 차근차근 준비하세요. | Save time searching again and prepare step by step. | 减少再次查找的麻烦，逐步准备。 | Giảm thời gian tìm lại và chuẩn bị từng bước. | 探し直す手間を減らして、少しずつ準備しましょう。
저장한 공고 | Saved notices | 已收藏公告 | Thông báo đã lưu | 保存したお知らせ
마음에 드는 공고는 | Keep notices you like | 感兴趣的公告， | Giữ thông báo bạn thích | 気になるお知らせは、
책갈피로 모아두세요. | together with bookmarks. | 用书签收藏起来。 | bằng dấu trang. | ブックマークでまとめましょう。
공고 예시 | Example notice | 示例公告 | Thông báo minh họa | お知らせの例
주거 · 신청 조건 확인 필요 | Housing · Check application requirements | 住房 · 需确认申请条件 | Nhà ở · Cần kiểm tra điều kiện | 住まい · 申請条件の確認が必要
예시 공고 저장 해제 | Unsave example notice | 取消收藏示例公告 | Bỏ lưu thông báo minh họa | お知らせ例の保存を解除
예시 공고 저장하기 | Save example notice | 收藏示例公告 | Lưu thông báo minh họa | お知らせ例を保存
예시 공고를 저장했어요. 한 번 더 누르면 해제돼요. | Example notice saved. Select again to unsave it. | 示例公告已收藏，再次点击可取消。 | Đã lưu thông báo minh họa. Chọn lần nữa để bỏ lưu. | お知らせの例を保存しました。もう一度押すと解除できます。
책갈피를 눌러 저장을 체험해 보세요. | Select the bookmark to try saving. | 点击书签体验收藏功能。 | Chọn dấu trang để thử lưu. | ブックマークを押して保存を体験してください。
실제 공고는 공고 카드의 책갈피를 누르면 | Bookmark an actual notice on its card | 点击真实公告卡片上的书签后， | Đánh dấu thông báo thực tế trên thẻ | 実際のお知らせはカードのブックマークを押すと、
‘저장한 공고’에서 다시 볼 수 있어요. | to find it again in “Saved notices.” | 可在“已收藏公告”再次查看。 | để xem lại trong “Thông báo đã lưu”. | 「保存したお知らせ」で再び確認できます。
공고 캘린더 | Notice calendar | 公告日历 | Lịch thông báo | お知らせカレンダー
시작하는 날도, | Opening dates | 开始日期， | Ngày bắt đầu | 開始日も、
마감하는 날도 한눈에. | and deadlines at a glance. | 截止日期，一目了然。 | và hạn chót trong nháy mắt. | 締切日もひと目で。
신청 시작일을 표시한 일정 예시 | Example calendar showing application opening dates | 显示申请开始日期的日程示例 | Lịch minh họa ngày bắt đầu đăng ký | 申請開始日を示す日程の例
신청 일정 | Application dates | 申请日程 | Lịch đăng ký | 申請日程
월 | Mon | 一 | T2 | 月
화 | Tue | 二 | T3 | 火
수 | Wed | 三 | T4 | 水
목 | Thu | 四 | T5 | 木
금 | Fri | 五 | T6 | 金
신청 시작 | Applications open | 申请开始 | Bắt đầu đăng ký | 申請開始
공고 캘린더 열기 | Open notice calendar | 打开公告日历 | Mở lịch thông báo | お知らせカレンダーを開く
직접 바꿔보세요 | Try changing it | 试着切换 | Thử thay đổi | 切り替えてみましょう
예시 화면을 쉬운 화면으로 보기 | Show the example in easy view | 以简易界面查看示例 | Xem ví dụ bằng giao diện dễ dùng | 画面例をやさしい画面で表示
쉬운 화면 예시 | Easy-view example | 简易界面示例 | Ví dụ giao diện dễ dùng | やさしい画面の例
기본 화면 예시 | Standard-view example | 标准界面示例 | Ví dụ giao diện cơ bản | 基本画面の例
나에게 필요한 | Find the welfare | 寻找我需要的 | Tìm thông báo | 自分に必要な
복지 공고를 찾아보세요. | notices you need. | 福利公告。 | phúc lợi bạn cần. | 福祉のお知らせを探しましょう。
지역과 관심 분야를 선택해 필요한 지원을 살펴보세요. | Select your region and interests to explore relevant support. | 选择地区和关注领域，查看所需支援。 | Chọn khu vực và lĩnh vực quan tâm để tìm hỗ trợ phù hợp. | 地域と関心分野を選んで、必要な支援を探しましょう。
지원 내용과 신청 조건을 확인하세요. | Check support details and application requirements. | 确认支援内容与申请条件。 | Kiểm tra nội dung hỗ trợ và điều kiện đăng ký. | 支援内容と申請条件を確認してください。
주거 · 청년 · 신청 조건 확인 필요 | Housing · Young adults · Check requirements | 住房 · 青年 · 需确认申请条件 | Nhà ở · Thanh niên · Cần kiểm tra điều kiện | 住まい · 若者 · 申請条件の確認が必要
일자리 교육 프로그램 | Job training program | 就业培训项目 | Chương trình đào tạo nghề | 職業訓練プログラム
일자리 · 교육 · 일정 확인 필요 | Jobs · Education · Check dates | 就业 · 教育 · 需确认日程 | Việc làm · Giáo dục · Cần kiểm tra lịch | 仕事 · 教育 · 日程の確認が必要
공고 찾아보기 | Browse notices | 浏览公告 | Xem thông báo | お知らせを探す
글자 크기와 정보 구성이 달라지는 예시입니다. | Example showing changes in text size and information layout. | 此示例展示字号与信息布局的变化。 | Ví dụ thay đổi kích thước chữ và bố cục thông tin. | 文字の大きさと情報の構成が変わる例です。
04 · 나에게 편한 방식으로 | 04 · In a way that works for you | 04 · 用适合我的方式 | 04 · Theo cách thuận tiện cho bạn | 04 · 自分に使いやすい方法で
조금 더 크게. | A little larger. | 再大一点。 | Lớn hơn một chút. | 少し大きく。
한결 더 | A little more | 更加 | Thêm phần | もっと
편안하게. | comfortable. | 舒适。 | dễ chịu. | 使いやすく。
작은 글씨와 복잡한 화면이 불편하다면, | If small text and busy screens are difficult to use, | 如果小字和复杂界面不便使用， | Nếu chữ nhỏ và màn hình phức tạp khó dùng, | 小さな文字や複雑な画面が使いにくいときは、
‘쉬운 화면’을 켜보세요. | turn on “Easy view.” | 请开启“简易界面”。 | bật “Giao diện dễ dùng”. | 「やさしい画面」をオンにしてください。
글자는 키우고, 중요한 정보는 더 또렷하게 보여드려요. | Larger text and clearer presentation of important details. | 字号更大，重要信息更清晰。 | Chữ lớn hơn và thông tin quan trọng rõ hơn. | 文字を大きくし、大切な情報を分かりやすく表示します。
쉬운 화면으로 시작하기 | Start with easy view | 使用简易界面开始 | Bắt đầu với giao diện dễ dùng | やさしい画面で始める
신청 전, 한 번 더 확인하세요 | Check once more before applying | 申请前请再次确认 | Kiểm tra lần nữa trước khi đăng ký | 申請前にもう一度確認
발견은 쉽게. | Find it easily. | 轻松发现。 | Dễ dàng tìm thấy. | 見つけるのは簡単に。
확인은 꼼꼼하게. | Check it carefully. | 仔细确认。 | Kiểm tra kỹ lưỡng. | 確認は丁寧に。
신청 조건은 공식 공고에서 | Check requirements in the official notice | 在正式公告确认申请条件 | Xem điều kiện trong thông báo chính thức | 申請条件は公式のお知らせで
지원 대상, 제출 서류, 신청 기간을 확인한 뒤 담당 기관의 안내에 따라 신청하세요. | Check eligibility, required documents, and application dates, then follow the responsible organization's instructions. | 确认支援对象、提交材料和申请期间，再按主管机构指引申请。 | Kiểm tra đối tượng, giấy tờ và thời gian đăng ký, rồi làm theo hướng dẫn của cơ quan phụ trách. | 支援対象・必要書類・申請期間を確認し、担当機関の案内に従って申請してください。
소득 기준은 계산기로 미리 | Preview income thresholds in the calculator | 用计算器提前查看收入标准 | Xem trước mức thu nhập trong máy tính | 所得基準は計算機で事前確認
가구원 수에 따른 중위소득 기준과 소득·재산 참고 결과를 살펴볼 수 있어요. 실제 심사 결과와는 다를 수 있어요. | View median-income thresholds by household size and reference calculations for income and assets. Actual assessment results may differ. | 可查看按家庭人数划分的收入中位数标准和收入财产参考结果，可能与实际审查结果不同。 | Xem mức thu nhập trung vị theo số thành viên hộ và kết quả tham khảo về thu nhập, tài sản. Kết quả xét duyệt thực tế có thể khác. | 世帯人数に応じた基準中位所得と所得・財産の参考結果を確認できます。実際の審査結果とは異なる場合があります。
계산기 살펴보기 | Explore the calculator | 查看计算器 | Xem máy tính | 計算機を見る
당신에게 닿아야 할 기회가 있으니까 | Because there are opportunities for you | 因为有属于您的机会 | Vì có những cơ hội dành cho bạn | あなたに届いてほしい機会があるから
이제, 나의 복지를 | Now it is your turn | 现在，轮到我 | Giờ đến lượt bạn | 今こそ、自分の福祉を
발견할 차례. | to discover your support. | 发现适合我的福利。 | khám phá phúc lợi phù hợp. | 見つけるとき。
첫걸음은 가볍게. 복지나침반과 함께 시작하세요. | Take an easy first step. Get started with Welfare Compass. | 轻松迈出第一步，与福利指南针一起开始。 | Bước đầu thật nhẹ nhàng. Bắt đầu cùng La bàn Phúc lợi. | 最初の一歩は気軽に。福祉コンパスと始めましょう。
맞춤 추천 시작하기 | Start personalized recommendations | 开始个性化推荐 | Bắt đầu gợi ý phù hợp | あなた向けのおすすめを始める
나를 위한 복지 길잡이, 복지나침반 | Your welfare guide, Welfare Compass | 为我提供福利指南，福利指南针 | Hướng dẫn phúc lợi của bạn, La bàn Phúc lợi | あなたの福祉ガイド、福祉コンパス
`
  .trim()
  .split("\n")
  .map((row) => row.split(" | "));

export const accountMessages = Object.fromEntries(
  [...rows, ...profileRows, ...privacyRows, ...guideRows].map(
    ([ko, en, zh, vi, ja]) => [ko, { en, zh, vi, ja }],
  ),
);

// Inline JSX fragments keep intentional surrounding spaces in every language.
const spacedSources = [
  " 홈으로 돌아가기",
  " 아이디로 로그인 ",
  "처음 방문하셨나요? ",
  " 숨기기",
  " 보기",
  " 개별 항목을 삭제하면 해당 정보를 더 이상 사용하지 않습니다.",
  "안내문 버전 ",
  " · 운영자 ",
  "생활 정보 ",
  "관심 분야 ",
  " 선택하지 않으면 새로고침할 때 입력 정보가 사라져요.",
  " 다음 방문에도 이 정보로 추천을 요청해요.",
  "미입력 · 추가하기 ",
  "정보 보기 ",
  "아이디 · ",
  " / 회원 정보는 계정에 저장돼요.",
  " 한 걸음씩 함께해요.",
  " · 공고 예시",
  "한결 더 ",
  "이미 가입하셨나요? ",
  " · 외부 AI 처리:",
  "회원정보는 ‘내 정보’에서 수정하거나 비울 수 있습니다. ‘내 정보’의 회원 탈퇴에서 계정, 저장한 금융정보, 카카오 연결정보, 동의 기록, 알림 설정과 기기 푸시 토큰을 즉시 삭제하고 모든 로그인 세션을 종료합니다. 개인정보 열람·정정·동의 철회에 관한 문의는 아래 이메일로 접수합니다: ",
];
for (const source of spacedSources) {
  const base = accountMessages[source.trim()];
  const leading = source.match(/^\s*/)[0];
  const trailing = source.match(/\s*$/)[0];
  accountMessages[source] = Object.fromEntries(
    Object.entries(base).map(([locale, text]) => [
      locale,
      leading + text + trailing,
    ]),
  );
}
const operatorIntro =
  "은 아래 목적과 범위에서 개인정보를 처리합니다. 필요한 항목만 선택해 주세요. 선택 항목에 동의하지 않아도 회원가입과 공고 탐색을 이용할 수 있습니다.";
accountMessages["{operator}" + operatorIntro] = Object.fromEntries(
  Object.entries(accountMessages[operatorIntro]).map(([locale, text]) => [
    locale,
    "{operator}" + (["en", "vi"].includes(locale) ? " " : "") + text,
  ]),
);
