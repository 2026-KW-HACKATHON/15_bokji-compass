import { useI18n } from "../../i18n/context";
import { View } from "react-native";
import {
  Button,
  Card,
  Copy,
  Notice,
  Toggle,
  colors,
} from "../../components/ui";
import { useSession } from "../../services/runtime";
import { useNotifications } from "./context";
import { notificationTypes } from "./model";

export function NotificationSettings() {
  const { t } = useI18n();
  const auth = useSession();
  const settings = useNotifications();
  const { permission, preferences, loading, saving } = settings;
  const unavailable = loading || saving;
  return (
    <Card>
      <Copy title>푸시 알림 설정</Copy>
      <Copy muted>받고 싶은 소식만 골라 주세요. 설정은 계정에 저장돼요.</Copy>
      {permission?.supported === false ? (
        <Notice>
          이 화면에서는 계정 설정을 바꿀 수 있어요. 푸시 알림은 안드로이드·iOS
          앱에서 받을 수 있어요.
        </Notice>
      ) : permission ? (
        <>
          <Copy>
            {t("기기 알림 권한: {status}", {
              status: t(permission.granted ? "허용됨" : "허용 안 됨"),
            })}
          </Copy>
          {!permission.granted && (
            <Button
              label={
                permission.canAskAgain
                  ? "기기 알림 허용하기"
                  : "기기 알림 설정 열기"
              }
              secondary
              disabled={unavailable}
              onPress={() =>
                void (permission.canAskAgain
                  ? settings.requestPermission()
                  : settings.openSettings())
              }
            />
          )}
          {permission.granted && (
            <Button
              label="기기별 알림·소리 설정"
              secondary
              onPress={() => void settings.openSettings()}
            />
          )}
        </>
      ) : null}
      {auth.status !== "signedIn" ? (
        <Copy>로그인하면 전체 수신과 알림 종류를 선택할 수 있어요.</Copy>
      ) : loading ? (
        <Notice>알림 설정을 확인하고 있어요.</Notice>
      ) : preferences ? (
        <>
          <SettingRow
            title="전체 푸시 알림"
            description="끄면 모든 종류의 푸시 알림을 받지 않아요."
            value={preferences.enabled}
            disabled={unavailable}
            onChange={(value) => void settings.save("enabled", value)}
          />
          {!preferences.enabled && (
            <Copy muted>
              개별 선택은 유지돼요. 전체 수신을 켜면 선택한 소식만 받아요.
            </Copy>
          )}
          {notificationTypes.map((type) => (
            <SettingRow
              key={type.key}
              title={type.title}
              description={type.description}
              value={preferences[type.key as keyof typeof preferences]}
              disabled={unavailable}
              onChange={(value) =>
                void settings.save(type.key as keyof typeof preferences, value)
              }
            />
          ))}
          {saving && <Notice>알림 설정을 저장하고 있어요.</Notice>}
          {settings.saved && !saving && (
            <Copy muted>알림 설정을 저장했어요.</Copy>
          )}
        </>
      ) : null}
      {settings.error ? <Notice>{settings.error}</Notice> : null}
      {settings.deliveryWarning ? (
        <Notice>{settings.deliveryWarning}</Notice>
      ) : null}
      {auth.status === "signedIn" &&
        !!(settings.error || settings.deliveryWarning) && (
          <Button
            label="다시 확인"
            secondary
            disabled={unavailable}
            onPress={settings.retry}
          />
        )}
    </Card>
  );
}

function SettingRow({
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View
      style={{
        gap: 12,
        minHeight: 64,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Toggle
        label={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
      <Copy muted>{description}</Copy>
    </View>
  );
}
