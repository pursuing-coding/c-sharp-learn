const Storage = (() => {
    const key = 'csharp_learn_progress_v1';
    let memory;
    let volatile = false;

    function normalize(value) {
        const progress = value && typeof value === 'object' ? value : {};
        const ids = list => Array.isArray(list) ? [...new Set(list.filter(id => typeof id === 'string'))] : [];
        const count = (number, fallback) => Number.isSafeInteger(number) && number >= 0 ? number : fallback;
        const now = Date.now();
        return {
            version: 1,
            createdAt: count(progress.createdAt, now),
            updatedAt: count(progress.updatedAt, now),
            resetAt: count(progress.resetAt, 0),
            completedLessons: ids(progress.completedLessons),
            usedAnswerLessons: ids(progress.usedAnswerLessons),
            stars: count(progress.stars, 0),
            currentChapter: count(progress.currentChapter, 1),
            codeHistory: Object.fromEntries(Object.entries(progress.codeHistory ?? {}).filter(([id, code]) =>
                /^c\d+l\d+$/.test(id) && typeof code === 'string'
            )),
            streakDays: count(progress.streakDays, 1),
            lastStudyDate: typeof progress.lastStudyDate === 'string' ? progress.lastStudyDate : null,
            lastLessonId: typeof progress.lastLessonId === 'string' ? progress.lastLessonId : null
        };
    }

    function load() {
        if (!volatile) {
            try {
                memory = normalize(JSON.parse(localStorage.getItem(key)));
            } catch {
                memory ??= normalize();
            }
        }
        return normalize(memory);
    }

    function save(progress) {
        memory = normalize({ ...progress, updatedAt: Date.now() });
        try {
            localStorage.setItem(key, JSON.stringify(memory));
            volatile = false;
            return true;
        } catch {
            volatile = true;
            return false;
        }
    }

    function completeLesson(id, stars = 1) {
        const progress = load();
        if (!progress.completedLessons.includes(id)) {
            progress.completedLessons.push(id);
            progress.stars += stars;
            const now = new Date();
            const dateString = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()]
                .map(value => String(value).padStart(2, '0')).join('-');
            const today = dateString(now);
            if (progress.lastStudyDate !== today) {
                now.setDate(now.getDate() - 1);
                progress.streakDays = progress.lastStudyDate === dateString(now) ? progress.streakDays + 1 : 1;
                progress.lastStudyDate = today;
            }
            save(progress);
        }
    }

    function saveCode(id, code) {
        const progress = load();
        if (progress.codeHistory[id] === code) return !volatile;
        progress.codeHistory[id] = code;
        return save(progress);
    }

    function setLastLesson(id) {
        const progress = load();
        if (progress.lastLessonId === id) return;
        progress.lastLessonId = id;
        save(progress);
    }

    function markUsedAnswer(id) {
        const progress = load();
        if (progress.usedAnswerLessons.includes(id)) return;
        progress.usedAnswerLessons.push(id);
        save(progress);
    }

    function reset() {
        const resetAt = Math.max(Date.now(), load().resetAt + 1);
        save(normalize({ resetAt }));
        return resetAt;
    }

    return {
        key,
        load,
        completeLesson,
        saveCode,
        getCode: id => load().codeHistory[id] ?? null,
        setLastLesson,
        reset,
        markUsedAnswer,
        hasUsedAnswer: id => load().usedAnswerLessons.includes(id),
        isCompleted: id => load().completedLessons.includes(id)
    };
})();
