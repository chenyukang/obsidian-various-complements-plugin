import {
  App,
  debounce,
  Debouncer,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  KeymapEventHandler,
  MarkdownView,
  Scope,
  TFile,
} from "obsidian";
import { caseIncludesWithoutSpace, lowerStartsWith } from "../util/strings";
import { createTokenizer, Tokenizer } from "../tokenizer/tokenizer";
import { TokenizeStrategy } from "../tokenizer/TokenizeStrategy";
import { Settings } from "../settings";
import { CustomDictionaryService, Word } from "../CustomDictionaryService";
import { uniq } from "../util/collection-helper";
import { AppHelper } from "../app-helper";

function suggestWords(words: Word[], query: string, max: number): Word[] {
  return Array.from(words)
    .filter((x) => x.value !== query)
    .filter(
      (x) =>
        caseIncludesWithoutSpace(x.value, query) ||
        x.aliases?.some((a) => caseIncludesWithoutSpace(a, query))
    )
    .sort((a, b) => a.value.length - b.value.length)
    .sort(
      (a, b) =>
        Number(lowerStartsWith(b.value, query)) -
        Number(lowerStartsWith(a.value, query))
    )
    .slice(0, max);
}

// This is an unsafe code..!!
interface UnsafeEditorSuggestInterface {
  scope: Scope & { keys: (KeymapEventHandler & { func: CallableFunction })[] };
  suggestions: {
    selectedItem: number;
    useSelectedItem(ev: Partial<KeyboardEvent>): void;
  };
}

export class AutoCompleteSuggest
  extends EditorSuggest<Word>
  implements UnsafeEditorSuggestInterface
{
  app: App;
  settings: Settings;
  customDictionaryService: CustomDictionaryService;
  appHelper: AppHelper;

  currentFileTokens: string[] = [];
  internalLinkTokens: Word[] = [];
  tokenizer: Tokenizer;
  debounceGetSuggestions: Debouncer<
    [EditorSuggestContext, (tokens: Word[]) => void]
  >;
  debounceClose: Debouncer<[]>;

  disabled: boolean;

  // unsafe!!
  scope: UnsafeEditorSuggestInterface["scope"];
  suggestions: UnsafeEditorSuggestInterface["suggestions"];

  keymapEventHandler: KeymapEventHandler[] = [];

  private constructor(
    app: App,
    customDictionaryService: CustomDictionaryService
  ) {
    super(app);
    this.appHelper = new AppHelper(app);
    this.customDictionaryService = customDictionaryService;
  }

  static async new(app: App, settings: Settings): Promise<AutoCompleteSuggest> {
    const ins = new AutoCompleteSuggest(
      app,
      new CustomDictionaryService(
        app,
        settings.customDictionaryPaths.split("\n").filter((x) => x)
      )
    );

    await ins.updateSettings(settings);

    await ins.refreshCurrentFileTokens();
    await ins.refreshCustomDictionaryTokens();
    ins.refreshInternalLinkTokens();

    app.vault.on("modify", async (_) => {
      await ins.refreshCurrentFileTokens();
    });
    app.workspace.on("active-leaf-change", async (_) => {
      await ins.refreshCurrentFileTokens();
      ins.refreshInternalLinkTokens();
    });

    return ins;
  }

  get tokenizerStrategy(): TokenizeStrategy {
    return TokenizeStrategy.fromName(this.settings.strategy);
  }

  get minNumberTriggered(): number {
    return (
      this.settings.minNumberOfCharactersTriggered ||
      this.tokenizerStrategy.triggerThreshold
    );
  }

  get words(): Word[] {
    const currentFileWords = this.currentFileTokens
      .filter((x) => !this.customDictionaryService.wordsByValue[x])
      .map((x) => ({ value: x }));

    return [
      ...currentFileWords,
      ...this.customDictionaryService.words,
      ...this.internalLinkTokens,
    ];
  }

  toggleEnabled(): void {
    this.disabled = !this.disabled;
  }

  async updateSettings(settings: Settings) {
    this.settings = settings;
    this.customDictionaryService.updatePaths(
      settings.customDictionaryPaths.split("\n").filter((x) => x)
    );
    this.tokenizer = createTokenizer(this.tokenizerStrategy);

    this.debounceGetSuggestions = debounce(
      (context: EditorSuggestContext, cb: (words: Word[]) => void) => {
        const start = performance.now();
        cb(
          suggestWords(
            this.words,
            context.query,
            this.settings.maxNumberOfSuggestions
          )
        );
        this.showDebugLog("Get suggestions", performance.now() - start);
      },
      this.settings.delayMilliSeconds,
      true
    );

    this.debounceClose = debounce(() => {
      this.close();
    }, this.settings.delayMilliSeconds + 50);

    // new
    this.keymapEventHandler.forEach((x) => this.scope.unregister(x));
    this.keymapEventHandler = [
      this.scope.register([], "Tab", () => {
        this.suggestions.useSelectedItem({});
        return false;
      }),
    ];

    // overwrite
    this.scope.keys.find((x) => x.key === "Escape")!.func = () => {
      this.close();
      return this.settings.propagateEsc;
    };
  }

  async refreshCurrentFileTokens(): Promise<void> {
    const start = performance.now();

    if (!this.settings.enableCurrentFileComplement) {
      this.currentFileTokens = [];
      this.showDebugLog(
        "👢 Skip: Index current file tokens",
        performance.now() - start
      );
      return;
    }

    this.currentFileTokens = await this.pickTokens();
    this.showDebugLog("Index current file tokens", performance.now() - start);
  }

  async refreshCustomDictionaryTokens(): Promise<void> {
    const start = performance.now();

    if (!this.settings.enableCustomDictionaryComplement) {
      this.customDictionaryService.clearTokens();
      this.showDebugLog(
        "👢Skip: Index custom dictionary tokens",
        performance.now() - start
      );
      return;
    }

    await this.customDictionaryService.refreshCustomTokens();
    this.showDebugLog(
      "Index custom dictionary tokens",
      performance.now() - start
    );
  }

  refreshInternalLinkTokens(): void {
    const start = performance.now();

    if (!this.settings.enableInternalLinkComplement) {
      this.internalLinkTokens = [];
      this.showDebugLog(
        "👢Skip: Index internal link tokens",
        performance.now() - start
      );
      return;
    }

    const resolvedInternalLinkTokens = this.app.vault
      .getMarkdownFiles()
      .map((x) => ({
        value: `[[${x.basename}]]`,
        aliases: [x.basename, ...this.appHelper.getAliases(x)],
        description: x.path,
      }));

    const unresolvedInternalLinkTokens = this.appHelper
      .searchPhantomLinks()
      .map((x) => ({
        value: `[[${x}]]`,
        aliases: [x],
        description: "Not created yet",
      }));

    this.showDebugLog("Index internal link tokens", performance.now() - start);

    this.internalLinkTokens = [
      ...resolvedInternalLinkTokens,
      ...unresolvedInternalLinkTokens,
    ];
  }

  async pickTokens(): Promise<string[]> {
    if (!this.app.workspace.getActiveViewOfType(MarkdownView)) {
      return [];
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) {
      return [];
    }

    const content = await this.app.vault.cachedRead(file);
    return uniq(this.tokenizer.tokenize(content));
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile
  ): EditorSuggestTriggerInfo | null {
    if (this.disabled) {
      return null;
    }

    const currentChar = editor.getRange(
      { line: cursor.line, ch: cursor.ch - 1 },
      cursor
    );
    if (currentChar.match(this.tokenizer.getTrimPattern())) {
      return null;
    }

    const currentToken = this.tokenizer
      .tokenize(editor.getLine(cursor.line).slice(0, cursor.ch))
      .last();
    if (!currentToken || currentToken.length < this.minNumberTriggered) {
      return null;
    }

    return {
      start: {
        ch: cursor.ch - currentToken.length,
        line: cursor.line,
      },
      end: cursor,
      query: currentToken,
    };
  }

  getSuggestions(context: EditorSuggestContext): Word[] | Promise<Word[]> {
    return new Promise((resolve) => {
      this.debounceGetSuggestions(context, (words) => {
        resolve(words);
      });
    });
  }

  renderSuggestion(word: Word, el: HTMLElement): void {
    const base = createDiv();
    base.createDiv({ text: word.value });

    if (word.description) {
      base.createDiv({
        cls: "various-complements__suggest__description",
        text: word.description,
      });
    }

    el.appendChild(base);
  }

  selectSuggestion(word: Word, evt: MouseEvent | KeyboardEvent): void {
    if (this.context) {
      this.context.editor.replaceRange(
        word.value,
        this.context.start,
        this.context.end
      );
      this.close();
      this.debounceClose();
    }
  }

  private showDebugLog(message: string, msec: number) {
    if (this.settings.showLogAboutPerformanceInConsole) {
      console.log(`${message}: ${Math.round(msec)}[ms]`);
    }
  }
}
