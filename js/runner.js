/**
 * runner.js — C# 代码在线运行器（本地轻量模拟执行）
 * 把 C# 代码翻译成等价 JS 后用 Function 执行
 */
const CodeRunner = (function () {

    async function run(code, inputs) {
        try {
            const output = simulate(code, inputs || []);
            return { output, status: 'success' };
        } catch (e) {
            return { output: '【运行错误】' + (e.message || String(e)), status: 'error' };
        }
    }

    function simulate(csharpCode, inputs) {
        const translated = translateToJs(csharpCode);
        const output = [];
        const __out = (...args) => output.push(args.map(formatArg).join('') + '\n');
        const __outNoNl = (...args) => output.push(args.map(formatArg).join(''));

        // Console.ReadLine support: __readline() returns next input from queue
        let inputIndex = 0;
        const __readline = () => {
            if (inputIndex < inputs.length) return inputs[inputIndex++];
            return '';  // default empty if no more inputs
        };

        try {
            const fn = new Function('__out', '__outNoNl', '__readline', translated.code);
            fn(__out, __outNoNl, __readline);
        } catch (e) {
            output.push('【运行时错误】' + (e.message || String(e)) + '\n');
        }
        return output.join('');
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
        js = js.replace(/^\s*using\s+[^;]+;\s*$/gm, '');

        // 3. Extract ALL class blocks, translate each to JS class
        const classBlocks = extractAllClasses(js);

        // 4. Find the "Program" class (has Main), extract Main body
        let mainBody = '';
        let otherCode = '';
        for (const cb of classBlocks) {
            if (cb.isProgram) {
                mainBody = cb.mainBody;
            }
            otherCode += cb.jsCode + '\n';
        }

        // 5. Translate Main body
        let mainJs = translateStatements(mainBody);

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
        while ((im = ifaceRegex.exec(codeWithoutInterfaces)) !== null) {
            const braceStart = im.index + im[0].length - 1;
            const braceEnd = findMatchingBrace(codeWithoutInterfaces, braceStart);
            if (braceEnd === -1) break;
            codeWithoutInterfaces =
                codeWithoutInterfaces.substring(0, im.index) +
                codeWithoutInterfaces.substring(braceEnd + 1);
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
        while ((scm = classScanRegex.exec(codeWithoutInterfaces)) !== null) knownClasses.add(scm[1]);

        const classRegex = /\bclass\s+(\w+)(?:\s*:\s*(\w+))?\s*\{/g;
        let m;
        // Collect all class names first (for field inheritance)
        const allClassNames = [];
        const classRegexForNames = /\bclass\s+(\w+)/g;
        while ((m = classRegexForNames.exec(codeWithoutInterfaces)) !== null) {
            allClassNames.push(m[1]);
        }

        // Parse each class, collect its fields
        const classFields = {}; // className → [field names]
        const classRegex2 = /\bclass\s+(\w+)(?:\s*:\s*(\w+))?\s*\{/g;
        while ((m = classRegex2.exec(codeWithoutInterfaces)) !== null) {
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
        while ((m = classRegex3.exec(codeWithoutInterfaces)) !== null) {
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

            const isProgram = className === 'Program';
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
        while ((m = methodRegex.exec(stripped)) !== null) {
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
                methods.push({ name: methodName, params: jsParams, body: translateStatements(methodBody) });
            }
            methodRegex.lastIndex = braceEnd + 1;
        }

        // Extract constructor
        const ctorRegex = /public\s+ClassName\s*\(([^)]*)\)\s*\{/g;
        // We need to search for the actual class name
        const ctorRegex2 = new RegExp('public\\s+' + className + '\\s*\\(([^)]*)\\)\\s*\\{', 'g');
        let ctorMatch;
        let ctorBody = '';
        let ctorParams = '';
        while ((ctorMatch = ctorRegex2.exec(stripped)) !== null) {
            ctorParams = ctorMatch[1];
            const braceStart = ctorMatch.index + ctorMatch[0].length - 1;
            const braceEnd = findMatchingBrace(stripped, braceStart);
            if (braceEnd === -1) continue;
            ctorBody = stripped.substring(braceStart + 1, braceEnd);
            ctorParams = ctorParams.split(',')
                .map(p => p.trim().replace(/^(?:int|double|string|bool|char)\s+/, '').trim())
                .filter(p => p.length > 0)
                .join(', ');
            ctorBody = translateStatements(ctorBody);
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
    function translateStatements(code) {
        let js = code;

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
        js = js.replace(/\bnew\s+(?:int|double|string|bool|char)\[\s*(\w+)\s*\]/g, 'new Array($1)');
        js = js.replace(/\bnew\s+([A-Z]\w*)\[\s*(\w+)\s*\]/g, 'new Array($2)');

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
        js = js.replace(/\.Replace\(/g, '.replace(');
        js = js.replace(/\.Substring\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, '.slice($1, $1 + $2)');
        js = js.replace(/\.Length\b/g, '.length');
        // Split: s.Split(',') → s.split(',')
        js = js.replace(/\.Split\s*\(\s*'([^']+)'\s*\)/g, ".split('$1')");
        js = js.replace(/\.Split\s*\(\s*"([^"]+)"\s*\)/g, '.split("$1")');
        // string.Join(sep, arr) → arr.join(sep)
        js = js.replace(/string\.Join\s*\(\s*"([^"]*)"\s*,\s*(\w+)\s*\)/g, '$2.join("$1")');
        js = js.replace(/string\.Join\s*\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g, "$2.join('$1')");

        // int.Parse(x) → parseInt(x)
        js = js.replace(/\bint\.Parse\s*\(/g, 'parseInt(');
        js = js.replace(/\bdouble\.Parse\s*\(/g, 'parseFloat(');

        // .ToString() → .toString()
        js = js.replace(/\.ToString\(\)/g, '.toString()');

        // String interpolation $"..." → `...`
        js = convertInterpolatedStrings(js);

        // Console.WriteLine / Write / ReadLine
        js = replaceConsoleCalls(js);

        // Integer division: when both operands look like int variables
        // We can't perfectly detect this, so we wrap with Math.trunc for // operator
        // Actually, let's not - it breaks too many things. The course uses double for division.

        // virtual/override keywords - just strip them
        js = js.replace(/\bvirtual\s+/g, '');
        js = js.replace(/\boverride\s+/g, '');

        // Integer division: track int variables and wrap their divisions with Math.trunc
        // Collect int variable names from `let X =` where original was int declaration
        // Heuristic: find patterns `let X = <integer literal>` or `let X = <int op int>`
        const intVars = new Set();
        // Match `let X = <digits>` or `let X = <digits> op <digits>` etc.
        js.replace(/\blet\s+(\w+)\s*=\s*(\d+(?:\s*[-+*/%]\s*\d+)*)\s*;/g, (match, name) => { intVars.add(name); return ''; });
        // Also handle `int a = 100, b = 7;` style — already converted to `let a = 100, b = 7;`
        js.replace(/\blet\s+(\w+)\s*=\s*\d+\s*,\s*(\w+)\s*=\s*\d+/g, (match, n1, n2) => { intVars.add(n1); intVars.add(n2); return ''; });
        // If we have int vars, wrap `intVar / intVar` with Math.trunc
        if (intVars.size > 0) {
            const varList = Array.from(intVars).join('|');
            const intDivRegex = new RegExp('\\b(' + varList + ')\\s*/\\s*(' + varList + ')\\b', 'g');
            js = js.replace(intDivRegex, 'Math.trunc($1 / $2)');
        }

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

        return js;
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
            // Detect `let X = [` (array initializer start)
            const arrStart = code.substr(i, 8).match(/^let \w+ = \[$/m);
            // Check if we just opened an array initializer (look back in result)
            // Simpler: when we see `[` right after `= `, push "arr" context
            // We'll track via stack of { kind: 'arr'|'brace'|'paren' }
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

    // ===== String Interpolation =====
    function convertInterpolatedStrings(code) {
        let result = '';
        let i = 0;
        while (i < code.length) {
            if (code[i] === '$' && code[i + 1] === '"') {
                let j = i + 2, inner = '', braceDepth = 0;
                while (j < code.length) {
                    const c = code[j];
                    if (c === '\\' && j + 1 < code.length) { inner += c + code[j+1]; j += 2; continue; }
                    if (c === '{') { braceDepth++; inner += c; j++; continue; }
                    if (c === '}') { braceDepth--; inner += c; j++; continue; }
                    if (braceDepth > 0 && (c === '"' || c === '\'')) {
                        const q = c; inner += c; j++;
                        while (j < code.length && code[j] !== q) {
                            if (code[j] === '\\' && j+1 < code.length) { inner += code[j]+code[j+1]; j+=2; continue; }
                            inner += code[j]; j++;
                        }
                        if (j < code.length) { inner += code[j]; j++; }
                        continue;
                    }
                    if (c === '"' && braceDepth === 0) break;
                    inner += c; j++;
                }
                const converted = convertInterpolationBody(inner);
                result += '`' + converted + '`';
                i = j + 1; continue;
            }
            if (code[i] === '"') {
                let j = i + 1, inner = '';
                while (j < code.length) {
                    if (code[j] === '\\' && j+1 < code.length) { inner += code[j]+code[j+1]; j+=2; continue; }
                    if (code[j] === '"') break;
                    inner += code[j]; j++;
                }
                result += '"' + inner + '"';
                i = j + 1; continue;
            }
            result += code[i]; i++;
        }
        return result;
    }

    function convertInterpolationBody(inner) {
        let out = '', i = 0, braceDepth = 0, buf = '';
        while (i < inner.length) {
            const c = inner[i];
            if (c === '\\' && i+1 < inner.length) { buf += c + inner[i+1]; i+=2; continue; }
            if (c === '"' || c === '\'') {
                const q = c; buf += c; i++;
                while (i < inner.length && inner[i] !== q) {
                    if (inner[i] === '\\' && i+1 < inner.length) { buf += inner[i]+inner[i+1]; i+=2; continue; }
                    buf += inner[i]; i++;
                }
                if (i < inner.length) { buf += inner[i]; i++; }
                continue;
            }
            if (c === '{') {
                braceDepth++;
                if (braceDepth === 1) { out += buf; buf = '$' + c; }
                else buf += c;
                i++; continue;
            }
            if (c === '}') {
                braceDepth--;
                buf += c;
                if (braceDepth === 0) { out += buf; buf = ''; }
                i++; continue;
            }
            buf += c; i++;
        }
        out += buf;
        return out;
    }

    // ===== Console Call Replacement =====
    function replaceConsoleCalls(code) {
        let result = '', i = 0;
        while (i < code.length) {
            if (code[i] === '"' || code[i] === '`' || code[i] === '\'') {
                const q = code[i]; result += code[i++];
                while (i < code.length && code[i] !== q) {
                    if (code[i] === '\\' && i+1 < code.length) { result += code[i]+code[i+1]; i+=2; continue; }
                    result += code[i++];
                }
                if (i < code.length) result += code[i++];
                continue;
            }
            // Console.WriteLine( 共 18 字符 — 必须先匹配（前缀包含 Console.Write）
            if (code.substr(i, 18) === 'Console.WriteLine(') {
                const ps = i + 17, end = findMatchingParen(code, ps);
                if (end === -1) { result += code[i]; i++; continue; }
                result += `__out(${code.substring(ps+1, end)})`;
                i = end + 1; continue;
            }
            // Console.Write( 共 14 字符
            if (code.substr(i, 14) === 'Console.Write(') {
                const ps = i + 13, end = findMatchingParen(code, ps);
                if (end === -1) { result += code[i]; i++; continue; }
                result += `__outNoNl(${code.substring(ps+1, end)})`;
                i = end + 1; continue;
            }
            // Console.ReadLine() → __readline()  (18 chars)
            if (code.substr(i, 18) === 'Console.ReadLine()') {
                result += '__readline()';
                i += 18; continue;
            }
            result += code[i++];
        }
        return result;
    }

    // ===== Utilities =====
    function stripComments(code) {
        let result = '', i = 0, inStr = false, qch = '';
        while (i < code.length) {
            const c = code[i], next = code[i+1];
            if (inStr) {
                result += c;
                if (c === '\\' && i+1 < code.length) { result += code[i+1]; i+=2; continue; }
                if (c === qch) inStr = false;
                i++; continue;
            }
            if (c === '"' || c === '\'') { inStr = true; qch = c; result += c; i++; continue; }
            if (c === '/' && next === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
            if (c === '/' && next === '*') { i+=2; while (i < code.length && !(code[i]==='*'&&code[i+1]==='/')) i++; i+=2; continue; }
            result += c; i++;
        }
        return result;
    }

    function findMatchingBrace(code, start) {
        let d = 0;
        for (let i = start; i < code.length; i++) {
            if (code[i] === '{') d++;
            else if (code[i] === '}') { d--; if (d === 0) return i; }
        }
        return -1;
    }

    function findMatchingParen(code, start) {
        let d = 0;
        for (let i = start; i < code.length; i++) {
            if (code[i] === '(') d++;
            else if (code[i] === ')') { d--; if (d === 0) return i; }
        }
        return -1;
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

    return { run, checkOutput };
})();
