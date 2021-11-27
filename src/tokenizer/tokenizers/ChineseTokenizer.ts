import { TRIM_CHAR_PATTERN } from "./DefaultTokenizer";
import { Tokenizer } from "../tokenizer";
// @ts-ignore
const nodejieba = require("nodejieba");

function pickTokensAsChinese(content: string, trimPattern: RegExp): string[] {
  return content
    .split(trimPattern)
    .filter((x) => x !== "")
    .flatMap<string>((x) => nodejieba.cut(x));
}

/**
 * Chinese needs original logic.
 */
export class ChineseTokenizer implements Tokenizer {
  tokenize(content: string): string[] {
    return pickTokensAsChinese(content, this.getTrimPattern());
  }

  getTrimPattern(): RegExp {
    return TRIM_CHAR_PATTERN;
  }

  shouldIgnore(str: string): boolean {
    return Boolean(str.match(/^[ａ-ｚＡ-Z]*$/));
  }
}
