import React from "react";
import { Text as NativeText, TextProps } from "react-native";
import { useI18n } from "./context";

/** original=true is mandatory for policy, AI, server prose and user content. */
export function LocalizedText({
  children,
  original = false,
  ...props
}: TextProps & { original?: boolean }) {
  const { t } = useI18n();
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
