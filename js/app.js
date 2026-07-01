/**
 * app.js — 单页闯关学习应用
 * 专注模式 · 答案侧栏 · Console.ReadLine 输入
 */
(function () {
    const $ = id => document.getElementById(id);

    // DOM
    const lessonTitle    = $('lessonTitle');
    const progressFill   = $('progressFill');
    const progressText   = $('progressText');
    const stepIndicator  = $('stepIndicator');
    const btnPrev        = $('btnPrev');
    const btnNext        = $('btnNext');
    const btnTheme       = $('btnTheme');
    const btnFocus       = $('btnFocus');
    const sidebarBody    = $('sidebarBody');
    const tutorial       = $('tutorial');
    const codeInput      = $('codeInput');
    const btnRun         = $('btnRun');
    const btnReset       = $('btnReset');
    const btnHint        = $('btnHint');
    const btnAnswer      = $('btnAnswer');
    const runStatus      = $('runStatus');
    const outputContent  = $('outputContent');
    const btnClearOutput = $('btnClearOutput');
    const btnResetProgress = $('btnResetProgress');
    const toastEl        = $('toast');

    // Input area
    const inputArea      = $('inputArea');
    const stdinInput     = $('stdinInput');
    const inputHint      = $('inputHint');
    const btnSubmitInput = $('btnSubmitInput');

    // Answer panel
    const answerPanel    = $('answerPanel');
    const answerCode     = $('answerCode');
    const btnCloseAnswer = $('btnCloseAnswer');
    const btnCopyAnswer  = $('btnCopyAnswer');

    // Focus mode
    const focusOverlay   = $('focusOverlay');
    const focusModal     = $('focusModal');
    const focusTitle     = $('focusTitle');
    const focusCodeInput = $('focusCodeInput');
    const focusRun       = $('focusRun');
    const focusReset     = $('focusReset');
    const focusClose     = $('focusClose');
    const focusOutputContent = $('focusOutputContent');
    const focusClearOutput  = $('focusClearOutput');
    const focusInputArea    = $('focusInputArea');
    const focusStdinInput   = $('focusStdinInput');
    const focusSubmitInput  = $('focusSubmitInput');
    const focusInputHint    = $('focusInputHint');

    let allLessons = [];
    let currentIndex = -1;
    let currentLesson = null;
    let focusMode = false;

    // ===== Theme =====
    function initTheme() { applyTheme(localStorage.getItem('csharp_theme') || 'dark'); }
    function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); document.body.setAttribute('data-theme', t); localStorage.setItem('csharp_theme', t); }
    function toggleTheme() { applyTheme((document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark'); }

    // ===== Init =====
    function init() {
        initTheme();
        allLessons = getAllLessonsFlat();
        buildSidebar();
        bindEvents();
        const lastId = Storage.load().lastLessonId;
        const idx = lastId ? allLessons.findIndex(l => l.id === lastId) : -1;
        loadLesson(idx >= 0 ? idx : 0);
    }

    function isUnlocked(index) {
        if (index === 0) return true;
        return Storage.isCompleted(allLessons[index - 1].id);
    }

    // ===== Sidebar =====
    function buildSidebar() {
        const progress = Storage.load();
        const completed = new Set(progress.completedLessons);
        const indexMap = new Map();
        allLessons.forEach((l, i) => indexMap.set(l.id, i));
        let html = '';
        CHAPTERS_DATA.forEach(stage => {
            html += `<div class="sb-stage">${stage.stage}</div>`;
            stage.chapters.forEach(ch => {
                const done = ch.lessons.filter(l => completed.has(l.id)).length;
                const dotClass = done === ch.lessons.length ? 'done' : done > 0 ? 'partial' : '';
                html += `<div class="sb-chapter"><span class="ch-dot ${dotClass}"></span>${ch.title.replace(/^第 \d+ 章：/, '')}</div>`;
                ch.lessons.forEach(l => {
                    const d = completed.has(l.id);
                    const gi = indexMap.get(l.id);
                    const locked = !isUnlocked(gi);
                    const cls = (d ? ' done' : '') + (locked ? ' locked' : '');
                    const icon = d ? '✓' : (locked ? '🔒' : '○');
                    html += `<div class="sb-lesson${cls}" data-id="${l.id}" data-idx="${gi}"><span class="ls-icon">${icon}</span><span class="ls-name">${l.title}</span></div>`;
                });
            });
        });
        sidebarBody.innerHTML = html;
    }

    // ===== Load Lesson =====
    function loadLesson(index) {
        if (index < 0 || index >= allLessons.length) return;
        if (!isUnlocked(index)) { showToast('⚠️ 请先完成上一关', 'warn'); return; }
        currentIndex = index;
        const item = allLessons[index];
        currentLesson = item.lesson;

        lessonTitle.textContent = item.lesson.title;
        stepIndicator.textContent = `${index + 1}/${allLessons.length}`;
        updateProgress();

        sidebarBody.querySelectorAll('.sb-lesson').forEach(el => el.classList.toggle('active', el.dataset.id === item.id));
        const activeEl = sidebarBody.querySelector('.sb-lesson.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

        tutorial.innerHTML = item.lesson.content + `
            <div class="task-box">
                <strong>🎯 任务</strong>：修改右侧代码，运行后让输出与要求一致即可通关。
                <br><span style="font-size:11px;color:var(--text3)">快捷键：<span class="kbd">Ctrl+Enter</span> 运行 &nbsp; <span class="kbd">Alt+←</span> <span class="kbd">Alt+→</span> 切关 &nbsp; <span class="kbd">F11</span> 专注</span>
            </div>`;

        const saved = Storage.getCode(item.id);
        codeInput.value = saved || item.lesson.starterCode;

        outputContent.textContent = '';
        outputContent.classList.remove('has-error');
        runStatus.textContent = '';
        runStatus.className = 'run-status';
        inputArea.hidden = true;

        const p = Storage.load(); p.lastLessonId = item.id; Storage.save(p);
        btnPrev.disabled = index === 0;
        btnNext.disabled = index === allLessons.length - 1;

        // Close answer panel on lesson switch
        answerPanel.classList.remove('open');
    }

    function updateProgress() {
        const c = Storage.load().completedLessons.length, t = allLessons.length;
        const pct = t ? Math.round(c / t * 100) : 0;
        progressFill.style.width = pct + '%';
        progressText.textContent = `${c}/${t}`;
        document.querySelector('.progress-track').setAttribute('aria-valuenow', String(pct));
    }

    // ===== Console.ReadLine Input Support =====
    // We pre-ask for all inputs before running, then feed them in order
    function collectReadLineCalls(code) {
        const m = code.match(/Console\.ReadLine\s*\(\)/g);
        return m ? m.length : 0;
    }

    let pendingInputs = [];

    // ===== Run Code =====
    async function runCode(useFocusEditor) {
        const editor = useFocusEditor ? focusCodeInput : codeInput;
        const out = useFocusEditor ? focusOutputContent : outputContent;
        const statusEl = useFocusEditor ? null : runStatus;
        const code = editor.value;
        if (!code.trim()) return;

        // Check if code uses Console.ReadLine
        const readlineCount = collectReadLineCalls(code);
        pendingInputs = [];

        if (readlineCount > 0) {
            // 预填输入模式：运行前一次性收齐所有 Console.ReadLine 所需输入，再按顺序喂给程序
            // 因此无法支持"先输出提示再读输入"的交互式程序，入门关卡均按此模式设计
            const inputAreaEl = useFocusEditor ? focusInputArea : inputArea;
            const inputEl = useFocusEditor ? focusStdinInput : stdinInput;
            const submitBtn = useFocusEditor ? focusSubmitInput : btnSubmitInput;
            const hintEl = useFocusEditor ? focusInputHint : inputHint;

            for (let i = 0; i < readlineCount; i++) {
                inputAreaEl.hidden = false;
                hintEl.textContent = `⌨ 输入 ${i + 1}/${readlineCount}：`;
                inputEl.value = '';
                inputEl.focus();

                const val = await new Promise(resolve => {
                    const handler = () => { resolve(inputEl.value); inputEl.value = ''; };
                    const enterHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); handler(); } };
                    submitBtn.onclick = handler;
                    inputEl.onkeydown = enterHandler;
                });
                pendingInputs.push(val);
            }
            // 清理事件引用，避免下次运行残留触发
            submitBtn.onclick = null;
            inputEl.onkeydown = null;
            inputAreaEl.hidden = true;
        }

        if (!useFocusEditor) { btnRun.disabled = true; runStatus.textContent = '⏳'; runStatus.className = 'run-status'; }
        out.textContent = '';
        out.classList.remove('has-error');

        const result = await CodeRunner.run(code, pendingInputs);

        out.textContent = result.output || '(无输出)';
        if (statusEl) {
            statusEl.textContent = result.status === 'success' ? '✓ 完成' : '✗ 出错';
            statusEl.className = 'run-status ' + (result.status === 'success' ? 'ok' : 'err');
        }
        if (result.status !== 'success') out.classList.add('has-error');
        if (!useFocusEditor) btnRun.disabled = false;

        Storage.saveCode(currentLesson.id, code);

        // Check pass (only from main editor, not focus)
        if (!useFocusEditor && result.status === 'success' && currentLesson.expectedOutput &&
            CodeRunner.checkOutput(result.output, currentLesson.expectedOutput)) {
            const already = Storage.isCompleted(currentLesson.id);
            const usedAns = Storage.hasUsedAnswer(currentLesson.id);
            if (!already) {
                // 用过参考答案的关：解锁但不奖励星星、不庆祝
                Storage.completeLesson(currentLesson.id, usedAns ? 0 : 1);
                showToast(usedAns ? '✓ 通过（参考答案，不计 ⭐）' : '🎉 通关！⭐ +1');
                buildSidebar();
                updateProgress();
            }
        }
    }

    // ===== Focus Mode =====
    function openFocus() {
        focusMode = true;
        focusOverlay.classList.add('show');
        focusModal.classList.add('show');
        focusTitle.textContent = currentLesson ? currentLesson.title : '专注模式';
        focusCodeInput.value = codeInput.value;
        focusOutputContent.textContent = outputContent.textContent;
        focusInputArea.hidden = true;
        focusCodeInput.focus();
    }
    function closeFocus() {
        focusMode = false;
        focusOverlay.classList.remove('show');
        focusModal.classList.remove('show');
        // Sync code back
        codeInput.value = focusCodeInput.value;
        outputContent.textContent = focusOutputContent.textContent;
    }

    // ===== Answer Panel =====
    function openAnswer() {
        if (!currentLesson) return;
        // 只要查看过答案就标记不计星（无需等到复制）
        Storage.markUsedAnswer(currentLesson.id);
        answerCode.textContent = currentLesson.answer;
        answerPanel.classList.add('open');
    }
    function closeAnswer() { answerPanel.classList.remove('open'); }
    function toggleAnswer() {
        answerPanel.classList.contains('open') ? closeAnswer() : openAnswer();
    }

    // ===== Events =====
    function bindEvents() {
        btnRun.onclick = () => runCode(false);
        btnReset.onclick = () => {
            if (!currentLesson) return;
            codeInput.value = currentLesson.starterCode;
            outputContent.textContent = ''; outputContent.classList.remove('has-error');
            runStatus.textContent = ''; runStatus.className = 'run-status';
            Storage.saveCode(currentLesson.id, currentLesson.starterCode);
        };
        btnHint.onclick = () => { if (currentLesson) showToast('💡 ' + currentLesson.hint, 'warn'); };
        btnAnswer.onclick = toggleAnswer;
        btnCloseAnswer.onclick = closeAnswer;
        btnCopyAnswer.onclick = () => {
            if (!currentLesson) return;
            codeInput.value = currentLesson.answer;
            Storage.markUsedAnswer(currentLesson.id);
            closeAnswer();
            showToast('已复制到编辑器（参考答案，本关不计 ⭐）');
        };
        btnClearOutput.onclick = () => { outputContent.textContent = ''; outputContent.classList.remove('has-error'); };

        btnPrev.onclick = () => loadLesson(currentIndex - 1);
        btnNext.onclick = () => loadLesson(currentIndex + 1);
        btnTheme.onclick = toggleTheme;
        btnFocus.onclick = openFocus;

        // Focus mode
        focusOverlay.onclick = closeFocus;
        focusClose.onclick = closeFocus;
        focusRun.onclick = () => runCode(true);
        focusReset.onclick = () => { if (currentLesson) focusCodeInput.value = currentLesson.starterCode; focusOutputContent.textContent = ''; };
        focusClearOutput.onclick = () => { focusOutputContent.textContent = ''; };
        focusSubmitInput.onclick = () => { /* handled in runCode */ };
        focusStdinInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); /* handled in runCode */ } });

        btnResetProgress.onclick = () => {
            if (confirm('确定清空所有进度？不可恢复！')) { Storage.reset(); buildSidebar(); updateProgress(); showToast('进度已重置'); }
        };

        sidebarBody.addEventListener('click', e => {
            const el = e.target.closest('.sb-lesson');
            if (!el || el.classList.contains('locked')) return;
            const idx = parseInt(el.dataset.idx, 10);
            if (!isNaN(idx)) loadLesson(idx);
        });

        // Keyboard
        codeInput.addEventListener('keydown', handleEditorKeys);
        focusCodeInput.addEventListener('keydown', handleEditorKeys);

        document.addEventListener('keydown', e => {
            if (e.target === codeInput || e.target === focusCodeInput || e.target === stdinInput || e.target === focusStdinInput) return;
            if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); loadLesson(currentIndex - 1); }
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); loadLesson(currentIndex + 1); }
            if (e.key === 'F11') { e.preventDefault(); focusMode ? closeFocus() : openFocus(); }
            if (e.key === 'Escape' && focusMode) { e.preventDefault(); closeFocus(); }
        });
    }

    function handleEditorKeys(e) {
        // Ctrl/Cmd + Enter 运行
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runCode(e.target === focusCodeInput);
            return;
        }
        // Tab 缩进 / Shift+Tab 反缩进
        if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.target;
            const s = ta.selectionStart, en = ta.selectionEnd;
            if (e.shiftKey) {
                // 反缩进：删除光标行前最多4个空格
                const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
                const lineHead = ta.value.substring(lineStart, lineStart + 4);
                const cut = lineHead.match(/^ {1,4}/);
                if (cut) {
                    ta.value = ta.value.substring(0, lineStart) + ta.value.substring(lineStart + cut[0].length);
                    ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - cut[0].length);
                }
            } else {
                ta.value = ta.value.substring(0, s) + '    ' + ta.value.substring(en);
                ta.selectionStart = ta.selectionEnd = s + 4;
            }
            return;
        }
        // 自动配对：() [] {} "" ''（输入时自动补全并光标居中；遇同字符则跳过）
        const pairs = {'(':')','[':']','{':'}','"':'"',"'":"'"};
        if (pairs[e.key]) {
            const ta = e.target;
            const s = ta.selectionStart, en = ta.selectionEnd;
            if (s === en) {
                e.preventDefault();
                ta.value = ta.value.substring(0, s) + e.key + pairs[e.key] + ta.value.substring(en);
                ta.selectionStart = ta.selectionEnd = s + 1;
            }
        }
    }

    // ===== Toast =====
    function showToast(msg, type) {
        toastEl.textContent = msg;
        toastEl.className = 'toast show' + (type === 'warn' ? ' warn' : '');
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(() => toastEl.className = 'toast', 2400);
    }

    init();
})();
