// @ts-nocheck
// Because this code is originally javascript code.
// noinspection FunctionTooLongJS,FunctionWithMultipleLoopsJS,EqualityComparisonWithCoercionJS,PointlessBooleanExpressionJS,JSDeclarationsAtScopeStart

const { readFileSync } = require('fs')

var replacements = {
    'a': ['ā', 'á', 'ǎ', 'à'],
    'e': ['ē', 'é', 'ě', 'è'],
    'u': ['ū', 'ú', 'ǔ', 'ù'],
    'i': ['ī', 'í', 'ǐ', 'ì'],
    'o': ['ō', 'ó', 'ǒ', 'ò'],
    'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ']
  };
  
  var medials = ['i', 'u', 'ü'];
  
  var prettify = function(str){
    str = str.replace('v', 'ü');
    var syllables = str.split(' ');
  
    for (var i = 0; i < syllables.length; i++){
      var syllable = syllables[i];
      var tone = parseInt(syllable[syllable.length-1]);
      
      if (tone <= 0 || tone > 5) {
        console.error('invalid tone number:', tone, 'in', syllable);
      } else if (tone === 5){
        syllables[i] = syllable.slice(0, syllable.length - 1);
      } else {
        for (var j = 0; j < syllable.length; j++){
          var currentLetter = syllable[j];
          var nextLetter = syllable[j + 1];
  
          // found a vowel
          if (replacements[currentLetter]){
            var replaced;
            var letterToReplace;
  
            // two consecutive vowels
            if (replacements[nextLetter] && medials.indexOf(currentLetter) >= 0){
              letterToReplace = nextLetter;
            } else {
              letterToReplace = currentLetter;
            }
  
            replaced = syllable.replace(letterToReplace, replacements[letterToReplace][tone - 1]);
            syllables[i] = replaced.slice(0, replaced.length - 1);
            break;
          }
        }  
      }
  
    }
    return syllables.join(' ');
  };

class Trie {
    constructor() {
        this.content = {}
    }

    getKeyObject(key, create = false) {
        key = key.toString()

        let chars = key === '' ? [key] : Array.from(key)
        let obj = this.content

        for (let char of chars) {
            if (obj[char] == null) {
                if (create) obj[char] = {}
                else return {}
            }

            obj = obj[char]
        }

        return obj
    }

    get(key) {
        let obj = this.getKeyObject(key)

        return obj.values || []
    }

    getPrefix(key) {
        let inner = (key, obj = null) => {
            if (obj == null) obj = this.getKeyObject(key)
            let result = obj.values ? [...obj.values] : []

            for (let char in obj) {
                if (char === 'values' || obj[char] == null) continue

                result.push(...inner(key + char, obj[char]))
            }

            return result
        }

        return inner(key)
    }

    push(key, value) {
        let obj = this.getKeyObject(key, true)

        if (obj.values == null) obj.values = []
        if (!obj.values.includes(value)) obj.values.push(value)

        return this
    }
}

function parseLine(line) {
    let match = line.match(/^(\S+)\s(\S+)\s\[([^\]]+)\]\s\/(.+)\//)
    if (match == null) return

    let [, traditional, simplified, pinyin, english] = match

    pinyin = pinyin.replace(/u:/g, 'ü')
    let pinyinPretty = prettify(pinyin)

    return { traditional, simplified, pinyin, pinyinPretty, english }
}

class Cedict {
    load(contents) {
        this.simplifiedTrie = new Trie()
        this.traditionalTrie = new Trie()

        let lines = contents.split('\n')

        for (let line of lines) {
            if (line.trim() === '' || line[0] === '#') continue

            let entry = parseLine(line)
            if (entry == null) continue

            this.simplifiedTrie.push(entry.simplified, entry)
            this.traditionalTrie.push(entry.traditional, entry)
        }
    }

    get(word, traditional = false) {
        return traditional ? this.traditionalTrie.get(word) : this.simplifiedTrie.get(word)
    }

    getPrefix(word, traditional = false) {
        return traditional ? this.traditionalTrie.getPrefix(word) : this.simplifiedTrie.getPrefix(word)
    }
}

const chinesePunctuation = [
    '·', '×', '—', '‘', '’', '“', '”', '…',
    '、', '。', '《', '》', '『', '』', '【', '】',
    '！', '（', '）', '，', '：', '；', '？'
]

ChTokenizer.prototype.loadFile = function(path) {
    return exports.load(readFileSync(path, 'utf-8'))
}

ChTokenizer.prototype.load = function(contents) {
    let dictionary = new Cedict()
    dictionary.load(contents)

    return function tokenize(text) {
        text = Array.from(text.replace(/\r/g, ''))

        let result = []
        let i = 0
        let [offset, line, column] = [0, 1, 1]
        let [simplifiedPreference, traditionalPreference] = [0, 0]

        let pushToken = word => {
            let simplifiedEntries = dictionary.get(word, false)
            let traditionalEntries = dictionary.get(word, true)

            let entries = simplifiedEntries.length === 0 ? traditionalEntries :
                traditionalEntries.length === 0 ? simplifiedEntries :
                simplifiedPreference < traditionalPreference ? traditionalEntries :
                simplifiedPreference > traditionalPreference ? simplifiedEntries : [...simplifiedEntries, ...traditionalEntries]

            if (traditionalEntries.length === 0 && simplifiedEntries.length > 0) {
                simplifiedPreference++
            } else if (simplifiedEntries.length === 0 && traditionalEntries.length > 0) {
                traditionalPreference++
            }

            result.push({
                text: word,
                traditional: entries[0] ? entries[0].traditional : word,
                simplified: entries[0] ? entries[0].simplified : word,

                position: {
                    offset,
                    line,
                    column
                },

                matches: entries.map(({ pinyin, pinyinPretty, english }) => ({
                    pinyin,
                    pinyinPretty,
                    english
                }))
            })

            let wordArr = Array.from(word)
            let lastLineBreakIndex = word.lastIndexOf('\n')

            i += wordArr.length
            offset += word.length
            line += wordArr.filter(x => x === '\n').length
            column = lastLineBreakIndex >= 0 ?
                word.length - lastLineBreakIndex :
                column + word.length
        }

        while (i < text.length) {
            // Try to match two or more characters

            if (i !== text.length - 1) {
                let getTwo = text.slice(i, i + 2).join('')
                let simplifiedEntries = dictionary.getPrefix(getTwo, false)
                let traditionalEntries = dictionary.getPrefix(getTwo, true)
                let foundWord = null
                let foundEntries = null

                for (let entries of[traditionalEntries, simplifiedEntries]) {
                    for (let entry of entries) {
                        let matchText = entries === traditionalEntries ? entry.traditional : entry.simplified
                        let word = text.slice(i, i + Array.from(matchText).length).join('')

                        if (
                            matchText === word &&
                            (
                                foundWord == null ||
                                Array.from(word).length > Array.from(foundWord).length
                            )
                        ) {
                            foundWord = word
                            foundEntries = entries
                        }
                    }
                }

                if (foundWord != null) {
                    pushToken(foundWord)

                    if (foundEntries === simplifiedEntries) {
                        simplifiedPreference++
                    } else if (foundEntries === traditionalEntries) {
                        traditionalPreference++
                    }

                    continue
                }
            }

            // If it fails, match one character

            let character = text[i]
            let isChinese = character =>
                chinesePunctuation.includes(character) ||
                dictionary.get(character, false).length > 0 ||
                dictionary.get(character, true).length > 0

            if (isChinese(character) || character.match(/\s/) != null) {
                pushToken(character)
                continue
            }

            // Handle non-Chinese characters

            let end = i + 1

            for (; end < text.length; end++) {
                if (text[end].match(/\s/) != null || isChinese(text[end])) break
            }

            let word = text.slice(i, end).join('')
            pushToken(word)
        }

        return result
    }
}

export default ChTokenizer;