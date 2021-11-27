import { TRIM_CHAR_PATTERN } from "./DefaultTokenizer";
import { Tokenizer } from "../tokenizer";
import ChTokenizer from "../../external/chinese-tokenizer";
// @ts-ignore

const segmenter = new ChTokenizer();

function pickTokensAsChinese(content: string, trimPattern: RegExp): string[] {
  let res = content
    .split(trimPattern)
    .filter((x) => x !== "")
    .flatMap<string>((x) => segmenter.load(x));
    console.log("res: ", res);
    return res;
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
    return false;
  }

  /* shouldIgnore(str: string): boolean {
    return Boolean(str.match(/^[ａ-ｚＡ-Z。、 ]*$/));
  }
 */
  /* shouldIgnore(str: string): boolean {
    return Boolean(str.match(/^[ぁ-んａ-ｚＡ-Ｚ。、ー　]*$/));
  } */
}
