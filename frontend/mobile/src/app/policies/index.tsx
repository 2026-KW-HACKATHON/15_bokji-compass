import { useI18n } from "../../i18n/context";
import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "../../components/Icon";
import { PolicyCard } from "../../features/policies/PolicyCard";
import {
  Button,
  Card,
  Choice,
  Copy,
  Field,
  Notice,
  Screen,
  PageHeading,
  colors,
} from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import {
  categories,
  regions,
  parsePolicyPage,
  searchScopes,
  searchScopeLabels,
} from "../../features/policies/model";
import {
  effectivePolicySort,
  searchRelationForScope,
} from "../../features/policies/searchMetadata";

const initialFilters = {
  query: "",
  searchScope: "all",
  searchMode: "smart",
  searchRelation: "",
  category: "전체",
  region: "전국",
  sort: "auto",
};
const sortLabels: Record<string, string> = {
  auto: "자동 (검색할 때 관련도순)",
  relevance: "관련도순",
  popular: "인기순 (조회수)",
  recent: "최근 등록순",
  name: "이름순",
};
const choiceLabels: Record<string, string> = {
  ...sortLabels,
  ...searchScopeLabels,
};
type Page = ReturnType<typeof parsePolicyPage>;

export default function PoliciesRoute() {
  const params = useLocalSearchParams<{
    q?: string;
    category?: string;
    searchKey?: string;
  }>();
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const category =
    typeof params.category === "string" && categories.includes(params.category)
      ? params.category
      : "전체";
  return (
    <Policies
      key={`${query}:${category}:${params.searchKey || ""}`}
      initialQuery={query}
      initialCategory={category}
    />
  );
}
function Policies({
  initialQuery,
  initialCategory,
}: {
  initialQuery: string;
  initialCategory: string;
}) {
  const { t } = useI18n();
  const { api, easy, configError } = useRuntime();
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState({
    ...initialFilters,
    query: initialQuery,
    category: initialCategory,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [paging, setPaging] = useState<{
    easy: boolean;
    cursors: (string | null)[];
  }>({ easy, cursors: [null] });
  if (paging.easy !== easy) setPaging({ easy, cursors: [null] });
  const cursors = paging.easy === easy ? paging.cursors : [null];
  const cursor = cursors[cursors.length - 1];
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([filters, cursor, easy, retry]);
  const [response, setResponse] = useState<{
    key: string;
    page: Page | null;
    error: string;
  } | null>(null);
  const current = response?.key === requestKey ? response : null;
  const page = current?.page;
  const error = configError || current?.error || "";
  const busy = !configError && !current;
  useEffect(() => {
    const controller = new AbortController();
    if (configError) return;
    api
      .listPolicies(
        { ...filters, cursor, limit: easy ? 3 : 6 },
        controller.signal,
      )
      .then((value) => {
        if (!controller.signal.aborted)
          setResponse({ key: requestKey, page: value, error: "" });
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setResponse({
            key: requestKey,
            page: null,
            error:
              err.status === 503
                ? "공고 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."
                : err.message,
          });
      });
    return () => controller.abort();
  }, [api, filters, cursor, easy, configError, requestKey]);
  function change(key: keyof typeof initialFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(["query", "searchScope"].includes(key)
        ? { searchMode: "smart", searchRelation: "" }
        : {}),
    }));
    setPaging({ easy, cursors: [null] });
  }
  function refine(searchRelation: string) {
    setFilters((current) => ({
      ...current,
      searchMode: "smart",
      searchScope: "all",
      searchRelation:
        current.searchRelation === searchRelation ? "" : searchRelation,
    }));
    setPaging({ easy, cursors: [null] });
  }
  function searchOriginal() {
    setFilters((current) => ({
      ...current,
      searchMode: "literal",
      searchScope: "all",
      searchRelation: "",
    }));
    setPaging({ easy, cursors: [null] });
  }
  function reset() {
    setQuery("");
    setFilters(initialFilters);
    setPaging({ easy, cursors: [null] });
  }
  function choices(
    label: string,
    values: string[],
    key: "category" | "region" | "sort" | "searchScope",
  ) {
    return (
      <View style={{ gap: 8 }}>
        <Copy>{label}</Copy>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {values.map((value) => (
            <Choice
              key={value}
              label={choiceLabels[value] ?? value}
              accessibilityLabel={t(
                key === "searchScope"
                  ? t("검색 범위 {scope}", { scope: t(choiceLabels[value]) })
                  : (choiceLabels[value] ?? value),
              )}
              selected={filters[key] === value}
              onPress={() => change(key, value)}
            />
          ))}
        </View>
      </View>
    );
  }
  return (
    <Screen key={JSON.stringify([filters, cursor, easy])}>
      <PageHeading
        title={easy ? "복지 공고 찾기" : "어떤 지원을 찾으세요?"}
        eyebrow="복지 공고"
        description={
          easy ? undefined : "지원 내용부터 신청 조건까지 한눈에 확인해요."
        }
      />
      <Card>
        <Field
          label="공고 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="예: 광운대 학생 장학금 찾아줘"
          maxLength={200}
          returnKeyType="search"
          onSubmitEditing={() => change("query", query)}
        />
        <Button label="검색" onPress={() => change("query", query)} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showFilters }}
          onPress={() => setShowFilters(!showFilters)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 48,
            justifyContent: "center",
          }}
        >
          <Icon name="filter" size={18} color={colors.muted} />
          <Text
            style={{
              fontSize: easy ? 19 : 14,
              color: colors.muted,
              fontWeight: "600",
            }}
          >
            {showFilters ? "상세 조건 접기" : "지역·검색 범위·정렬"}
          </Text>
        </Pressable>
      </Card>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        accessibilityLabel={t("공고 분야")}
      >
        {categories.map((category) => (
          <Choice
            key={category}
            label={category}
            selected={filters.category === category}
            onPress={() => change("category", category)}
          />
        ))}
      </ScrollView>
      {showFilters && (
        <Card>
          {choices("검색 범위", searchScopes, "searchScope")}
          <Copy muted>
            게시 기관은 공고를 올린 기관, 공고 내용은 제목과 본문에서 찾아요.
          </Copy>
          {choices("분야", categories, "category")}
          {choices("지역", regions, "region")}
          {choices(
            "정렬",
            ["auto", "relevance", "popular", "recent", "name"],
            "sort",
          )}
          <Button secondary label="검색 조건 지우기" onPress={reset} />
        </Card>
      )}
      {busy ? (
        <Notice>공고를 가져오고 있어요.</Notice>
      ) : error ? (
        <Card>
          <Notice>{error}</Notice>
          <Button
            label="다시 시도하기"
            onPress={() => setRetry((value) => value + 1)}
          />
        </Card>
      ) : (
        page && (
          <>
            {page.search?.originalQuery.trim() && (
              <Card>
                <View accessibilityLiveRegion="polite">
                  <Copy original>{page.search.summary}</Copy>
                </View>
                {page.search.corrections.length > 0 && (
                  <>
                    <Copy original muted>
                      {t("{corrections}로 찾았어요.", {
                        corrections: page.search.corrections
                          .map(({ from, to }) => `‘${from}’ → ‘${to}’`)
                          .join(", "),
                      })}
                    </Copy>
                    <Button
                      secondary
                      label="원래 검색어로 찾기"
                      onPress={searchOriginal}
                    />
                  </>
                )}
                {page.search.warnings.map((warning) => (
                  <Copy original muted key={warning}>
                    {warning}
                  </Copy>
                ))}
                {page.search.alternatives.map((item) => (
                  <Choice
                    key={item.scope}
                    label={t("{label} {count}개", {
                      label: item.label,
                      count: item.count,
                    })}
                    selected={
                      filters.searchRelation ===
                      searchRelationForScope(item.scope)
                    }
                    onPress={() => refine(searchRelationForScope(item.scope))}
                  />
                ))}
              </Card>
            )}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: easy ? 23 : 20,
                  fontWeight: "700",
                  color: colors.ink,
                }}
              >
                {t("찾은 공고")}{" "}
                <Text style={{ color: colors.green }}>
                  {t("{count}개", { count: page.total.toLocaleString() })}
                </Text>
              </Text>
              <Text style={{ color: colors.muted, fontSize: easy ? 17 : 13 }}>
                {t(filters.region)} ·{" "}
                {easy ? "" : t(sortLabels[effectivePolicySort(filters)])}
              </Text>
            </View>
            {!page.items.length ? (
              <Card>
                <Copy>조건에 맞는 공고가 없어요.</Copy>
                <Copy muted>
                  {easy
                    ? "다른 조건으로 찾아보세요."
                    : "검색 조건을 지워 보세요. 공개된 공고가 등록되면 여기에 표시됩니다."}
                </Copy>
                <Button secondary label="검색 조건 지우기" onPress={reset} />
              </Card>
            ) : (
              page.items.map((policy) => (
                <PolicyCard
                  key={policy.id}
                  policy={policy}
                  showReason={!!filters.query.trim()}
                />
              ))
            )}
            {(cursors.length > 1 || page.nextCursor) && (
              <Card>
                <Copy>{t("{page}번째 페이지", { page: cursors.length })}</Copy>
                <Button
                  secondary
                  label="이전 페이지"
                  disabled={cursors.length === 1}
                  onPress={() =>
                    setPaging({ easy, cursors: cursors.slice(0, -1) })
                  }
                />
                <Button
                  label="다음 페이지"
                  disabled={
                    !page.nextCursor || cursors.includes(page.nextCursor)
                  }
                  onPress={() =>
                    setPaging({ easy, cursors: [...cursors, page.nextCursor] })
                  }
                />
              </Card>
            )}
          </>
        )
      )}
    </Screen>
  );
}
