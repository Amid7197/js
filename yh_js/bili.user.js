// ==UserScript==
// @name         哔哩哔哩 - 自动开播与连播控制
// @namespace    https://github.com/combined-bilibili-script
// @version      1.0.7
// @description  强制关闭视频自动开播和弹幕；智能控制自动连播按钮：单P关闭，分P/合集/播放列表自动开启（末集关闭）。弹幕关闭后立即停止轮询，长时间找不到开关也会停止。
// @author       MY_AI, MaxChang3
// @match        https://www.bilibili.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 功能1：彻底关闭自动开播 + 物理关闭弹幕 ====================

    // 独立函数：写入 localStorage 关闭自动开播和弹幕开关记录
    function disableAutoplayLocalStorage() {
        try {
            let raw = localStorage.getItem('bpx_player_profile');
            let profile = raw ? JSON.parse(raw) : {};
            if (!profile.media) profile.media = {};
            profile.media.autoplay = false;
            if (!profile.dmSetting) profile.dmSetting = {};
            profile.dmSetting.dmSwitch = false;
            localStorage.setItem('bpx_player_profile', JSON.stringify(profile));
            console.log("✅ 已写入 localStorage -> autoplay=false, dmSwitch=false");
        } catch (e) {
            console.warn("localStorage 写入警告:", e);
        }
    }

    // 独立函数：使用正确选择器物理关闭弹幕（模拟真实点击）
    function forceCloseDanmaku() {
        try {
            const danmakuInput = document.querySelector('.bui-danmaku-switch-input');
            if (danmakuInput) {
                if (danmakuInput.checked) {
                    danmakuInput.click();
                    console.log('🔇 弹幕已通过 .click() 关闭');
                } else {
                    console.log('🔇 弹幕已处于关闭状态');
                }
                return true; // 操作成功或已关闭
            }
        } catch (e) {
            console.warn('关闭弹幕时出错:', e);
        }
        return false; // 未找到元素
    }

    // 初始化时立即执行 localStorage 写入（仅一次）
    disableAutoplayLocalStorage();

    // ==================== 弹幕关闭与持续监听（优化版） ====================
    let danmakuCheckTimer = null;

    // 启动轮询检查：成功关闭一次立即停止，10秒未找到开关也停止
    function startDanmakuPolling() {
        // 清除之前的定时器
        if (danmakuCheckTimer) clearInterval(danmakuCheckTimer);
        let notFoundCount = 0; // 未找到开关的连续次数
        danmakuCheckTimer = setInterval(() => {
            const result = forceCloseDanmaku();
            if (result) {
                // 弹幕已确认关闭（或成功操作），立即停止轮询
                console.log('🛑 弹幕已确认关闭，停止轮询');
                clearInterval(danmakuCheckTimer);
                danmakuCheckTimer = null;
            } else {
                notFoundCount++;
                if (notFoundCount > 10) {
                    // 超过10秒仍未找到弹幕开关，放弃轮询
                    console.log('⚠️ 长时间未找到弹幕开关，暂停轮询');
                    clearInterval(danmakuCheckTimer);
                    danmakuCheckTimer = null;
                }
            }
        }, 1000);
    }

    // 监听 SPA 路由变化（视频跳转、番剧切换等）
    let lastPath = location.pathname;
    const routerObserver = new MutationObserver(() => {
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            console.log('🔄 检测到路由变化，重新开始弹幕轮询');
            startDanmakuPolling();
        }
    });
    routerObserver.observe(document.body, { childList: true, subtree: true });

    // 启动首次轮询
    startDanmakuPolling();

    // ==================== 功能2：自动连播按钮矫正 ====================
    const logger = {
        log: (...args) => console.log('[Correct-Next-Button]', ...args),
        error: (...args) => console.error('[Correct-Next-Button]', ...args),
    };

    const type = {
        VIDEO: 'video',
        MULTIPART: 'multipart',
        COLLECTION: 'collection',
        PLAYLIST: 'playlist',
    };

    let lastVueInstance = null;
    let globalApp = null;

    const isLastEpisode = (pageType, app) => {
        if (pageType === type.MULTIPART) {
            const { embedPlayer, videos } = app.videoData;
            return embedPlayer.p === videos;
        }
        if (pageType === type.COLLECTION) {
            const sections = app.sectionsInfo?.sections;
            const episodes = sections?.[0]?.episodes;
            if (episodes && episodes.length > 0) {
                const lastBvid = episodes[episodes.length - 1]?.bvid;
                return app.bvid === lastBvid;
            }
            return false;
        }
        if (pageType === type.PLAYLIST) {
            const playlist = app.playlist;
            if (!playlist) return false;
            const list = playlist.list || playlist.videos;
            const current = playlist.current ?? playlist.index;
            if (list && current !== undefined) {
                return current === list.length - 1;
            }
            return false;
        }
        return false;
    };

    const correctNextButton = () => {
        if (!globalApp) return;
        const videoData = globalApp.videoData;
        if (!videoData) return;

        const { videos: videosCount } = videoData;
        const pageType =
            videosCount > 1
                ? type.MULTIPART
                : globalApp.isSection
                    ? type.COLLECTION
                    : globalApp.playlist?.type
                        ? type.PLAYLIST
                        : type.VIDEO;

        const desired =
            pageType === type.VIDEO
                ? false
                : !isLastEpisode(pageType, globalApp);

        if (globalApp.continuousPlay !== desired) {
            logger.log(`设置自动连播为 ${desired}，页面类型：${pageType}`);
            globalApp.setContinuousPlay(desired);
        }
    };

    const hookVueInstance = (vueInstance) => {
        if (!vueInstance || vueInstance === lastVueInstance) return;
        lastVueInstance = vueInstance;
        globalApp = vueInstance;
        correctNextButton();

        if (!vueInstance.__correctNextButtonHooked) {
            const __loadVideoData = vueInstance.loadVideoData;
            vueInstance.loadVideoData = function () {
                return __loadVideoData.call(this).then(
                    (res) => {
                        correctNextButton();
                        return res;
                    },
                    (error) => Promise.reject(error)
                );
            };
            vueInstance.__correctNextButtonHooked = true;
        }
    };

    const observeVueInstance = () => {
        const appContainer = document.querySelector('#app');
        if (!appContainer) return;
        if (appContainer.__vue__) {
            hookVueInstance(appContainer.__vue__);
        }
        new MutationObserver(() => {
            const app = document.querySelector('#app');
            if (app?.__vue__) {
                hookVueInstance(app.__vue__);
            }
        }).observe(appContainer, { childList: true, subtree: true });
    };

    observeVueInstance();
})();
