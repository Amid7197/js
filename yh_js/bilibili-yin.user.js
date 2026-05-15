// ==UserScript==
// @name         Bilibili 视频音量均衡器 (可配置版)
// @namespace    http://tampermonkey.net/
// @version      0.3.0
// @description  通过 Web Audio API 压缩 Bilibili 视频中音频的动态范围，使不同视频或同一视频中差距过大的响度保持一致。防抖音恢复，零停顿。支持菜单命令调整淡入时长和防抖延迟。
// @author       Amid7197 Timothy Tao & Github Copilot
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @match        *://live.bilibili.com/*
// @match        *://www.bilibili.com/list/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @license      MIT
// 原版脚本地址: https://greasyfork.org/scripts/557295
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 默认配置 ====================
    const DEFAULT_FADE_IN_MS = 200;
    const DEFAULT_DEBOUNCE_MS = 500;

    // ==================== 读取存储配置 ====================
    let FADE_IN_DURATION_MS = GM_getValue('fadeInMs', DEFAULT_FADE_IN_MS);
    let DEBOUNCE_DELAY_MS = GM_getValue('debounceMs', DEFAULT_DEBOUNCE_MS);

    // 保存配置的辅助函数
    function saveFadeIn(value) {
        GM_setValue('fadeInMs', value);
        FADE_IN_DURATION_MS = value;
    }

    function saveDebounce(value) {
        GM_setValue('debounceMs', value);
        DEBOUNCE_DELAY_MS = value;
        // 防抖延迟改变后需要重启 observer
        restartObserver();
    }

    // ==================== 菜单命令 ====================
    GM_registerMenuCommand('⚙️ 设置淡入时长 (ms)', () => {
        let newVal = prompt('当前淡入时长（切回页面时音量恢复的淡入时间，单位毫秒（推荐 50 ~ 300））:', FADE_IN_DURATION_MS);
        if (newVal !== null) {
            let num = parseInt(newVal, 10);
            if (!isNaN(num) && num >= 0 && num <= 3000) {
                saveFadeIn(num);
                GM_notification?.(`淡入时长已设为 ${num} ms`, '音量均衡器');
            } else {
                alert('请输入 0~3000 之间的整数');
            }
        }
    });

    GM_registerMenuCommand('⚙️ 设置防抖延迟 (ms)', () => {
        let newVal = prompt('当前防抖延迟（DOM 变化监听延迟，推荐 300~800 毫秒）:', DEBOUNCE_DELAY_MS);
        if (newVal !== null) {
            let num = parseInt(newVal, 10);
            if (!isNaN(num) && num >= 100 && num <= 3000) {
                saveDebounce(num);
                GM_notification?.(`防抖延迟已设为 ${num} ms，已重启监听`, '音量均衡器');
            } else {
                alert('请输入 100~3000 之间的整数');
            }
        }
    });

    // ==================== 辅助函数 ====================
    const $ = s => document.querySelector(s);
    let audioCtx, sourceNode, compressorNode, gainNode, currentVideo;
    let isEnabled = true;
    let shouldKeepPlaying = false;
    let observerTimer = null;
    let currentObserver = null;

    // ==================== 样式 ====================
    const style = document.createElement('style');
    style.textContent = `
        @keyframes bili-eq-bounce { 50% { transform: scaleY(1.6) } }
        .bili-loudness-btn { color: hsla(0,0%,100%,.8); transition: color .3s; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; margin-right: 8px }
        .bili-loudness-btn:hover { color: #fff }
        .bili-loudness-btn.active { color: #00a1d6 !important }
        .bili-loudness-btn .bar { transform-origin: center bottom; transform-box: fill-box }
        .bili-loudness-btn.animating .bar { animation: bili-eq-bounce .4s ease-in-out }
        .bili-loudness-btn.animating .bar-2 { animation-delay: .1s }
        .bili-loudness-btn.animating .bar-3 { animation-delay: .2s }
    `;
    const iconSvg = `<svg viewBox="0 0 22 22" width="22" height="22"><path class="bar bar-1" d="M6 15V7a1 1 0 10-2 0v8a1 1 0 102 0z" fill="currentColor"/><path class="bar bar-2" d="M12 18V4a1 1 0 10-2 0v14a1 1 0 102 0z" fill="currentColor"/><path class="bar bar-3" d="M18 13V9a1 1 0 10-2 0v4a1 1 0 102 0z" fill="currentColor"/></svg>`;

    // ==================== UI ====================
    function updateBtnState() {
        const btn = $('.bili-loudness-btn');
        if (btn) {
            btn.classList.toggle('active', isEnabled);
            btn.title = `音量均衡: ${isEnabled ? '开' : '关'}`;
        }
    }

    // ==================== 音频处理 ====================
    function updateAudioGraph() {
        if (!sourceNode || !audioCtx) return;
        try { sourceNode.disconnect() } catch {}
        try {
            sourceNode.connect(isEnabled ? compressorNode : audioCtx.destination);
        } catch {
            try { sourceNode.connect(audioCtx.destination) } catch {}
        }
        updateBtnState();
    }

    function smoothRestore() {
        if (!gainNode || !audioCtx) return;
        const now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(1, now + FADE_IN_DURATION_MS / 1000);
    }

    function initAudioContext() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        compressorNode = audioCtx.createDynamicsCompressor();
        compressorNode.threshold.value = -50;
        compressorNode.knee.value = 40;
        compressorNode.ratio.value = 12;
        compressorNode.attack.value = 0;
        compressorNode.release.value = 0.25;
        gainNode = audioCtx.createGain();
        compressorNode.connect(gainNode).connect(audioCtx.destination);

        audioCtx.onstatechange = () => {
            if (audioCtx.state === 'running') smoothRestore();
        };
    }

    // ==================== 播放器按钮 ====================
    function tryAddControlBtn() {
        if ($('.bili-loudness-btn')) return;
        const rightControl = $('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right');
        if (!rightControl) return;
        const btn = document.createElement('div');
        btn.className = 'bpx-player-ctrl-btn bili-loudness-btn';
        btn.innerHTML = iconSvg;
        btn.onclick = () => {
            isEnabled = !isEnabled;
            updateAudioGraph();
            btn.classList.remove('animating');
            void btn.offsetWidth;
            btn.classList.add('animating');
        };
        const anchor = rightControl.querySelector('.bpx-player-ctrl-volume, .bilibili-player-video-btn-volume');
        anchor ? rightControl.insertBefore(btn, anchor) : rightControl.appendChild(btn);
        updateBtnState();
    }

    // ==================== 视频处理 ====================
    function processVideo(video) {
        if (currentVideo === video) return;
        try { sourceNode?.disconnect() } catch {}
        currentVideo = video;
        initAudioContext();

        const setup = () => {
            try {
                sourceNode = audioCtx.createMediaElementSource(video);
                updateAudioGraph();
            } catch {}
        };
        video.readyState >= 1 ? setup() : video.addEventListener('loadedmetadata', setup, { once: true });

        const resumeCtx = () => audioCtx?.state === 'suspended' && audioCtx.resume();
        video.addEventListener('play', resumeCtx);
        video.addEventListener('playing', resumeCtx);

        // 防后台暂停（只绑定一次到当前视频）
        video.addEventListener('pause', () => {
            if (shouldKeepPlaying && document.hidden) {
                video.play().catch(() => {});
            }
        });
    }

    // ==================== 全局页面可见性事件 ====================
    document.addEventListener('visibilitychange', () => {
        const video = currentVideo;
        if (!video) return;
        if (document.hidden) {
            shouldKeepPlaying = !video.paused;
        } else {
            if (audioCtx?.state === 'suspended') {
                audioCtx.resume();
            }
            setTimeout(() => { shouldKeepPlaying = false; }, 100);
        }
    });

    // ==================== DOM 监听（防抖 + 可重启） ====================
    function debouncedObserverCallback() {
        tryAddControlBtn();
        const video = document.querySelector('.bpx-player-video-wrap video, .bilibili-player-video video, video');
        if (video) processVideo(video);
    }

    function startObserver() {
        if (currentObserver) {
            currentObserver.disconnect();
            currentObserver = null;
        }
        if (observerTimer) {
            clearTimeout(observerTimer);
            observerTimer = null;
        }

        const targetNode = document.querySelector('#app, .bpx-player, .bilibili-player, body');
        if (!targetNode) {
            // 如果还没出现根节点，稍后再试
            setTimeout(startObserver, 500);
            return;
        }

        currentObserver = new MutationObserver(() => {
            if (observerTimer) clearTimeout(observerTimer);
            observerTimer = setTimeout(debouncedObserverCallback, DEBOUNCE_DELAY_MS);
        });
        currentObserver.observe(targetNode, { childList: true, subtree: true });
    }

    function restartObserver() {
        if (currentObserver) {
            currentObserver.disconnect();
            if (observerTimer) clearTimeout(observerTimer);
            observerTimer = null;
        }
        startObserver();
    }

    // ==================== 初始化 ====================
    function init() {
        document.head.appendChild(style);
        startObserver();
        debouncedObserverCallback();

        document.addEventListener('fullscreenchange', () => setTimeout(async () => {
            if (audioCtx?.state === 'suspended') await audioCtx.resume();
            tryAddControlBtn();
        }, 300));
    }

    // 等待 DOMContentLoaded 或立即执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
