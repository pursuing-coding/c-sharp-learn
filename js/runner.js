/**
 * runner.js — C# 代码在线运行器（本地轻量模拟执行）
 * 把 C# 代码翻译成等价 JS 后用 Function 执行
 */
function createSimulator() {

    async function run(code, inputs) {
        try {
            return simulate(code, inputs || []);
        } catch (e) {
            return { output: '【运行错误】' + (e.message || String(e)), status: 'error' };
        }
    }

    function simulate(csharpCode, inputs) {
        const translated = translateToJs(csharpCode);
        const output = [];
        let outputLength = 0;
        function write(args, suffix) {
            const text = args.map(formatArg).join('') + suffix;
            outputLength += text.length;
            if (outputLength > 20_000) throw new Error('输出超过 20,000 字符');
            output.push(text);
        }
        const __out = (...args) => write(args, '\n');
        const __outNoNl = (...args) => write(args, '');

        // Console.ReadLine support: __readline() returns next input from queue
        let inputIndex = 0;
        const needsInput = Symbol('needsInput');
        const __readline = () => {
            if (inputIndex < inputs.length) return inputs[inputIndex++];
            throw needsInput;
        };

        try {
            const fn = new Function('__out', '__outNoNl', '__readline', '__intDiv', '__parseInt', '__parseDouble', '__format', '__join', '__replace', translated.code);
            fn(__out, __outNoNl, __readline, intDivide, parseInt32, parseDouble, formatArg, (separator, values) => values.join(separator), replaceString);
        } catch (e) {
            if (e === needsInput) return { output: output.join(''), status: 'input' };
            output.push('【运行时错误】' + (e.message || String(e)) + '\n');
            return { output: output.join(''), status: 'error' };
        }
        return { output: output.join(''), status: 'success' };
    }

    function intDivide(left, right) {
        if (right === 0) throw new Error('整数不能除以 0');
        return Math.trunc(left / right);
    }

    function parseInt32(value) {
        if (!/^[+-]?\d+$/.test(String(value ?? '').trim())) throw new Error('输入不是有效的整数');
        const number = Number(value);
        if (number < -2147483648 || number > 2147483647) throw new Error('整数超出 int 范围');
        return number;
    }

    function parseDouble(value) {
        const text = String(value ?? '').trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new Error('输入不是有效的数字');
        return Number(text);
    }

    function replaceString(text, search, replacement) {
        if (!search) throw new Error('查找的字符串不能为空');
        return text.replaceAll(search, () => replacement ?? '');
    }

    function formatArg(v) {
        if (v === null || v === undefined) return '';
        if (typeof v === 'boolean') return v ? 'True' : 'False';
        return String(v);
    }

    // ===== Translation Pipeline =====
    function translateToJs(code) {
        let js = code;

        // 1. Strip comments
        js = stripComments(js);

        // 2. Strip using statements
        js = js.replace(/^\s*using\s+[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*;\s*/gm, '');

        // 3. Extract ALL class blocks, translate each to JS class
        const classBlocks = extractAllClasses(js);

        // 4. Find the "Program" class (has Main), extract Main body
        let mainBody = null;
        let otherCode = '';
        for (const cb of classBlocks) {
            if (cb.isProgram) {
                mainBody = cb.mainBody;
            }
            otherCode += cb.jsCode + '\n';
        }

        // 5. Translate Main body
        if (mainBody === null && classBlocks.length) throw new Error('没有找到 Main 方法');
        const mainJs = translateStatements(mainBody ?? js);

        // 6. Translate other class code (methods already translated in extractAllClasses)
        // But we still need to translate statements inside method bodies that weren't handled
        // Actually extractAllClasses already calls translateStatements on method bodies

        const finalJs = `${otherCode}\n${mainJs}`;
        return { code: finalJs };
    }

    // ===== Extract All Classes =====
    function extractAllClasses(code) {
        const blocks = [];

        // First, strip out interface blocks entirely (JS doesn't need them)
        // Use regex to find `interface Name { ... }` and remove them
        let codeWithoutInterfaces = code;
        const ifaceRegex = /\binterface\s+\w+\s*\{/g;
        let im;
        let declarationText = maskLiterals(codeWithoutInterfaces);
        while ((im = ifaceRegex.exec(declarationText)) !== null) {
            const braceStart = im.index + im[0].length - 1;
            const braceEnd = findMatchingBrace(codeWithoutInterfaces, braceStart);
            if (braceEnd === -1) break;
            codeWithoutInterfaces =
                codeWithoutInterfaces.substring(0, im.index) +
                codeWithoutInterfaces.substring(braceEnd + 1);
            declarationText = maskLiterals(codeWithoutInterfaces);
            ifaceRegex.lastIndex = im.index;
        }

        // Also strip enum blocks (JS doesn't need them, but enum variable usage should still work)
        // Actually keep enums — they become objects. Skip for now.

        // Also strip `: InterfaceName` from class declarations where base is an interface
        // (interfaces were already removed, so any remaining base class name that doesn't
        //  have a class definition is an interface)
        const knownClasses = new Set();
        const classScanRegex = /\bclass\s+(\w+)/g;
        let scm;
        while ((scm = classScanRegex.exec(declarationText)) !== null) knownClasses.add(scm[1]);

        let m;

        // Parse each class, collect its fields
        const classFields = {}; // className → [field names]
        const classRegex2 = /\bclass\s+(\w+)(?:\s*:\s*(\w+))?\s*\{/g;
        while ((m = classRegex2.exec(declarationText)) !== null) {
            const className = m[1];
            let baseClass = m[2] || null;
            // If base is not a known class, it's an interface — strip it
            if (baseClass && !knownClasses.has(baseClass)) baseClass = null;
            const braceStart = m.index + m[0].length - 1;
            const braceEnd = findMatchingBrace(codeWithoutInterfaces, braceStart);
            if (braceEnd === -1) continue;
            const body = codeWithoutInterfaces.substring(braceStart + 1, braceEnd);
            const fields = [];
            body.replace(/public\s+(?:int|double|string|bool|char)\s+(\w+)\s*;/g, (match, name) => { fields.push(name); return ''; });
            classFields[className] = { own: fields, base: baseClass };
            classRegex2.lastIndex = braceEnd + 1;
        }

        // Now actually translate each class
        const classRegex3 = /\bclass\s+(\w+)(?:\s*:\s*(\w+))?\s*\{/g;
        while ((m = classRegex3.exec(declarationText)) !== null) {
            const className = m[1];
            let baseClass = m[2] || null;
            if (baseClass && !knownClasses.has(baseClass)) baseClass = null;
            const braceStart = m.index + m[0].length - 1;
            const braceEnd = findMatchingBrace(codeWithoutInterfaces, braceStart);
            if (braceEnd === -1) continue;
            const body = codeWithoutInterfaces.substring(braceStart + 1, braceEnd);

            // Collect all accessible fields (own + inherited from base chain)
            const accessibleFields = [];
            let curClass = className;
            const seen = new Set();
            while (curClass && classFields[curClass] && !seen.has(curClass)) {
                seen.add(curClass);
                classFields[curClass].own.forEach(f => { if (!accessibleFields.includes(f)) accessibleFields.push(f); });
                curClass = classFields[curClass].base;
            }

            const isProgram = /\bstatic\s+(?:void|int)\s+Main\s*\(/.test(maskLiterals(body));
            const result = parseClassBody(body, className, baseClass, isProgram, accessibleFields);
            blocks.push(result);
            classRegex3.lastIndex = braceEnd + 1;
        }
        return blocks;
    }

    function parseClassBody(body, className, baseClass, isProgram, accessibleFields) {
        let mainBody = '';
        let jsCode = '';

        // Extract public fields (own fields only — inherited handled via accessibleFields)
        const fields = [];
        let stripped = body.replace(
            /public\s+(?:int|double|string|bool|char)\s+(\w+)\s*;/g,
            (match, name) => { fields.push(name); return ''; }
        );

        // Extract methods
        const methodRegex = /(?:public|private|protected|static)?\s*(?:virtual|override|abstract)?\s*(?:public|private|protected|static)?\s*(int|double|string|void|bool|char)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
        let m;
        const methods = [];
        const declarations = maskLiterals(stripped);
        while ((m = methodRegex.exec(declarations)) !== null) {
            const methodName = m[2];
            const params = m[3];
            const braceStart = m.index + m[0].length - 1;
            const braceEnd = findMatchingBrace(stripped, braceStart);
            if (braceEnd === -1) continue;
            const methodBody = stripped.substring(braceStart + 1, braceEnd);

            const jsParams = params.split(',')
                .map(p => p.trim().replace(/^(?:int|double|string|bool|char)\s+/, '').trim())
                .filter(p => p.length > 0)
                .join(', ');

            if (isProgram && methodName === 'Main') {
                mainBody = methodBody;
            } else {
                methods.push({ name: methodName, params: jsParams, body: translateStatements(methodBody, params) });
            }
            methodRegex.lastIndex = braceEnd + 1;
        }

        // Extract constructor (按实际类名匹配)
        const ctorRegex2 = new RegExp('public\\s+' + className + '\\s*\\(([^)]*)\\)\\s*\\{', 'g');
        let ctorMatch;
        let ctorBody = '';
        let ctorParams = '';
        while ((ctorMatch = ctorRegex2.exec(declarations)) !== null) {
            const typedParams = ctorMatch[1];
            const braceStart = ctorMatch.index + ctorMatch[0].length - 1;
            const braceEnd = findMatchingBrace(stripped, braceStart);
            if (braceEnd === -1) continue;
            ctorBody = stripped.substring(braceStart + 1, braceEnd);
            ctorParams = typedParams.split(',')
                .map(p => p.trim().replace(/^(?:int|double|string|bool|char)\s+/, '').trim())
                .filter(p => p.length > 0)
                .join(', ');
            ctorBody = translateStatements(ctorBody, typedParams);
            ctorRegex2.lastIndex = braceEnd + 1;
        }

        if (isProgram) {
            // For Program class, emit Main body PLUS all other static methods as JS functions
            let jsCode = '';
            methods.forEach(meth => {
                jsCode += `function ${meth.name}(${meth.params}) {${meth.body}}\n`;
            });
            return { isProgram: true, mainBody, jsCode };
        }

        // Constructor — add this. prefix to field assignments (use accessibleFields)
        if (ctorBody) {
            accessibleFields.forEach(fname => {
                ctorBody = ctorBody.replace(
                    new RegExp('(?<![.\\w$])' + fname + '\\b(?=\\s*[^\\w(]|$)', 'g'),
                    'this.' + fname
                );
            });
        }

        // Generate JS class
        let cls = `class ${className}` + (baseClass ? ` extends ${baseClass}` : '') + ` {\n`;

        // Constructor
        if (fields.length > 0 || ctorBody) {
            cls += `  constructor(${ctorParams}) {\n`;
            if (baseClass) cls += `    super();\n`;
            fields.forEach(f => cls += `    this.${f} = null;\n`);
            if (ctorBody) cls += `    ${ctorBody}\n`;
            cls += `  }\n`;
        }

        // Methods - add this. prefix for all accessible field references
        methods.forEach(meth => {
            let body = meth.body;
            accessibleFields.forEach(fname => {
                body = body.replace(
                    new RegExp('(?<![.\\w$])' + fname + '\\b(?=\\s*[^\\w(]|$)', 'g'),
                    'this.' + fname
                );
            });
            cls += `  ${meth.name}(${meth.params}) {${body}}\n`;
        });

        cls += `}\n`;
        return { isProgram: false, mainBody: '', jsCode: cls };
    }

    // ===== Statement Translation =====
    function translateStatements(code, parameters = '', inheritedTypes = new Map()) {
        const literals = [];
        let js = '';
        for (let i = 0; i < code.length;) {
            const end = literalEnd(code, i);
            if (end === i) { js += code[i++]; continue; }
            js += `\uE000${literals.length}\uE001`;
            literals.push(code.slice(i, end));
            i = end;
        }
        const types = new Map(inheritedTypes);
        for (const [, type, name, initial] of `${parameters};${js}`.matchAll(/\b(int|double|string|bool|char|var|float)\s+([A-Za-z_]\w*)(?:\s*=\s*([^;\n]+))?/g)) {
            types.set(name, type === 'var' ? numericType(initial?.trim() ?? '', types) : type);
            for (const [, next] of (initial ?? '').matchAll(/,\s*([A-Za-z_]\w*)\s*=/g)) types.set(next, type);
        }

        // const int X = val; → const X = val;
        js = js.replace(/\bconst\s+(?:int|double|string|bool|char)\s+(\w+)\s*=/g, 'const $1 =');

        // Variable declarations
        js = js.replace(/\b(int|double|string|bool|char)\s+(\w+)\s*=/g, 'let $2 =');
        js = js.replace(/\b(int|double|string|bool|char)\s+(\w+)\s*;/g, 'let $2;');

        // Custom type variable declarations
        js = js.replace(/\b([A-Z]\w*)\s+(\w+)\s*=\s*new\s+/g, 'let $2 = new ');
        js = js.replace(/\b([A-Z]\w*)\s+(\w+)\s*;(?!\s*[=:])/g, 'let $2;');
        // Custom type array declaration: Student[] students = ... → let students = ...
        js = js.replace(/\b([A-Z]\w*)\[\]\s+(\w+)\s*=/g, 'let $2 =');
        // Custom type assignment from array index: Student best = students[0]; → let best = students[0];
        js = js.replace(/\b([A-Z]\w*)\s+(\w+)\s*=\s*(\w+)\s*\[/g, 'let $2 = $3[');

        // Array declaration with initializer: int[] x = { ... }; → let x = [...];
        js = js.replace(/\b(?:int|double|string|bool|char)\[\]\s+(\w+)\s*=\s*\{/g, 'let $1 = [');
        // Array declaration other: int[] x = expr; → let x = expr;
        js = js.replace(/\b(?:int|double|string|bool|char)\[\]\s+(\w+)\s*=/g, 'let $1 =');
        // Array initializer closing } → ] (find balanced)
        js = convertArrayInitClosing(js);
        // new int[n] / new Student[n] → new Array(n)
        js = js.replace(/\bnew\s+(int|double|string|bool|char|[A-Z]\w*)\[\s*(\w+)\s*\]/g, (_, type, length) => {
            const value = { int: '0', double: '0', bool: 'false', char: '"\\0"' }[type] ?? 'null';
            return `new Array(${length}).fill(${value})`;
        });

        // foreach → for...of (支持基本类型和自定义类型)
        js = js.replace(/\bforeach\s*\(\s*(?:int|double|string|bool|char|[A-Z]\w*)\s+(\w+)\s+in\s+(\w+)\s*\)/g,
            'for (const $1 of $2)');

        // List<int> nums = new List<int>(); → let nums = [];
        js = js.replace(/(?:List|System\.Collections\.Generic\.List)<\w+>\s+(\w+)\s*=\s*new\s+(?:List|System\.Collections\.Generic\.List)<\w+>\s*\(\s*\)/g,
            'let $1 = []');
        // nums.Add(x) → nums.push(x)
        js = js.replace(/(\w+)\.Add\s*\(/g, '$1.push(');
        // nums.Count → nums.length
        js = js.replace(/(\w+)\.Count\b/g, '$1.length');

        // String methods
        js = js.replace(/\.ToUpper\(\)/g, '.toUpperCase()');
        js = js.replace(/\.ToLower\(\)/g, '.toLowerCase()');
        js = js.replace(/\.Contains\(/g, '.includes(');
        js = js.replace(/([A-Za-z_]\w*|\uE000\d+\uE001)((?:\.(?:toUpperCase|toLowerCase)\(\))*)\.Replace\s*\(\s*([^,()]+),\s*([^()]+)\)/g, '__replace($1$2, $3, $4)');
        js = js.replace(/\.Replace\(/g, '.replaceAll(');
        js = js.replace(/\.Substring\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, '.slice($1, $1 + $2)');
        js = js.replace(/\.Length\b/g, '.length');
        js = js.replace(/\.Split\s*\(/g, '.split(');
        js = js.replace(/\bstring\.Join\s*\(/g, '__join(');

        js = js.replace(/\bint\.Parse\s*\(/g, '__parseInt(');
        js = js.replace(/\bdouble\.Parse\s*\(/g, '__parseDouble(');

        // .ToString() → .toString()
        js = js.replace(/\.ToString\(\)/g, '.toString()');

        js = js.replace(/\bConsole\s*\.\s*(WriteLine|Write|ReadLine)\s*(?=\()/g, (_, method) => ({
            WriteLine: '__out', Write: '__outNoNl', ReadLine: '__readline'
        })[method]);

        // virtual/override 关键字：模拟器用 JS 原生方法分派，直接去掉这两个修饰符
        js = js.replace(/\bvirtual\s+/g, '');
        js = js.replace(/\boverride\s+/g, '');

        js = translateDivision(js, types);

        // Object initializer: new Student { Name = "x", Score = 85 }
        // → (() => { const __o = new Student(); __o.Name = "x"; __o.Score = 85; return __o; })()
        js = js.replace(/new\s+([A-Z]\w*)\s*\{([^{}]*?)\}/g, (match, cls, props) => {
            const assigns = props.split(',').map(a => a.trim()).filter(a => a.length > 0);
            const stmts = assigns.map(a => {
                const eq = a.indexOf('=');
                if (eq === -1) return '';
                const field = a.substring(0, eq).trim();
                const val = a.substring(eq + 1).trim();
                return `__o.${field} = ${val};`;
            }).join(' ');
            return `(()=>{const __o=new ${cls}();${stmts} return __o;})()`;
        });

        return js.replace(/\uE000(\d+)\uE001/g, (_, index) => {
            const literal = literals[index];
            return literal.startsWith('$"') ? translateInterpolation(literal, types) : literal;
        });
    }

    function numericType(operand, types) {
        if (/^[+-]?\d+$/.test(operand)) return 'int';
        if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+[eE][+-]?\d+)$/.test(operand)) return 'double';
        return types.get(operand.replace(/^[+-]/, ''));
    }

    function translateDivision(code, types) {
        const operand = '(?:[A-Za-z_]\\w*|\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)';
        const chain = new RegExp(`(?<![\\w.$\\uE000])${operand}(?:\\s*[*/%]\\s*[+-]?${operand})+(?![\\w.$\\uE001])`, 'g');
        return code.replace(chain, expression => {
            if (!expression.includes('/')) return expression;
            const tokens = expression.replace(/\s+/g, '').split(/([*/%])/);
            let combined = tokens[0];
            let type = numericType(combined, types);
            for (let i = 1; i < tokens.length; i += 2) {
                const operator = tokens[i], right = tokens[i + 1];
                const rightType = numericType(right, types);
                if (!['int', 'double', 'float'].includes(type) || !['int', 'double', 'float'].includes(rightType)) return expression;
                const bothIntegers = type === 'int' && rightType === 'int';
                combined = operator === '/' && bothIntegers ? `__intDiv(${combined}, ${right})` : `(${combined} ${operator} ${right})`;
                type = bothIntegers ? 'int' : 'double';
            }
            return combined;
        });
    }

    /**
     * Convert array initializer closing brace } to ] for arrays declared with `let x = [`.
     * Walks the code tracking `let X = [` openings and matches their closing `}`.
     */
    function convertArrayInitClosing(code) {
        let result = '';
        let i = 0;
        const stack = []; // track positions where we expect ] vs }
        while (i < code.length) {
            // Skip strings
            if (code[i] === '"' || code[i] === '`' || code[i] === '\'') {
                const q = code[i]; result += code[i++];
                while (i < code.length && code[i] !== q) {
                    if (code[i] === '\\' && i+1 < code.length) { result += code[i]+code[i+1]; i+=2; continue; }
                    result += code[i++];
                }
                if (i < code.length) result += code[i++];
                continue;
            }
            // 检测 `[`：数组初始化器起始（栈上下文由下方统一维护）
            if (code[i] === '[') {
                stack.push('arr');
                result += code[i++];
                continue;
            }
            if (code[i] === '{') {
                stack.push('brace');
                result += code[i++];
                continue;
            }
            if (code[i] === '(') {
                stack.push('paren');
                result += code[i++];
                continue;
            }
            if (code[i] === ']' || code[i] === ')' ) {
                stack.pop();
                result += code[i++];
                continue;
            }
            if (code[i] === '}') {
                const top = stack[stack.length - 1];
                if (top === 'arr') {
                    // This } closes an array initializer → replace with ]
                    stack.pop();
                    result += ']';
                    i++;
                    continue;
                } else if (top === 'brace') {
                    stack.pop();
                }
                result += code[i++];
                continue;
            }
            result += code[i++];
        }
        return result;
    }

    function maskLiterals(code) {
        let result = '';
        for (let i = 0; i < code.length;) {
            const end = literalEnd(code, i);
            if (end === i) { result += code[i++]; continue; }
            result += code.slice(i, end).replace(/[^\n]/g, ' ');
            i = end;
        }
        return result;
    }

    function literalEnd(code, start) {
        const interpolated = code[start] === '$' && code[start + 1] === '"';
        const quoteStart = start + Number(interpolated);
        const quote = code[quoteStart];
        if (quote !== '"' && quote !== "'") return start;
        for (let i = quoteStart + 1; i < code.length; i++) {
            if (code[i] === '\\') { i++; continue; }
            if (code[i] === quote) return i + 1;
            if (interpolated && code[i] === '{') {
                if (code[i + 1] === '{') { i++; continue; }
                const end = findMatchingBrace(code, i);
                if (end < 0) break;
                i = end;
            }
        }
        throw new Error('字符串缺少结束引号或插值括号');
    }

    function translateInterpolation(literal, types) {
        const text = literal.slice(2, -1);
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const next = text[i + 1];
            if (char === '\\') {
                result += char + next;
                i++;
            } else if ((char === '{' || char === '}') && next === char) {
                result += char === '{' && text[i - 1] === '$' ? '\\{' : char;
                i++;
            } else if (char === '{') {
                const end = findMatchingBrace(text, i);
                if (end < 0) throw new Error('插值表达式缺少右括号');
                const expression = translateStatements(text.slice(i + 1, end), '', types);
                result += '${__format(' + expression + ')}';
                i = end;
            } else {
                result += char === '`' ? '\\`' : char;
            }
        }
        return '`' + result + '`';
    }

    function stripComments(code, onComment = () => {}) {
        let result = '';
        for (let i = 0; i < code.length;) {
            const end = literalEnd(code, i);
            if (end !== i) {
                result += code.slice(i, end);
                i = end;
                continue;
            }
            if (code.startsWith('//', i)) {
                const newline = code.indexOf('\n', i);
                const end = newline < 0 ? code.length : newline;
                onComment(code.slice(i + 2, end));
                i = end;
            } else if (code.startsWith('/*', i)) {
                const closing = code.indexOf('*/', i + 2);
                if (closing < 0) throw new Error('块注释缺少结束符 */');
                const comment = code.slice(i + 2, closing);
                onComment(comment);
                result += ' ' + comment.replace(/[^\n]/g, '');
                i = closing + 2;
            } else {
                result += code[i++];
            }
        }
        return result;
    }

    function findMatchingBrace(code, start) {
        let depth = 0;
        for (let i = start; i < code.length;) {
            const end = literalEnd(code, i);
            if (end !== i) { i = end; continue; }
            if (code[i] === '{') depth++;
            else if (code[i] === '}' && --depth === 0) return i;
            i++;
        }
        return -1;
    }

    function hasComment(code) {
        let found = false;
        try { stripComments(code, comment => { found ||= Boolean(comment.trim()); }); }
        catch { return false; }
        return found;
    }

    function checkOutput(actual, expected) {
        // 规范化：统一换行为 \n → 合并连续空白为单个空格（但保留换行）→ 去首尾空白
        // 这样对"多了个空行""行尾多了空格""中间多打了个空格"等小白常见笔误容错
        const n = s => s.replace(/\r\n/g, '\n')
                        .replace(/[ \t]+/g, ' ')        // 连续空格/制表符 → 单空格
                        .replace(/ *\n */g, '\n')        // 换行两侧空格去掉
                        .replace(/\n{2,}/g, '\n')        // 连续空行 → 单换行
                        .trim();
        return n(actual) === n(expected);
    }

    return { run, checkOutput, hasComment };
}

const CodeRunner = (() => {
    const simulator = createSimulator();

    function frameRunner(source) {
        window.addEventListener('message', event => {
            if (event.source !== parent || event.data?.type !== 'run') return;
            const send = result => parent.postMessage({ type: 'result', result }, '*');
            try {
                const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                const worker = new Worker(url);
                worker.addEventListener('message', ({ data }) => send(data), { once: true });
                worker.addEventListener('error', () => send({ status: 'error', output: '运行器启动失败' }), { once: true });
                worker.postMessage(event.data.request);
            } catch {
                send({ status: 'error', output: '此浏览器无法启动隔离运行器' });
            }
        });
        parent.postMessage({ type: 'ready' }, '*');
    }

    function run(code, inputs = [], { signal } = {}) {
        if (typeof document === 'undefined') return simulator.run(code, inputs);
        if (signal?.aborted) return Promise.resolve({ status: 'cancelled', output: '' });
        const source = `const simulator = (${createSimulator})(); self.onmessage = async ({data}) => postMessage(await simulator.run(data.code, data.inputs));`;
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.title = '代码运行器';
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:"><script>(${frameRunner})(${JSON.stringify(source).replaceAll('<', '\\u003c')});<\/script>`;

        return new Promise(resolve => {
            function finish(result) {
                clearTimeout(timer);
                window.removeEventListener('message', onMessage);
                signal?.removeEventListener('abort', onAbort);
                frame.remove();
                resolve(result);
            }

            function onMessage(event) {
                if (event.source !== frame.contentWindow) return;
                if (event.data?.type === 'ready') frame.contentWindow.postMessage({ type: 'run', request: { code, inputs } }, '*');
                if (event.data?.type === 'result') finish(event.data.result);
            }

            function onAbort() { finish({ status: 'cancelled', output: '' }); }

            const timer = setTimeout(() => finish({ status: 'error', output: '运行超时，请检查循环和递归的结束条件。' }), 3_000);
            window.addEventListener('message', onMessage);
            signal?.addEventListener('abort', onAbort, { once: true });
            document.body.append(frame);
        });
    }

    return { run, checkOutput: simulator.checkOutput, hasComment: simulator.hasComment };
})();
