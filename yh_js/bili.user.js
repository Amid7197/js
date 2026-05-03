// ==UserScript==
// @name         哔哩哔哩 - 自动开播与连播控制整合
// @namespace    https://github.com/combined-bilibili-script
// @version      1.0.1
// @description  强制关闭视频自动开播（含弹幕），并根据页面类型智能控制自动连播按钮：单P关闭，分P/合集/播放列表自动开启（末集关闭）。
// @author       Amid7197_ai, MaxChang3
// @match        https://www.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 功能1：彻底关闭自动开播 ====================
    function killAutoplayStrict() {
        try {
            let raw = localStorage.getItem('bpx_player_profile');
            let profile = raw ? JSON.parse(raw) : {};

            if (!profile.media) {
                profile.media = {};
            }

            profile.media.autoplay = false;

            // 可选：同时关闭弹幕
            if (!profile.dmSetting) {
                profile.dmSetting = {};
            }
            profile.dmSetting.dmSwitch = false;

            localStorage.setItem('bpx_player_profile', JSON.stringify(profile));
            console.log("✅ 已强制写入/修正 bpx_player_profile -> media.autoplay = false");
        } catch (e) {
            console.warn("自动开播脚本轻微警告:", e);
        }
    }

    // 立刻执行 + 延时补刀
    killAutoplayStrict();
    setTimeout(killAutoplayStrict, 1000);
    setTimeout(killAutoplayStrict, 3000);
    setTimeout(killAutoplayStrict, 5000);


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
        if (!globalApp) {
            return;
        }
        const videoData = globalApp.videoData;
        if (!videoData) {
            return;
        }

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
