(function () {
    const $ = id => document.getElementById(id);
    const allLessons = getAllLessonsFlat();
    const knownIds = new Set(allLessons.map(item => item.id));
    const sidebar = $('sidebar');
    const sidebarBody = $('sidebarBody');
    const catalogButton = $('btnCatalog');
    const tutorial = $('tutorial');
    const answerPanel = $('answerPanel');
    const answerButton = $('btnAnswer');
    const dialog = $('focusModal');
    const toast = $('toast');

    const main = {
        editor: $('codeInput'), output: $('outputContent'), run: $('btnRun'), status: $('runStatus'),
        inputArea: $('inputArea'), input: $('stdinInput'), submit: $('btnSubmitInput'), inputHint: $('inputHint')
    };
    const focus = {
        editor: $('focusCodeInput'), output: $('focusOutputContent'), run: $('focusRun'), status: $('focusRunStatus'),
        inputArea: $('focusInputArea'), input: $('focusStdinInput'), submit: $('focusSubmitInput'), inputHint: $('focusInputHint')
    };

    let currentIndex = 0;
    let activeRun = null;
    let toastTimer;
    let focusOpener;
    let storageNoticeShown = false;
    let loadedSource;
    let resetAt = Storage.load().resetAt;

    function currentLesson() {
        return allLessons[currentIndex].lesson;
    }

    function isUnlocked(index, completed = new Set(Storage.load().completedLessons)) {
        return index === 0 || completed.has(allLessons[index - 1].id);
    }

    function showToast(message, type) {
        toast.textContent = message;
        toast.className = 'toast show' + (type === 'warn' ? ' warn' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    function applyTheme(theme) {
        const value = theme === 'light' ? 'light' : 'dark';
        document.documentElement.dataset.theme = value;
        $('btnTheme').setAttribute('aria-pressed', String(value === 'light'));
    }

    function toggleTheme() {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        try { localStorage.setItem('csharp_theme', next); } catch {}
    }

    function saveDraft(view) {
        if (Storage.load().resetAt !== resetAt) {
            syncStoredProgress();
            return;
        }
        loadedSource = view.editor.value;
        if (Storage.saveCode(currentLesson().id, loadedSource) || storageNoticeShown) return;
        storageNoticeShown = true;
        showToast('浏览器存储当前不可用，本次编辑只在此页面保留。', 'warn');
    }

    function setCatalog(open, returnFocus = false) {
        sidebar.classList.toggle('open', open);
        catalogButton.setAttribute('aria-expanded', String(open));
        if (returnFocus) catalogButton.focus();
    }

    function renderProgress() {
        const completed = new Set(Storage.load().completedLessons.filter(id => knownIds.has(id)));
        const currentId = allLessons[currentIndex].id;
        const indices = new Map(allLessons.map((item, index) => [item.id, index]));
        sidebarBody.innerHTML = CHAPTERS_DATA.map(stage => {
            const chapters = stage.chapters.map(chapter => {
                const count = chapter.lessons.filter(lesson => completed.has(lesson.id)).length;
                const dot = count === chapter.lessons.length ? 'done' : count ? 'partial' : '';
                const lessons = chapter.lessons.map(lesson => {
                    const index = indices.get(lesson.id);
                    const done = completed.has(lesson.id);
                    const locked = !isUnlocked(index, completed);
                    const active = lesson.id === currentId;
                    const icon = done ? '✓' : locked ? '🔒' : '○';
                    const status = done ? '已完成' : locked ? '未解锁' : '可学习';
                    return `<button type="button" class="sb-lesson${done ? ' done' : ''}${active ? ' active' : ''}" data-idx="${index}" ${active ? 'aria-current="step"' : ''} ${locked ? 'disabled' : ''}><span class="ls-icon" aria-hidden="true">${icon}</span><span class="ls-name">${lesson.title}</span><span class="sr-only">（${status}）</span></button>`;
                }).join('');
                return `<div class="sb-chapter"><span class="ch-dot ${dot}" aria-hidden="true"></span>${chapter.title.replace(/^第 \d+ 章：/, '')}</div>${lessons}`;
            }).join('');
            return `<div class="sb-stage">${stage.stage}</div>${chapters}`;
        }).join('');
        const percent = Math.round(completed.size / allLessons.length * 100);
        $('progressFill').style.width = percent + '%';
        $('progressText').textContent = `${completed.size}/${allLessons.length}`;
        document.querySelector('.progress-track').setAttribute('aria-valuenow', String(percent));

        $('btnPrev').disabled = currentIndex === 0;
        const nextIndex = currentIndex + 1;
        const atEnd = nextIndex === allLessons.length;
        $('btnNext').disabled = atEnd || !isUnlocked(nextIndex, completed);
        $('btnNext').title = atEnd ? '已到最后一关' : $('btnNext').disabled ? '完成本关后解锁' : '下一关 Alt+→';
    }

    function closeAnswer(returnFocus = false) {
        answerPanel.hidden = true;
        answerButton.setAttribute('aria-expanded', 'false');
        if (returnFocus) answerButton.focus();
    }

    function openAnswer() {
        const lesson = currentLesson();
        Storage.markUsedAnswer(lesson.id);
        $('answerCode').textContent = lesson.answer;
        answerPanel.hidden = false;
        answerButton.setAttribute('aria-expanded', 'true');
        $('btnCloseAnswer').focus();
    }

    function showOutput(view, text, isError = false) {
        view.output.textContent = text;
        view.output.classList.toggle('has-error', isError);
    }

    function setStatus(view, message = '', state = '') {
        view.status.textContent = message;
        view.status.className = state ? 'run-status ' + state : 'run-status';
    }

    function setRunning(view, running) {
        const label = running ? '停止' : '运行';
        view.run.querySelector('span').textContent = label;
        view.run.setAttribute('aria-label', label + '代码');
    }

    function cancelRun({ announce = false } = {}) {
        if (!activeRun) return;
        const { view, controller } = activeRun;
        activeRun = null;
        controller.abort();
        setRunning(view, false);
        setStatus(view, announce ? '已停止' : '');
    }

    function loadLesson(index) {
        if (index < 0 || index >= allLessons.length || !isUnlocked(index)) return false;
        cancelRun();
        currentIndex = index;
        const lesson = currentLesson();
        $('lessonTitle').textContent = lesson.title;
        $('stepIndicator').textContent = `${index + 1}/${allLessons.length}`;
        tutorial.innerHTML = lesson.content;
        tutorial.scrollTop = 0;
        loadedSource = Storage.getCode(lesson.id) ?? lesson.starterCode;
        main.editor.value = loadedSource;
        showOutput(main, '');
        setStatus(main);
        closeAnswer();
        renderProgress();
        Storage.setLastLesson(lesson.id);
        sidebarBody.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
        return true;
    }

    function waitForInput(view, count, signal) {
        return new Promise(resolve => {
            function done(value) {
                view.submit.removeEventListener('click', submit);
                view.input.removeEventListener('keydown', onKey);
                signal.removeEventListener('abort', abort);
                view.inputArea.hidden = true;
                resolve(value);
            }

            function submit() { done(view.input.value); }
            function abort() { done(null); }
            function onKey(event) {
                if (event.key !== 'Enter' || event.isComposing) return;
                event.preventDefault();
                submit();
            }

            view.inputHint.textContent = `等待第 ${count} 行输入`;
            view.input.value = '';
            view.inputArea.hidden = false;
            view.submit.addEventListener('click', submit);
            view.input.addEventListener('keydown', onKey);
            signal.addEventListener('abort', abort, { once: true });
            view.input.focus();
        });
    }

    async function grade(lesson, code, result, inputs, signal) {
        if (lesson.requiresComment && !CodeRunner.hasComment(code)) return '请添加一条注释并保持输出不变';
        if (lesson.echoPrefix) {
            if (inputs.length !== 1 || !CodeRunner.checkOutput(result.output, lesson.echoPrefix + inputs[0])) {
                return '请读取一行输入并按题目格式原样输出';
            }
            const sample = inputs[0] === '测试' ? '你好 C#' : '测试';
            const checked = await CodeRunner.run(code, [sample], { signal });
            return checked.status === 'success' && CodeRunner.checkOutput(checked.output, lesson.echoPrefix + sample)
                ? '' : '换一组输入后输出不符，请使用读到的内容';
        }
        return CodeRunner.checkOutput(result.output, lesson.expectedOutput) ? '' : '输出与任务要求不符';
    }

    async function run(view) {
        if (activeRun?.view === view) {
            cancelRun({ announce: true });
            return;
        }
        const lesson = currentLesson();
        const code = view.editor.value;
        const stored = Storage.load();
        if (stored.resetAt !== resetAt || (stored.codeHistory[lesson.id] ?? lesson.starterCode) !== loadedSource) {
            syncStoredProgress();
            return;
        }
        if (!code.trim()) {
            setStatus(view, '请先输入代码', 'err');
            return;
        }
        cancelRun();
        const controller = new AbortController();
        const session = { view, controller };
        activeRun = session;
        const { signal } = controller;
        const inputs = [];
        setRunning(view, true);
        setStatus(view, '运行中');
        showOutput(view, '');
        if (Storage.getCode(lesson.id) !== code) saveDraft(view);

        try {
            let result = await CodeRunner.run(code, inputs, { signal });
            while (result.status === 'input' && !signal.aborted && inputs.length < 32) {
                showOutput(view, result.output);
                setStatus(view, '等待输入');
                const value = await waitForInput(view, inputs.length + 1, signal);
                if (value === null || signal.aborted) return;
                view.run.focus();
                inputs.push(value);
                setStatus(view, '运行中');
                result = await CodeRunner.run(code, inputs, { signal });
            }
            if (signal.aborted || activeRun !== session || Storage.load().resetAt !== resetAt) return;
            if (result.status === 'input') result = { status: 'error', output: '输入超过 32 行，请检查循环结束条件。' };
            showOutput(view, result.output || '（无输出）', result.status !== 'success');
            if (result.status !== 'success') {
                setStatus(view, '运行出错', 'err');
                return;
            }

            const note = await grade(lesson, code, result, inputs, signal);
            if (signal.aborted || activeRun !== session) return;
            const latest = Storage.load();
            if (latest.resetAt !== resetAt || (latest.codeHistory[lesson.id] ?? lesson.starterCode) !== code) {
                syncStoredProgress();
                return;
            }
            if (note) {
                setStatus(view, note, 'err');
                return;
            }
            setStatus(view, '已通过', 'ok');
            if (!Storage.isCompleted(lesson.id)) {
                const usedAnswer = Storage.hasUsedAnswer(lesson.id);
                Storage.completeLesson(lesson.id, usedAnswer ? 0 : 1);
                renderProgress();
                showToast(usedAnswer ? '已通过，查看过参考答案，本关不计星' : '通关！获得一颗星');
            }
        } catch (error) {
            if (activeRun !== session) return;
            showOutput(view, String(error.message || error), true);
            setStatus(view, '运行出错', 'err');
        } finally {
            if (activeRun === session) {
                activeRun = null;
                setRunning(view, false);
            }
        }
    }

    function copyOutput(from, to) {
        showOutput(to, from.output.textContent, from.output.classList.contains('has-error'));
        to.status.textContent = from.status.textContent;
        to.status.className = from.status.className;
    }

    function openFocus(event) {
        cancelRun({ announce: true });
        closeAnswer();
        setCatalog(false);
        focusOpener = event?.currentTarget ?? document.activeElement;
        $('focusTitle').textContent = currentLesson().title;
        focus.editor.value = main.editor.value;
        copyOutput(main, focus);
        dialog.showModal();
        focus.editor.focus();
    }

    function closeFocus() {
        if (!dialog.open) return;
        cancelRun({ announce: true });
        main.editor.value = focus.editor.value;
        copyOutput(focus, main);
        dialog.close();
        if (focusOpener && focusOpener !== document.body) focusOpener.focus();
        else $('btnFocus').focus();
    }

    function resetEditor(view) {
        cancelRun();
        view.editor.value = currentLesson().starterCode;
        showOutput(view, '');
        setStatus(view);
        saveDraft(view);
        view.editor.focus();
    }

    function editRange(editor, start, end, replacement, cursor) {
        editor.setSelectionRange(start, end);
        if (!document.execCommand('insertText', false, replacement)) {
            editor.setRangeText(replacement, start, end);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        editor.setSelectionRange(cursor, cursor);
    }

    function handleEditorKey(event, view) {
        if (event.isComposing || event.keyCode === 229) return;
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            run(view);
            return;
        }
        const editor = view.editor;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (event.ctrlKey && (event.key === '[' || event.key === ']')) {
            event.preventDefault();
            if (event.key === ']') {
                editRange(editor, start, end, '    ', start + 4);
            } else {
                const lineStart = start === 0 ? 0 : editor.value.lastIndexOf('\n', start - 1) + 1;
                const indent = editor.value.slice(lineStart).match(/^ {1,4}/)?.[0].length;
                if (indent) editRange(editor, lineStart, lineStart + indent, '', Math.max(lineStart, start - indent));
            }
            return;
        }
        if (start !== end || event.altKey || event.metaKey || event.ctrlKey) return;
        const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
        if (Object.values(pairs).includes(event.key) && editor.value[start] === event.key) {
            event.preventDefault();
            editor.setSelectionRange(start + 1, start + 1);
        } else if (Object.hasOwn(pairs, event.key)) {
            event.preventDefault();
            editRange(editor, start, end, event.key + pairs[event.key], start + 1);
        }
    }

    for (const view of [main, focus]) {
        view.run.addEventListener('click', () => run(view));
        view.editor.addEventListener('input', () => {
            cancelRun();
            setStatus(view);
            saveDraft(view);
        });
        view.editor.addEventListener('keydown', event => handleEditorKey(event, view));
    }

    $('btnReset').onclick = () => resetEditor(main);
    $('focusReset').onclick = () => resetEditor(focus);
    $('btnClearOutput').onclick = () => showOutput(main, '');
    $('focusClearOutput').onclick = () => showOutput(focus, '');
    $('btnHint').onclick = () => showToast(currentLesson().hint, 'warn');
    answerButton.onclick = () => answerPanel.hidden ? openAnswer() : closeAnswer();
    $('btnCloseAnswer').onclick = () => closeAnswer(true);
    $('btnCopyAnswer').onclick = () => {
        cancelRun();
        main.editor.value = currentLesson().answer;
        saveDraft(main);
        closeAnswer();
        main.editor.focus();
        showToast('已复制参考答案到编辑器，本关不计星');
    };

    $('btnPrev').onclick = () => loadLesson(currentIndex - 1);
    $('btnNext').onclick = () => loadLesson(currentIndex + 1);
    $('btnTheme').onclick = toggleTheme;
    $('btnFocus').onclick = openFocus;
    $('focusClose').onclick = closeFocus;
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeFocus();
    });
    catalogButton.onclick = () => setCatalog(!sidebar.classList.contains('open'));
    sidebarBody.addEventListener('click', event => {
        const button = event.target.closest('button[data-idx]');
        if (!button || !loadLesson(Number(button.dataset.idx))) return;
        setCatalog(false);
        tutorial.focus({ preventScroll: true });
    });
    $('btnResetProgress').onclick = () => {
        if (!confirm('确定清空所有进度和草稿？此操作不可撤销。')) return;
        cancelRun();
        resetAt = Storage.reset();
        loadLesson(0);
        setCatalog(false);
        showToast('进度已重置');
    };
    document.addEventListener('keydown', event => {
        if (event.isComposing || event.defaultPrevented) return;
        if (event.key === 'F11') {
            event.preventDefault();
            if (dialog.open) closeFocus();
            else openFocus();
        } else if (event.key === 'Escape' && !dialog.open) {
            if (!answerPanel.hidden) closeAnswer(true);
            else if (sidebar.classList.contains('open')) setCatalog(false, true);
        } else if (!dialog.open && event.altKey && !event.target.matches('input, textarea')) {
            if (event.key === 'ArrowLeft') loadLesson(currentIndex - 1);
            if (event.key === 'ArrowRight') loadLesson(currentIndex + 1);
        }
    });
    function syncStoredProgress() {
        const latest = Storage.load();
        if (latest.resetAt !== resetAt || !isUnlocked(currentIndex, new Set(latest.completedLessons))) {
            resetAt = latest.resetAt;
            closeFocus();
            loadLesson(0);
            return;
        }
        const lesson = currentLesson();
        const source = latest.codeHistory[lesson.id] ?? lesson.starterCode;
        if (source !== loadedSource) {
            cancelRun();
            loadedSource = source;
            main.editor.value = source;
            focus.editor.value = source;
            const view = dialog.open ? focus : main;
            showOutput(view, '');
            setStatus(view, '草稿已从其他页面更新');
        }
        renderProgress();
    }

    window.addEventListener('storage', event => {
        if (event.key === Storage.key || event.key === null) syncStoredProgress();
    });

    let theme;
    try { theme = localStorage.getItem('csharp_theme'); } catch {}
    applyTheme(theme);
    const savedIndex = allLessons.findIndex(item => item.id === Storage.load().lastLessonId);
    if (!loadLesson(savedIndex)) loadLesson(0);
})();
