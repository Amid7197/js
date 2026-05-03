// ==UserScript==
// @name         哔哩哔哩 - 自动开播与连播控制
// @namespace    https://github.com/combined-bilibili-script
// @version      1.0.2
// @description  强制关闭视频自动开播和弹幕，智能控制自动连播按钮：单P关闭，分P/合集/播放列表自动开启（末集关闭）。
// @author       Amid7197_ai, MaxChang3
// @match        https://www.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 功能1：彻底关闭自动开播 + 强制关闭弹幕 ====================
    function killAutoplayAndDanmaku() {
        // 1. 写 localStorage 关闭自动开播（原逻辑保留）
        try {
            let raw = localStorage.getItem('bpx_player_profile');
            let profile = raw ? JSON.parse(raw) : {};

            if (!profile.media) {
                profile.media = {};
            }
            profile.media.autoplay = false;

            // 弹幕设置也写一下，虽然可能用不上，但以防万一
            if (!profile.dmSetting) {
                profile.dmSetting = {};
            }
            profile.dmSetting.dmSwitch = false;

            localStorage.setItem('bpx_player_profile', JSON.stringify(profile));
            console.log("✅ 已强制写入 bpx_player_profile -> autoplay=false, dmSwitch=false");
        } catch (e) {
            console.warn("写入 localStorage 警告:", e);
        }

        // 2. 直接操作弹幕按钮，物理关闭弹幕
        try {
            // 选择器 .bpx-player-dm-switch 内通常包含一个 checkbox
            const dmSwitchContainer = document.querySelector('.bpx-player-dm-switch');
            if (dmSwitchContainer) {
                const checkbox = dmSwitchContainer.querySelector('input[type="checkbox"]');
                if (checkbox && checkbox.checked) {
                    checkbox.checked = false;
                    // 触发原生事件，通知播放器状态变化
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    // 有些播放器可能需要 click 事件
                    checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    console.log('✅ 已强制关闭弹幕按钮');
                } else if (checkbox && !checkbox.checked) {
                    console.log('✅ 弹幕按钮已经是关闭状态，无需操作');
                } else {
                    // 可能按钮本身不是 checkbox，尝试直接点击容器
                    dmSwitchContainer.click();
                    console.log('⚠️ 未找到 checkbox，尝试直接点击弹幕按钮容器');
                }
            }
        } catch (e) {
            console.warn('关闭弹幕按钮时出错:', e);
        }
    }

    // 立刻执行
    killAutoplayAndDanmaku();

    // 延时补刀（弹幕按钮可能稍后加载）
    [1000, 2000, 4000, 6000].forEach(ms => {
        setTimeout(killAutoplayAndDanmaku, ms);
    });

    // 监听播放器区域，一旦弹幕按钮出现就立即关闭
    const observerDM = new MutationObserver(() => {
        const dmSwitch = document.querySelector('.bpx-player-dm-switch');
        if (dmSwitch) {
            const checkbox = dmSwitch.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                checkbox.checked = false;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('🔄 检测到弹幕按钮重新开启，已强制关闭');
            }
        }
    });
    // 仅观察 bpx-player 区域，减少性能消耗
    const playerContainer = document.querySelector('#bilibili-player, .bpx-player-video-area');
    if (playerContainer) {
        observerDM.observe(playerContainer, { childList: true, subtree: true });
    }

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
