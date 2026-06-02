// ==UserScript==
// @name         B站极简增强 - 播放器模式 & 布局 & 弹幕 & 评论优化 & 自动开播 & 智能连播
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  整合面板（紧凑布局）：播放器模式、移动标题/UP主信息、评论优化、弹幕控制、自动开播、智能连播
// @author       aiedit
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-body
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_NAME = 'B站极简增强';
    let loadReady = false;
    let menuVisible = false;
    let globalApp = null;
    let lastVueInstance = null;

    const VIDEO_TYPE = {
        VIDEO: 'video',
        MULTIPART: 'multipart',
        COLLECTION: 'collection',
        PLAYLIST: 'playlist',
    };

    function initConfig() {
        const defaults = {
            playerMode: 1,
            moveTitleUpinfo: true,
            removeKeyword: true,
            removeUselessComment: true,
            danmakuEnabled: false,
            danmakuMode: 0,
            autoPlayEnabled: false,
            autoPlayMode: 1
        };

        let isFirstRun = GM_getValue('playerMode') === undefined &&
                         GM_getValue('moveTitleUpinfo') === undefined &&
                         GM_getValue('removeKeyword') === undefined &&
                         GM_getValue('removeUselessComment') === undefined &&
                         GM_getValue('danmakuEnabled') === undefined &&
                         GM_getValue('autoPlayEnabled') === undefined &&
                         GM_getValue(VIDEO_TYPE.VIDEO) === undefined &&
                         GM_getValue(VIDEO_TYPE.MULTIPART) === undefined &&
                         GM_getValue(VIDEO_TYPE.COLLECTION) === undefined &&
                         GM_getValue(VIDEO_TYPE.PLAYLIST) === undefined;

        if (GM_getValue('playerMode') === undefined) GM_setValue('playerMode', defaults.playerMode);
        if (GM_getValue('moveTitleUpinfo') === undefined) GM_setValue('moveTitleUpinfo', defaults.moveTitleUpinfo);
        if (GM_getValue('removeKeyword') === undefined) GM_setValue('removeKeyword', defaults.removeKeyword);
        if (GM_getValue('removeUselessComment') === undefined) GM_setValue('removeUselessComment', defaults.removeUselessComment);
        if (GM_getValue('danmakuEnabled') === undefined) GM_setValue('danmakuEnabled', defaults.danmakuEnabled);
        if (GM_getValue('danmakuMode') === undefined) GM_setValue('danmakuMode', defaults.danmakuMode);
        if (GM_getValue('autoPlayEnabled') === undefined) GM_setValue('autoPlayEnabled', defaults.autoPlayEnabled);
        if (GM_getValue('autoPlayMode') === undefined) GM_setValue('autoPlayMode', defaults.autoPlayMode);

        if (isFirstRun) {
            menuVisible = true;
            console.log(`[${SCRIPT_NAME}] 首次使用，自动打开设置面板`);
        }
    }

    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'bili-plus-panel';
        panel.innerHTML = `
            <div id="bili-plus-panel-content">
                <div id="bili-plus-panel-header">
                    <span id="bili-plus-panel-title">⚙️ B站极简增强</span>
                    <button id="bili-plus-panel-close">✕</button>
                </div>
                <div id="bili-plus-panel-body">
                    <!-- 播放器模式 -->
                    <div class="bili-plus-section">
                        <div class="bili-plus-section-title">播放器模式</div>
                        <div class="bili-plus-option">
                            <label><input type="radio" name="playerMode" value="0"> 默认模式</label>
                            <label><input type="radio" name="playerMode" value="1"> 自动宽屏</label>
                            <label><input type="radio" name="playerMode" value="2"> 网页全屏</label>
                        </div>
                    </div>
                    <hr>
                    <!-- 布局优化 -->
                    <div class="bili-plus-section">
                        <div class="bili-plus-section-title">布局优化</div>
                        <div class="bili-plus-option">
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="moveTitleUpinfo"> 移动标题/UP主信息到下方
                            </label>
                        </div>
                    </div>
                    <hr>
                    <!-- 评论优化（并排） -->
                    <div class="bili-plus-section">
                        <div class="bili-plus-section-title">评论优化</div>
                        <div class="bili-plus-option" style="display: flex; gap: 20px; flex-wrap: wrap;">
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="removeKeyword"> 去除评论蓝色关键字
                            </label>
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="removeUselessComment"> 隐藏纯@评论
                            </label>
                        </div>
                    </div>
                    <hr>
                    <!-- 弹幕控制 -->
                    <div class="bili-plus-section">
                        <div class="bili-plus-section-title">弹幕控制</div>
                        <div class="bili-plus-option" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="danmakuEnabled"> 启用强制弹幕状态
                            </label>
                            <span id="danmakuModeRow" style="display: none; white-space: nowrap;">
                                <label><input type="radio" name="danmakuMode" value="0"> 总是开启</label>
                                <label><input type="radio" name="danmakuMode" value="1"> 总是关闭</label>
                            </span>
                        </div>
                    </div>
                    <hr>
                    <!-- 自动开播控制 -->
                    <div class="bili-plus-section">
                        <div class="bili-plus-section-title">自动开播控制</div>
                        <div class="bili-plus-option" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="autoPlayEnabled"> 启用自动开播控制
                            </label>
                            <span id="autoPlayModeRow" style="display: none; white-space: nowrap;">
                                <label><input type="radio" name="autoPlayMode" value="0"> 总是开启</label>
                                <label><input type="radio" name="autoPlayMode" value="1"> 总是关闭</label>
                            </span>
                        </div>
                    </div>
                    <hr>
                    <!-- 智能连播（分P、合集、列表并排，单视频单独） -->
                    <div class="bili-plus-section">
                        <div class="bili-plus-section-title">智能连播（勾选代表连播）</div>
                        <div class="bili-plus-option" style="display: flex; gap: 20px; flex-wrap: wrap;">
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="autoNextMultipart" disabled> 分P视频
                            </label>
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="autoNextCollection" disabled> 合集视频
                            </label>
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="autoNextPlaylist" disabled> 收藏列表
                            </label>
                        </div>
                        <div class="bili-plus-option">
                            <label class="bili-plus-switch">
                                <input type="checkbox" id="autoNextVideo" disabled> 单视频
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        GM_addStyle(`
            #bili-plus-panel {
                position: fixed;
                top: 20%;
                left: 50%;
                transform: translateX(-50%);
                z-index: 100000;
                background: #fff;
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.15);
                font-size: 14px;
                color: #222;
                width: 480px;
                display: ${menuVisible ? 'block' : 'none'};
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            #bili-plus-panel-content { padding: 16px; }
            #bili-plus-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            #bili-plus-panel-title { font-weight: 600; font-size: 16px; }
            #bili-plus-panel-close {
                background: transparent;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #666;
            }
            .bili-plus-section { margin: 10px 0; }
            .bili-plus-section-title {
                font-weight: 600;
                margin-bottom: 6px;
                color: #00a1d6;
            }
            .bili-plus-option { margin: 6px 0; }
            .bili-plus-switch { display: flex; align-items: center; cursor: pointer; white-space: nowrap; }
            input[type="radio"], input[type="checkbox"] { margin-right: 6px; }
            hr { border: 0.5px solid #eee; }
            #danmakuModeRow label, #autoPlayModeRow label { margin-right: 10px; }
            @media (prefers-color-scheme: dark) {
                #bili-plus-panel {
                    background: #2a2a2a;
                    color: #eee;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.5);
                }
                #bili-plus-panel-close { color: #aaa; }
                .bili-plus-section-title { color: #23ade5; }
                hr { border-color: #444; }
            }
        `);

        bindPanelEvents();
    }

    function bindPanelEvents() {
        document.getElementById('bili-plus-panel-close').addEventListener('click', () => {
            menuVisible = false;
            document.getElementById('bili-plus-panel').style.display = 'none';
        });

        let isDragging = false, startX, startY, initialLeft, initialTop;
        const panelHeader = document.getElementById('bili-plus-panel-header');
        panelHeader.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = document.getElementById('bili-plus-panel').getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const panel = document.getElementById('bili-plus-panel');
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = (initialLeft + dx) + 'px';
            panel.style.top = (initialTop + dy) + 'px';
            panel.style.transform = 'none';
        });
        window.addEventListener('mouseup', () => { isDragging = false; });

        // 初始化控件状态
        document.querySelector(`input[name="playerMode"][value="${GM_getValue('playerMode')}"]`).checked = true;
        document.getElementById('moveTitleUpinfo').checked = GM_getValue('moveTitleUpinfo');
        document.getElementById('removeKeyword').checked = GM_getValue('removeKeyword');
        document.getElementById('removeUselessComment').checked = GM_getValue('removeUselessComment');
        document.getElementById('danmakuEnabled').checked = GM_getValue('danmakuEnabled');
        document.querySelector(`input[name="danmakuMode"][value="${GM_getValue('danmakuMode')}"]`).checked = true;
        document.getElementById('autoPlayEnabled').checked = GM_getValue('autoPlayEnabled');
        document.querySelector(`input[name="autoPlayMode"][value="${GM_getValue('autoPlayMode')}"]`).checked = true;
        updateDanmakuModeRow();
        updateAutoPlayModeRow();

        // 事件
        document.querySelectorAll('input[name="playerMode"]').forEach(r => {
            r.addEventListener('change', () => {
                GM_setValue('playerMode', parseInt(r.value));
                applyPlayerMode();
            });
        });
        document.getElementById('moveTitleUpinfo').addEventListener('change', e => {
            GM_setValue('moveTitleUpinfo', e.target.checked);
            applyMoveTitle();
        });
        document.getElementById('removeKeyword').addEventListener('change', e => {
            GM_setValue('removeKeyword', e.target.checked);
            applyRemoveKeyword();
        });
        document.getElementById('removeUselessComment').addEventListener('change', e => {
            GM_setValue('removeUselessComment', e.target.checked);
            applyRemoveUselessComment();
        });
        document.getElementById('danmakuEnabled').addEventListener('change', e => {
            GM_setValue('danmakuEnabled', e.target.checked);
            updateDanmakuModeRow();
            applyDanmakuControl();
        });
        document.querySelectorAll('input[name="danmakuMode"]').forEach(r => {
            r.addEventListener('change', () => {
                GM_setValue('danmakuMode', parseInt(r.value));
                applyDanmakuControl();
            });
        });
        document.getElementById('autoPlayEnabled').addEventListener('change', e => {
            GM_setValue('autoPlayEnabled', e.target.checked);
            updateAutoPlayModeRow();
            applyAutoPlayControl();
        });
        document.querySelectorAll('input[name="autoPlayMode"]').forEach(r => {
            r.addEventListener('change', () => {
                GM_setValue('autoPlayMode', parseInt(r.value));
                applyAutoPlayControl();
            });
        });

        // 智能连播事件
        ['autoNextMultipart', 'autoNextCollection', 'autoNextVideo', 'autoNextPlaylist'].forEach(id => {
            document.getElementById(id).addEventListener('change', function(e) {
                const typeMap = {
                    autoNextMultipart: VIDEO_TYPE.MULTIPART,
                    autoNextCollection: VIDEO_TYPE.COLLECTION,
                    autoNextVideo: VIDEO_TYPE.VIDEO,
                    autoNextPlaylist: VIDEO_TYPE.PLAYLIST,
                };
                GM_setValue(typeMap[id], e.target.checked);
                if (globalApp) correctNextButton();
            });
        });
    }

    function updateDanmakuModeRow() {
        document.getElementById('danmakuModeRow').style.display = GM_getValue('danmakuEnabled') ? 'inline' : 'none';
    }
    function updateAutoPlayModeRow() {
        document.getElementById('autoPlayModeRow').style.display = GM_getValue('autoPlayEnabled') ? 'inline' : 'none';
    }

    function syncAutoNextPanel() {
        const mapping = {
            autoNextMultipart: VIDEO_TYPE.MULTIPART,
            autoNextCollection: VIDEO_TYPE.COLLECTION,
            autoNextVideo: VIDEO_TYPE.VIDEO,
            autoNextPlaylist: VIDEO_TYPE.PLAYLIST,
        };
        Object.entries(mapping).forEach(([id, type]) => {
            const cb = document.getElementById(id);
            if (!cb) return;
            const stored = GM_getValue(type);
            if (stored !== undefined) cb.checked = stored;
            cb.disabled = false;
        });
    }

    // ---------- 功能实现 ----------
    function applyPlayerMode() {
        const mode = GM_getValue('playerMode');
        if (mode === 1) {
            const btn = document.querySelector('.bpx-player-ctrl-wide') || document.querySelector('.squirtle-video-widescreen');
            if (btn && !btn.classList.contains('bpx-state-entered') && !btn.classList.contains('active')) btn.click();
        } else if (mode === 2) {
            console.log('网页全屏模式需完整函数支持，此处仅示意');
        } else {
            const btn = document.querySelector('.bpx-player-ctrl-wide');
            if (btn && btn.classList.contains('bpx-state-entered')) btn.click();
            const btn2 = document.querySelector('.squirtle-video-widescreen');
            if (btn2 && btn2.classList.contains('active')) btn2.click();
        }
    }

    function applyMoveTitle() {
        if (!loadReady) return setTimeout(applyMoveTitle, 500);
        const enabled = GM_getValue('moveTitleUpinfo');
        const viewbox = document.getElementById('viewbox_report');
        const upPanel = document.querySelector('.up-panel-container') || document.querySelector('.members-info-container');
        const toolbar = document.getElementById('arc_toolbar_report');
        if (!viewbox || !upPanel || !toolbar) return setTimeout(applyMoveTitle, 500);
        const leftContainer = document.querySelector('.left-container') || document.querySelector('.playlist-container--left');
        if (!leftContainer) return;
        if (enabled) {
            leftContainer.insertBefore(viewbox, toolbar);
            leftContainer.insertBefore(upPanel, toolbar);
            viewbox.setAttribute('mr_layout', 'true');
            upPanel.setAttribute('mr_layout', 'true');
        } else {
            const playerWrap = document.getElementById('playerWrap');
            if (playerWrap) leftContainer.insertBefore(viewbox, playerWrap);
            const rightInner = document.querySelector('.right-container-inner');
            if (rightInner) rightInner.insertBefore(upPanel, document.getElementById('danmukuBox'));
            viewbox.removeAttribute('mr_layout');
            upPanel.removeAttribute('mr_layout');
        }
    }

    function applyRemoveKeyword() {
        function process() {
            const comments = document.querySelector('bili-comments')?.shadowRoot?.querySelector('#feed')?.children;
            if (!comments) return setTimeout(process, 500);
            const enabled = GM_getValue('removeKeyword');
            Array.from(comments).forEach(comment => {
                const richText = comment.shadowRoot?.querySelector('#comment')?.shadowRoot?.querySelector('bili-rich-text');
                const contents = richText?.shadowRoot?.querySelector('#contents');
                if (!contents) return;
                contents.querySelectorAll('a').forEach(a => {
                    if (!a.textContent.includes('@') && !a.textContent.includes('http') && a.href.includes('search.bilibili.com')) {
                        if (enabled) {
                            a.style.pointerEvents = 'none';
                            a.style.cursor = 'text';
                            a.style.color = 'var(--text1)';
                            if (a.children[0]) a.children[0].style.display = 'none';
                        } else {
                            a.style.pointerEvents = '';
                            a.style.cursor = '';
                            a.style.color = '';
                            if (a.children[0]) a.children[0].style.display = '';
                        }
                    }
                });
            });
            setTimeout(process, 1000);
        }
        process();
    }

    function applyRemoveUselessComment() {
        function process() {
            const comments = document.querySelector('bili-comments')?.shadowRoot?.querySelector('#feed')?.children;
            if (!comments) return setTimeout(process, 500);
            const enabled = GM_getValue('removeUselessComment');
            Array.from(comments).forEach(comment => {
                const richText = comment.shadowRoot?.querySelector('#comment')?.shadowRoot?.querySelector('bili-rich-text');
                const contents = richText?.shadowRoot?.querySelector('#contents');
                if (!contents) return;
                const children = contents.children;
                let onlyAt = children.length > 0;
                for (let i = 0; i < children.length; i++) {
                    if (children[i].tagName !== 'A' || !children[i].textContent.startsWith('@')) {
                        onlyAt = false;
                        break;
                    }
                }
                comment.style.display = (enabled && onlyAt) ? 'none' : '';
            });
            setTimeout(process, 1000);
        }
        process();
    }

    function applyDanmakuControl() {
        const enabled = GM_getValue('danmakuEnabled');
        if (!enabled) return;
        const mode = GM_getValue('danmakuMode');
        function trigger() {
            const toggle = document.querySelector('.bui-danmaku-switch-input');
            if (!toggle) return setTimeout(trigger, 500);
            const isOn = toggle.checked;
            if ((mode === 0 && !isOn) || (mode === 1 && isOn)) toggle.click();
        }
        trigger();
    }

    function applyAutoPlayControl() {
        const enabled = GM_getValue('autoPlayEnabled');
        if (!enabled) return;
        const mode = GM_getValue('autoPlayMode');
        try {
            let raw = localStorage.getItem('bpx_player_profile');
            let profile = raw ? JSON.parse(raw) : {};
            if (!profile.media) profile.media = {};
            const desired = (mode === 0);
            if (profile.media.autoplay !== desired) {
                profile.media.autoplay = desired;
                localStorage.setItem('bpx_player_profile', JSON.stringify(profile));
                console.log(`[${SCRIPT_NAME}] 自动开播已设置：autoplay=${desired}`);
            }
        } catch (e) {
            console.warn('写入 localStorage 失败:', e);
        }
    }

    // ---------- 智能连播 ----------
    function correctNextButton() {
        if (!globalApp) return;
        const videoData = globalApp.videoData;
        if (!videoData) return;
        const { videos: videosCount } = videoData;
        const pageType =
            videosCount > 1
                ? VIDEO_TYPE.MULTIPART
                : globalApp.isSection
                    ? VIDEO_TYPE.COLLECTION
                    : globalApp.playlist?.type
                        ? VIDEO_TYPE.PLAYLIST
                        : VIDEO_TYPE.VIDEO;
        const pageStatus = globalApp.continuousPlay;
        const userStatus = GM_getValue(pageType);
        if (userStatus === undefined) {
            GM_setValue(pageType, pageStatus);
        } else if (pageStatus !== userStatus) {
            globalApp.setContinuousPlay(userStatus);
        }
        if (pageType === VIDEO_TYPE.MULTIPART && videoData.embedPlayer?.p === videoData.videos) {
            globalApp.setContinuousPlay(false);
        } else if (pageType === VIDEO_TYPE.COLLECTION) {
            const currentBvid = globalApp.bvid;
            const sections = globalApp.sectionsInfo?.sections;
            const episodes = sections?.[0]?.episodes;
            if (episodes && episodes.length > 0) {
                const lastBvid = episodes[episodes.length - 1]?.bvid;
                if (currentBvid === lastBvid) globalApp.setContinuousPlay(false);
            }
        }
        syncAutoNextPanel();
    }

    function observeVueInstance() {
        const appContainer = document.querySelector('#app');
        if (!appContainer) { setTimeout(observeVueInstance, 200); return; }
        if (appContainer.__vue__) hookVueInstance(appContainer.__vue__);
        const observer = new MutationObserver(() => {
            const app = document.querySelector('#app');
            if (app?.__vue__) hookVueInstance(app.__vue__);
        });
        observer.observe(appContainer, { childList: true, subtree: true });
    }

    function hookVueInstance(vueInstance) {
        if (!vueInstance || vueInstance === lastVueInstance) return;
        lastVueInstance = vueInstance;
        globalApp = vueInstance;
        correctNextButton();
        if (!vueInstance.__correctNextButtonHooked) {
            const __loadVideoData = vueInstance.loadVideoData;
            vueInstance.loadVideoData = function () {
                return __loadVideoData.call(this).then(
                    (res) => { correctNextButton(); return res; },
                    (error) => Promise.reject(error)
                );
            };
            vueInstance.__correctNextButtonHooked = true;
        }
    }

    function checkLoadReady() {
        const input = document.querySelector('.nav-search-input');
        if (input && input.title && (document.querySelector('.bpx-player-video-info') || document.querySelector('.bpx-player-dm-wrap'))) {
            loadReady = true;
            console.log(`[${SCRIPT_NAME}] 页面加载完成`);
            applyPlayerMode();
            applyMoveTitle();
            applyRemoveKeyword();
            applyRemoveUselessComment();
            applyDanmakuControl();
            applyAutoPlayControl();
            observeVueInstance();
            if (globalApp) syncAutoNextPanel();
        } else {
            setTimeout(checkLoadReady, 500);
        }
    }

    initConfig();
    createSettingsPanel();
    checkLoadReady();

    GM_registerMenuCommand('⚙️ 极简增强面板', () => {
        menuVisible = !menuVisible;
        const panel = document.getElementById('bili-plus-panel');
        if (panel) panel.style.display = menuVisible ? 'block' : 'none';
    });
})();
