import type { GameConfig } from "@mashedgames/shared";
import type { CSSProperties } from "react";

type StyleKeyOptions = {
  colorKey?: keyof GameConfig;
  boldKey?: keyof GameConfig;
  italicKey?: keyof GameConfig;
  underlineKey?: keyof GameConfig;
  defaultColor?: string;
  defaultWeight?: string;
};

export function overlayTextStyle(
  config: GameConfig,
  options: StyleKeyOptions,
): CSSProperties {
  const color =
    (options.colorKey && typeof config[options.colorKey] === "string"
      ? (config[options.colorKey] as string)
      : undefined) ?? options.defaultColor ?? "#ffffff";

  const bold = options.boldKey ? Boolean(config[options.boldKey]) : false;
  const italic = options.italicKey ? Boolean(config[options.italicKey]) : false;
  const underline = options.underlineKey
    ? Boolean(config[options.underlineKey])
    : false;

  return {
    color,
    fontWeight: bold ? "bold" : options.defaultWeight,
    fontStyle: italic ? "italic" : undefined,
    textDecoration: underline ? "underline" : undefined,
  };
}
