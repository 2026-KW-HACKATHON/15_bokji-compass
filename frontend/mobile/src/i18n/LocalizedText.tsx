import React from "react";
import { StyleSheet, Text as NativeText, TextProps } from "react-native";
import { useI18n } from "./context";
import { useRuntime } from "../services/runtime";

/** original=true is mandatory for policy, AI, server prose and user content. */
export function LocalizedText({
  children,
  original = false,
  ...props
}: TextProps & { original?: boolean }) {
  const { t } = useI18n();
  const { easy } = useRuntime();
  const style = StyleSheet.flatten(props.style);
  const fontSize = Math.max(20, style?.fontSize ?? 20);
  const pieces = React.Children.toArray(children);
  const content = original
    ? children
    : pieces.every(
          (child) => typeof child === "string" || typeof child === "number",
        )
      ? t(pieces.join(""))
      : pieces.map((child) => (typeof child === "string" ? t(child) : child));
  return (
    <NativeText
      {...props}
      allowFontScaling={props.allowFontScaling ?? true}
      style={[
        props.style,
        easy && {
          fontSize,
          lineHeight: Math.max(fontSize * 1.5, style?.lineHeight ?? 0),
          letterSpacing: Math.max(0, style?.letterSpacing ?? 0),
          flexShrink: 1,
        },
      ]}
      accessibilityLabel={
        original
          ? props.accessibilityLabel
          : props.accessibilityLabel && t(props.accessibilityLabel)
      }
    >
      {content}
    </NativeText>
  );
}
