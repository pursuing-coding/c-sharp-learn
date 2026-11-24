const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function load(files, globals = {}) {
    const context = vm.createContext(globals);
    for (const file of files) {
        const source = readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8');
        vm.runInContext(source, context, { filename: file + '.js' });
    }
    return code => vm.runInContext(code, context);
}

const evaluate = load(['chapters-data', 'runner']);
const runner = evaluate('CodeRunner');

test('all reference solutions run and match their course output', async () => {
    const lessons = evaluate('getAllLessonsFlat()');
    assert.equal(lessons.length, 34);
    for (const { lesson } of lessons) {
        const result = await runner.run(lesson.answer, lesson.echoPrefix ? ['测试'] : []);
        assert.equal(result.status, 'success', lesson.id + ': ' + result.output);
        assert.ok(runner.checkOutput(result.output, lesson.expectedOutput), lesson.id);
    }
});

test('division respects numeric declarations, literals and interpolation', async () => {
    const code = `
        int i = 7, j = 2;
        double d = 7;
        Console.WriteLine(7 / 2);
        Console.WriteLine(i / j);
        Console.WriteLine(7.0 / 2);
        Console.WriteLine(d / j);
        Console.WriteLine($"值：{i / j}");
    `;
    const result = await runner.run(code);
    assert.equal(result.status, 'success');
    assert.equal(result.output, '3\n3\n3.5\n3.5\n值：3\n');
});

test('run requests input only when execution reaches ReadLine and keeps earlier output', async () => {
    const code = 'Console.Write("姓名："); string name = Console.ReadLine (); Console.WriteLine("你好，" + name);';
    let result = await runner.run(code, []);
    assert.equal(result.status, 'input');
    assert.equal(result.output, '姓名：');
    result = await runner.run(code, ['小林']);
    assert.equal(result.status, 'success');
    assert.equal(result.output, '姓名：你好，小林\n');
    result = await runner.run('if (false) Console.ReadLine(); Console.WriteLine("Console.ReadLine()");', []);
    assert.equal(result.status, 'success');
    assert.equal(result.output, 'Console.ReadLine()\n');
});

test('runtime and translation errors are visible failures', async () => {
    for (const code of ['Console.WriteLine(missing);', 'Console.WriteLine(int.Parse("12x"));', 'Console.WriteLine(1 / 0);', 'Console.WriteLine("missing);']) {
        const result = await runner.run(code);
        assert.equal(result.status, 'error', code);
        assert.match(result.output, /错误/);
    }
});

test('translation preserves literals and handles repeated string replacement', async () => {
    const result = await runner.run(`using System; Console.WriteLine("https://a.Length/{"); Console.WriteLine("class Demo {}"); Console.WriteLine("aaa".Replace("a", "$&"));`);
    assert.equal(result.status, 'success');
    assert.equal(result.output, 'https://a.Length/{\nclass Demo {}\n$&$&$&\n');
});

test('comment exercise recognizes actual comments rather than quoted markers', () => {
    assert.equal(runner.hasComment('Console.WriteLine("// a comment");'), false);
    assert.equal(runner.hasComment('Console.WriteLine("hello"); // print the greeting'), true);
});

test('progress repairs invalid fields and saves an intentionally empty draft', () => {
    const values = new Map();
    const localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const storage = load(['storage'], { localStorage })('Storage');
    values.set(storage.key, '{"completedLessons":null,"codeHistory":null,"stars":"bad"}');
    assert.equal(storage.load().completedLessons.length, 0);
    assert.equal(storage.load().stars, 0);
    assert.equal(storage.getCode('c1l1'), null);
    assert.equal(storage.saveCode('c1l1', ''), true);
    assert.equal(storage.getCode('c1l1'), '');
    storage.completeLesson('c1l1');
    assert.ok(storage.isCompleted('c1l1'));
    assert.ok(storage.reset() > 0);
    assert.equal(storage.getCode('c1l1'), null);
    assert.equal(storage.isCompleted('c1l1'), false);
});

test('unavailable storage keeps progress usable in the current page', () => {
    const blocked = () => { throw new Error('storage blocked'); };
    const storage = load(['storage'], { localStorage: { getItem: blocked, setItem: blocked } })('Storage');
    assert.equal(storage.saveCode('c1l1', 'draft'), false);
    storage.completeLesson('c1l1');
    assert.equal(storage.getCode('c1l1'), 'draft');
    assert.equal(storage.isCompleted('c1l1'), true);
});
