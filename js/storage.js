/**
 * storage.js - 本地进度存储服务
 * 基于 localStorage，无需后端，谁用谁存
 */
const Storage = (function () {
    const STORAGE_KEY = 'csharp_learn_progress_v1';

    /**
     * 默认进度结构
     */
    function defaultProgress() {
        return {
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            completedLessons: [],   // 已完成关卡 ID 列表
            stars: 0,               // 累计获得星星
            currentChapter: 1,      // 当前所在章节
            codeHistory: {},        // 各关卡的代码历史 { lessonId: code }
            streakDays: 1,          // 连续学习天数
            lastStudyDate: null,    // 最近学习日期 yyyy-mm-dd
            lastLessonId: null,     // 最近打开的关卡 ID（恢复上次进度用）
            usedAnswerLessons: []   // 曾复制过参考答案的关卡 ID（不奖励星星，用于防腐）
        };
    }

    /**
     * 读取进度
     */
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultProgress();
            const data = JSON.parse(raw);
            // 兼容性：补齐缺失字段
            const base = defaultProgress();
            return Object.assign(base, data);
        } catch (e) {
            console.warn('读取进度失败，重置为默认:', e);
            return defaultProgress();
        }
    }

    /**
     * 保存进度
     */
    function save(progress) {
        progress.updatedAt = Date.now();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
            return true;
        } catch (e) {
            console.error('保存进度失败:', e);
            return false;
        }
    }

    /**
     * 标记关卡完成
     */
    function completeLesson(lessonId, stars = 1) {
        const progress = load();
        if (!progress.completedLessons.includes(lessonId)) {
            progress.completedLessons.push(lessonId);
            progress.stars += stars;
        }
        updateStreak(progress);
        save(progress);
        return progress;
    }

    /**
     * 保存关卡代码
     */
    function saveCode(lessonId, code) {
        const progress = load();
        progress.codeHistory[lessonId] = code;
        save(progress);
    }

    /**
     * 读取关卡代码
     */
    function getCode(lessonId) {
        const progress = load();
        return progress.codeHistory[lessonId] || null;
    }

    /**
     * 更新连续学习天数
     */
    function updateStreak(progress) {
        const today = new Date().toISOString().slice(0, 10);
        if (progress.lastStudyDate === today) return;
        if (progress.lastStudyDate) {
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            if (progress.lastStudyDate === yesterday) {
                progress.streakDays += 1;
            } else {
                progress.streakDays = 1;
            }
        }
        progress.lastStudyDate = today;
    }

    /**
     * 重置所有进度
     */
    function reset() {
        localStorage.removeItem(STORAGE_KEY);
        return defaultProgress();
    }

    /**
     * 计算完成百分比
     */
    function percentComplete(totalLessons) {
        const progress = load();
        if (!totalLessons) return 0;
        return Math.round((progress.completedLessons.length / totalLessons) * 100);
    }

    /**
     * 标记某关曾复制过参考答案（不奖励星星，用于防腐）
     */
    function markUsedAnswer(lessonId) {
        const progress = load();
        if (!progress.usedAnswerLessons.includes(lessonId)) {
            progress.usedAnswerLessons.push(lessonId);
            save(progress);
        }
        return progress;
    }

    /**
     * 是否曾复制过该关参考答案
     */
    function hasUsedAnswer(lessonId) {
        return load().usedAnswerLessons.includes(lessonId);
    }

    return {
        load,
        save,
        completeLesson,
        saveCode,
        getCode,
        reset,
        percentComplete,
        markUsedAnswer,
        hasUsedAnswer,
        isCompleted: (id) => load().completedLessons.includes(id)
    };
})();
