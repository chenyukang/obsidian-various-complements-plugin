import { ArabicTokenizer } from "./tokenizers/ArabicTokenizer";
import { DefaultTokenizer } from "./tokenizers/DefaultTokenizer";
import { JapaneseTokenizer } from "./tokenizers/JapaneseTokenizer";
import { ChineseTokenizer } from "./tokenizers/ChineseTokenizer";
import { TokenizeStrategy } from "./TokenizeStrategy";

export interface Tokenizer {
  tokenize(content: string): string[];
  getTrimPattern(): RegExp;
  shouldIgnore(query: string): boolean;
}

export function createTokenizer(strategy: TokenizeStrategy): Tokenizer {
  switch (strategy.name) {
    case "default":
      return new DefaultTokenizer();
    case "arabic":
      return new ArabicTokenizer();
    case "japanese":
      return new JapaneseTokenizer();
    case "chinese":
      return new ChineseTokenizer();
    default:
      throw new Error(`Unexpected strategy name: ${strategy}`);
  }
}
