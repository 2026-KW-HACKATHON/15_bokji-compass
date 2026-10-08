import { router } from "expo-router";
import {
  Button,
  Card,
  Copy,
  Details,
  Notice,
  Screen,
  PageHeading,
} from "../components/ui";
import { useRuntime, useSession } from "../services/runtime";
import { NotificationSettings } from "../features/notifications/NotificationSettings";
import { AccountAccess } from "../features/auth/AccountAccess";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { useI18n } from "../i18n/context";

export default function Account() {
  const { t } = useI18n();
  const { session, configError, easy } = useRuntime();
  const state = useSession();
  return (
    <Screen>
      <PageHeading
        title="내 계정"
        eyebrow="나의 복지나침반"
        description={easy ? undefined : "저장한 정보와 알림을 관리해요."}
      />
      <Card>
        <LanguageSelector />
      </Card>
      {configError ? (
        <Notice>{configError}</Notice>
      ) : state.status === "signedIn" ? (
        <Card>
          <Copy original title>
            {t("{name}님", {
              name: state.user?.name || state.user?.username || "",
            })}
          </Copy>
          <Copy>웹과 같은 계정으로 연결됐어요.</Copy>
          <Button
            label="금융정보 불러오러 가기"
            onPress={() => router.navigate("/finance")}
          />
          <Button
            secondary
            label="로그아웃"
            onPress={() => void session.logout()}
          />
        </Card>
      ) : state.status === "blocked" ? (
        <Card>
          <Copy>로그인 상태를 다시 확인해 주세요.</Copy>
          <Button label="다시 확인" onPress={() => void session.restore()} />
        </Card>
      ) : state.status === "restoring" || state.status === "signingOut" ? (
        <Notice>로그인 상태를 확인하고 있어요.</Notice>
      ) : (
        <AccountAccess />
      )}
      {state.error ? <Notice>{state.error}</Notice> : null}
      <NotificationSettings />
      <Details label="저장 정보 안내">
        <Copy muted>
          로그인하면 계산기에서 저장한 금융정보를 자동으로 불러와요. 작성 중인
          입력은 유지하고, 수정한 정보는 동의 후 저장 버튼을 눌러야 반영됩니다.
        </Copy>
      </Details>
    </Screen>
  );
}
