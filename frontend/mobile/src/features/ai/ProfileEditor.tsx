import { useState } from "react";
import { View } from "react-native";
import {
  Button,
  Card,
  Copy,
  Details,
  Field,
  Notice,
  useScreenStep,
} from "../../components/ui";
import { categories } from "../policies/model";
import { Consent, Options } from "./controls";
import {
  disasterTypes,
  emptyMonitoringProfile,
  households,
  housingTenures,
  housingTypes,
  monitoringOccupations,
  parseMonitoringProfile,
} from "./monitoringModel";
import { LifeProfile } from "./types";

export function ProfileEditor({
  profile,
  enabled: initialEnabled,
  busy,
  onSave,
  onCancel,
}: {
  profile: LifeProfile | null;
  enabled: boolean;
  busy: boolean;
  onSave: (profile: LifeProfile, enabled: boolean, consent: boolean) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<LifeProfile>(() => ({
    ...(profile || emptyMonitoringProfile),
    interests: [...(profile?.interests || [])],
  }));
  const [year, setYear] = useState(String(profile?.building_year ?? ""));
  const [enabled, setEnabled] = useState(initialEnabled);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  useScreenStep("life-profile");
  const change = (field: keyof LifeProfile, value: unknown) => {
    setDraft((old) => ({ ...old, [field]: value }));
    setConsent(false);
    setError("");
  };
  const select = (
    field: keyof LifeProfile,
    label: string,
    options: string[][],
  ) => (
    <Options
      label={label}
      value={draft[field]}
      disabled={busy}
      options={[[null, "모름·선택 안 함"], ...(options as [string, string][])]}
      onChange={(value) => change(field, value)}
    />
  );
  const boolean = (field: keyof LifeProfile, label: string) => (
    <Options
      label={label}
      value={draft[field]}
      disabled={busy}
      options={[
        [null, "모름"],
        [true, "예"],
        [false, "아니요"],
      ]}
      onChange={(value) => change(field, value)}
    />
  );
  return (
    <Card>
      <Copy title>내 생활정보</Copy>
      <Copy muted>
        아는 내용만 입력해 주세요. 모르는 정보는 비워 둘 수 있어요.
      </Copy>
      <Details collapsible label="일과 가족">
        {select(
          "occupation",
          "일·학업 상태",
          monitoringOccupations.map((value) => [value, value]),
        )}
        {select(
          "household",
          "함께 사는 사람",
          households.slice(1).map((value) => [value, value]),
        )}
        {boolean("job_seeking", "현재 구직 중인가요?")}
      </Details>
      <Details collapsible label="주거 상황">
        {select("housing_tenure", "소유·거주 형태", housingTenures)}
        {select("housing_type", "주택 종류", housingTypes)}
        <Field
          label="주택 준공연도"
          value={year}
          onChangeText={(value) => {
            setYear(value);
            setConsent(false);
          }}
          placeholder="예: 1995 · 모르면 비워 두세요"
          keyboardType="number-pad"
          maxLength={4}
          editable={!busy}
        />
        {boolean("repair_needed", "주택 수리가 필요한가요?")}
      </Details>
      <Details collapsible label="직접 확인한 재난 피해">
        <Copy muted>
          같은 지역에 재난이 발생했어도 내 피해 여부는 따로 확인해요.
        </Copy>
        {select("disaster_type", "재난 종류", disasterTypes)}
        {boolean("disaster_damage", "직접 재난 피해를 입었나요?")}
        <Field
          label="피해 발생일"
          value={draft.disaster_occurred_on || ""}
          onChangeText={(value) =>
            change("disaster_occurred_on", value || null)
          }
          placeholder="YYYY-MM-DD · 모르면 비워 두세요"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
          editable={!busy}
        />
      </Details>
      <Details collapsible label="관심 분야">
        <View style={{ gap: 8 }}>
          {categories.slice(1).map((category) => (
            <Consent
              key={category}
              label={category}
              value={draft.interests.includes(category)}
              disabled={busy}
              onChange={(checked) =>
                change(
                  "interests",
                  checked
                    ? [...draft.interests, category]
                    : draft.interests.filter((item) => item !== category),
                )
              }
            />
          ))}
        </View>
      </Details>
      <Consent
        label="새 공고와 변경 내용을 계속 안내받기"
        value={enabled}
        disabled={busy}
        onChange={(value) => {
          setEnabled(value);
          setConsent(false);
        }}
      />
      <Copy muted>
        켜면 저장한 상황으로 등록된 공고를 비교해 새 안내를 이 화면에 모아요.
        언제든 중지하거나 삭제할 수 있어요.
      </Copy>
      <Consent
        label="생활정보를 계정에 저장하고 복지 안내에 사용하는 데 동의해요."
        value={consent}
        disabled={busy}
        onChange={setConsent}
      />
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="생활정보와 안내 설정 저장"
        disabled={!consent || busy}
        busy={busy}
        onPress={() => {
          try {
            if (year && !/^\d{4}$/.test(year))
              throw new Error("준공연도는 네 자리 숫자로 입력해 주세요.");
            const value = parseMonitoringProfile({
              ...draft,
              building_year: year ? Number(year) : null,
            }) as LifeProfile;
            onSave(value, enabled, consent);
          } catch (failure) {
            setError((failure as Error).message);
          }
        }}
      />
      <Button secondary label="수정 취소" disabled={busy} onPress={onCancel} />
    </Card>
  );
}
