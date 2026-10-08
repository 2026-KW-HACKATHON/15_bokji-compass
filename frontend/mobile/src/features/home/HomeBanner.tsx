import { useI18n } from "../../i18n/context";
import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { colors } from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import { Icon } from "../../components/Icon";

const banners = [
  {
    title: "일상에 힘이 되는\n복지를 찾아요",
    shortTitle: "나에게 필요한\n복지 찾기",
    category: "생활을 더 든든하게",
    action: "복지 지원 알아보기",
    route: "/policies" as const,
    image: require("../../../assets/home/support.png"),
    color: "#E7F0E7",
  },
  {
    title: "우리 집 소득,\n어느 정도일까요?",
    shortTitle: "우리 집\n중위소득 계산",
    category: "궁금한 소득 기준",
    action: "소득 비율 확인하기",
    route: "/finance" as const,
    image: require("../../../assets/home/calculator.png"),
    color: "#F7EFDA",
  },
  {
    title: "저장한 내 정보,\n다시 입력하지 않게",
    shortTitle: "저장한 정보를\n다시 불러와요",
    category: "다음에도 편리하게",
    action: "내 계정 살펴보기",
    route: "/account" as const,
    image: require("../../../assets/home/account.png"),
    color: "#EEEAF6",
  },
];

// User-controlled paging keeps the copy still while reading (including easy mode).
export function HomeBanner() {
  const { t } = useI18n();
  const { easy } = useRuntime();
  const scroll = useRef<ScrollView>(null);
  const selected = useRef(0);
  const [frameWidth, setFrameWidth] = useState(0);
  // Paging must use the inner width, including when easy mode adds a border.
  const width = Math.max(0, frameWidth - (easy ? 3 : 0));
  const [index, setIndex] = useState(0);
  useEffect(() => {
    scroll.current?.scrollTo({ x: selected.current * width, animated: false });
  }, [width]);

  function select(next: number) {
    const value = (next + banners.length) % banners.length;
    selected.current = value;
    setIndex(value);
    scroll.current?.scrollTo({ x: value * width, animated: false });
  }

  return (
    <View onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.frame, easy && styles.easyFrame]}>
        {width > 0 && (
          <ScrollView
            ref={scroll}
            testID="home-banner-scroll"
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            directionalLockEnabled
            bounces={false}
            scrollEventThrottle={32}
            onScroll={(event) => {
              const next = Math.max(
                0,
                Math.min(
                  banners.length - 1,
                  Math.round(event.nativeEvent.contentOffset.x / width),
                ),
              );
              selected.current = next;
              setIndex(next);
            }}
          >
            {banners.map((banner, position) => (
              <Pressable
                key={banner.route}
                accessibilityRole="button"
                accessibilityLabel={t(banner.action)}
                accessibilityElementsHidden={position !== index}
                importantForAccessibility={
                  position === index ? "yes" : "no-hide-descendants"
                }
                aria-hidden={position !== index}
                tabIndex={position === index ? 0 : -1}
                onPress={() => router.navigate(banner.route)}
                style={({ pressed }) => [
                  styles.slide,
                  {
                    width,
                    backgroundColor: banner.color,
                    opacity: pressed ? 0.85 : 1,
                  },
                  easy && styles.easySlide,
                ]}
              >
                <View style={[styles.copy, easy && styles.easyCopy]}>
                  {!easy && (
                    <Text style={styles.category}>{banner.category}</Text>
                  )}
                  <Text style={[styles.title, easy && styles.easyTitle]}>
                    {easy ? banner.shortTitle : banner.title}
                  </Text>
                  <View style={[styles.actionRow, easy && styles.easyAction]}>
                    <Text
                      style={[
                        styles.action,
                        easy && { fontSize: 18, lineHeight: 27 },
                      ]}
                    >
                      자세히 보기
                    </Text>
                    <Icon name="arrow" size={18} color={colors.green} />
                  </View>
                </View>
                {!easy && (
                  <Image
                    source={banner.image}
                    accessible={false}
                    aria-hidden
                    resizeMode="cover"
                    style={styles.image}
                  />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      <View style={[styles.controls, easy && { justifyContent: "center" }]}>
        {!easy && (
          <View style={styles.dots} accessible={false} aria-hidden>
            {banners.map((banner, position) => (
              <View
                key={banner.route}
                style={[styles.dot, position === index && styles.activeDot]}
              />
            ))}
          </View>
        )}
        <View style={styles.paging}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("이전 배너")}
            onPress={() => select(index - 1)}
            style={styles.arrow}
          >
            {easy ? (
              <Text style={styles.easyPaging}>이전</Text>
            ) : (
              <Icon name="previous" size={18} />
            )}
          </Pressable>
          <Text
            accessibilityLabel={t("배너 {current} / {total}", {
              current: index + 1,
              total: banners.length,
            })}
            style={[
              styles.counter,
              easy && { fontSize: 17, marginHorizontal: 16 },
            ]}
          >
            {index + 1} / {banners.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("다음 배너")}
            onPress={() => select(index + 1)}
            style={styles.arrow}
          >
            {easy ? (
              <Text style={styles.easyPaging}>다음</Text>
            ) : (
              <Icon name="next" size={18} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 24, overflow: "hidden", backgroundColor: "#E7F0E7" },
  easyFrame: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.easyLine,
  },
  slide: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 196,
  },
  image: {
    width: "34%",
    height: 164,
    borderTopLeftRadius: 60,
    borderBottomLeftRadius: 60,
  },
  copy: {
    flex: 1,
    paddingLeft: 22,
    paddingRight: 8,
    paddingVertical: 22,
    gap: 10,
  },
  category: {
    color: "#486353",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  action: {
    color: colors.green,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  easyAction: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.green,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  easySlide: {
    minHeight: 152,
  },
  easyCopy: { flex: 1, paddingHorizontal: 18, paddingVertical: 16, gap: 6 },
  easyTitle: { fontSize: 22, lineHeight: 31, letterSpacing: 0 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 4,
  },
  dots: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#C0CCC4" },
  activeDot: { width: 20, backgroundColor: colors.green },
  paging: { flexDirection: "row", alignItems: "center" },
  arrow: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  easyPaging: { fontSize: 18, color: colors.green, fontWeight: "600" },
  counter: { color: colors.muted, fontSize: 13, fontVariant: ["tabular-nums"] },
});
