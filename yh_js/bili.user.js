// ==UserScript==
// @name          B站增强：默认关闭弹幕+禁用自动播放+独立连播开关
// @namespace     https://github.com/yourname/bilibili-enhance
// @version       1.0.1
// @description   自动关闭弹幕，禁用自动播放，并分别记忆分P/合集/单视频/收藏列表的自动连播状态。
// @author        YourName
// @match         https://www.bilibili.com/video/*
// @match         https://www.bilibili.com/list/*
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// @grant         GM_registerMenuCommand
// @license       MIT
//https://greasyfork.org/scripts/451504/
https://greasyfork.org/scripts/445241/
// ==/UserScript==

(function() {
    'use strict';

    // ========================= 日志工具 =========================
    const logger = {
        log: (...args) => console.log('[B站增强]', ...args),
        error: (...args) => console.error('[B站增强]', ...args),
    };

    // ========================= 功能1：禁用自动播放 =========================
    function disableAutoplayLocalStorage() {
        try {
            let raw = localStorage.getItem('bpx_player_profile');
            let profile = raw ? JSON.parse(raw) : {};
            if (!profile.media) profile.media = {};
            if (profile.media.autoplay !== false) {
                profile.media.autoplay = false;
                localStorage.setItem('bpx_player_profile', JSON.stringify(profile));
                logger.log('已写入 localStorage -> autoplay = false');
            }
        } catch (e) {
            logger.error('localStorage 写入失败:', e);
        }
    }

    // ========================= 功能2：关闭弹幕 =========================
    function closeDanmaku() {
        const danmakuSwitch = document.querySelector('input.bui-danmaku-switch-input');
        if (danmakuSwitch) {
            if (danmakuSwitch.checked) {
                danmakuSwitch.click();
                logger.log('已自动关闭弹幕');
            } else {
                logger.log('弹幕已经是关闭状态');
            }
        } else {
            logger.log('未找到弹幕开关，可能播放器未加载完成');
        }
    }

    // 等待播放器加载后执行两项基础设置
    function applyBasicSettings() {
        disableAutoplayLocalStorage();
        closeDanmaku();
    }

    function waitForPlayerAndApply() {
        let maxWait = 50; // 10秒
        let count = 0;
        function check() {
            if (document.querySelector('input.bui-danmaku-switch-input')) {
                applyBasicSettings();
                return;
            }
            count++;
            if (count <= maxWait) {
                setTimeout(check, 200);
            } else {
                logger.log('等待弹幕开关超时，只尝试禁用自动播放');
                disableAutoplayLocalStorage();
            }
        }
        check();
    }

    // ========================= 功能3：独立自动连播开关（分P/合集/单视频/收藏列表） =========================
    const type = {
        VIDEO: 'video',
        MULTIPART: 'multipart',
        COLLECTION: 'collection',
        PLAYLIST: 'playlist',
    };

    // 为播放列表页面添加自定义开关按钮（如果原生按钮不存在）
    const prepareSwitchButton = () => {
        const continuousBtn = document.createElement('div');
        continuousBtn.className = 'continuous-btn';

        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.textContent = '自动连播';

        const switchBtn = document.createElement('div');
        switchBtn.className = 'switch-btn';

        const switchBlock = document.createElement('div');
        switchBlock.className = 'switch-block';

        switchBtn.appendChild(switchBlock);
        continuousBtn.appendChild(txt);
        continuousBtn.appendChild(switchBtn);

        const headerLeft = document.querySelector('.header-left');
        headerLeft?.appendChild(continuousBtn);
        GM_addStyle(`
            .switch-btn{--switch-btn-width:30px;--switch-btn-height:20px;--switch-btn-gap:2px;cursor:pointer;position:relative;display:inline-block;box-sizing:border-box;border-radius:calc(var(--switch-btn-height)/ 2);width:var(--switch-btn-width);height:var(--switch-btn-height);background-color:var(--graph_bg_thick);transition:.2s}
            .switch-btn .switch-block{position:absolute;border-radius:50%;top:var(--switch-btn-gap);left:var(--switch-btn-gap);width:calc(var(--switch-btn-height) - calc(2 * var(--switch-btn-gap)));height:calc(var(--switch-btn-height) - calc(2 * var(--switch-btn-gap)));background-color:var(--text_white);transition:.2s}
            .switch-btn.on{background:var(--brand_blue)}
            .switch-btn.on .switch-block{left:calc(calc(var(--switch-btn-width) - var(--switch-btn-height)) + var(--switch-btn-gap))}
            .continuous-btn{cursor:pointer;display:flex;align-items:center}
            .continuous-btn .txt{color:var(--text3);font-size:14px;margin-right:4px}
        `);
        return switchBtn;
    };

    let lastVueInstance = null;
    let globalApp = null;

    const correctNextButton = () => {
        if (!globalApp) {
            logger.error('globalApp is not available');
            return;
        }
        const videoData = globalApp.videoData;
        if (!videoData) {
            logger.error('videoData is not available');
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
        const pageStatus = globalApp.continuousPlay;
        let userStatus = GM_getValue(pageType);
        if (userStatus === undefined) {
            GM_setValue(pageType, pageStatus);
        } else if (pageStatus !== userStatus) {
            globalApp.setContinuousPlay(userStatus);
        }
        logger.log(`当前页面类型: ${pageType}`, {
            collection: GM_getValue(type.COLLECTION),
            multipart: GM_getValue(type.MULTIPART),
            video: GM_getValue(type.VIDEO),
            playlist: GM_getValue(type.PLAYLIST),
        });

        let switchButton = document.querySelector('.switch-btn');
        if (!switchButton) {
            switchButton = prepareSwitchButton();
            switchButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                switchButton.classList.toggle('on');
                globalApp.setContinuousPlay(!globalApp.continuousPlay);
                GM_setValue(pageType, globalApp.continuousPlay);
            });
            switchButton.classList.toggle('on', globalApp.continuousPlay);
        } else {
            // 避免重复绑定，先移除再添加
            const newSwitch = switchButton.cloneNode(true);
            switchButton.parentNode?.replaceChild(newSwitch, switchButton);
            switchButton = newSwitch;
            switchButton.addEventListener('click', () => {
                GM_setValue(pageType, !globalApp.continuousPlay);
            });
        }

        // 分P的最后一个视频强制关闭连播
        if (pageType === type.MULTIPART) {
            logger.log('分P的最后一个视频不自动连播');
            if (videoData.embedPlayer.p === videoData.videos) {
                globalApp.setContinuousPlay(false);
                switchButton.classList.remove('on');
            }
        }
        // 合集的最后一个视频强制关闭连播
        if (pageType === type.COLLECTION) {
            logger.log('合集的最后一个视频不自动连播');
            const currentBvid = globalApp.bvid;
            const sections = globalApp.sectionsInfo?.sections;
            const episodes = sections?.[0]?.episodes;
            if (episodes && episodes.length > 0) {
                const lastBvid = episodes[episodes.length - 1]?.bvid;
                if (currentBvid === lastBvid) {
                    globalApp.setContinuousPlay(false);
                    switchButton.classList.remove('on');
                }
            }
        }
    };

    const hookVueInstance = (vueInstance) => {
        if (!vueInstance || vueInstance === lastVueInstance) return;
        lastVueInstance = vueInstance;
        globalApp = vueInstance;
        correctNextButton();
        if (!vueInstance.__correctNextButtonHooked) {
            const __loadVideoData = vueInstance.loadVideoData;
            vueInstance.loadVideoData = function() {
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
        const observer = new MutationObserver(() => {
            const app = document.querySelector('#app');
            if (app?.__vue__) {
                hookVueInstance(app.__vue__);
            }
        });
        observer.observe(appContainer, { childList: true, subtree: true });
    };

    const registerMenuCommands = () => {
        Object.entries(type).forEach(([key, value]) => {
            const status = GM_getValue(value);
            const statusText = status ? '✅ 开启' : '❌ 关闭';
            const typeMap = {
                [type.VIDEO]: '单视频',
                [type.MULTIPART]: '分P',
                [type.COLLECTION]: '合集',
                [type.PLAYLIST]: '收藏列表',
            };
            GM_registerMenuCommand(`${typeMap[value]} 连播: ${statusText}`, () => {
                GM_setValue(value, !status);
                location.reload();
            });
        });
    };

    // ========================= 初始化 =========================
    // 1. 启动基础设置（自动播放+弹幕）
    waitForPlayerAndApply();
    // 2. 启动独立连播开关
    registerMenuCommands();
    observeVueInstance();

    // 额外监听 SPA 导航，确保基础设置在页面切换后重新生效
    let currentUrl = location.href;
    function handleUrlChange() {
        const newUrl = location.href;
        if (newUrl !== currentUrl) {
            currentUrl = newUrl;
            setTimeout(waitForPlayerAndApply, 800);
        }
    }
    window.addEventListener('popstate', handleUrlChange);
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        handleUrlChange();
    };
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        handleUrlChange();
    };
    setInterval(handleUrlChange, 2000);
})();
