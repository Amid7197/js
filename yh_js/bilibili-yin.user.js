// ==UserScript==
// @name         Bilibili 视频音量均衡器-自动恢复音频上下文，避免声音中断
// @namespace    http://tampermonkey.net/
// @version      0.2.2
// @description  通过 Web Audio API 压缩 Bilibili 视频中音频的动态范围，使不同视频或同一视频中差距过大的响度保持一致
// @author       Amid7197 Timothy Tao & Github Copilot
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @match        *://live.bilibili.com/*
// @match        *://www.bilibili.com/list/*
// @match        https://greasyfork.org/scripts/557295
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const $ = s => document.querySelector(s);
    let audioCtx, sourceNode, compressorNode, gainNode, currentVideo;
    let isEnabled = true;
    let shouldKeepPlaying = false;

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
        gainNode.gain.linearRampToValueAtTime(1, now + 0.05);
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

        // 防后台暂停
        video.addEventListener('pause', () => {
            if (shouldKeepPlaying && document.hidden) {
                video.play().catch(() => {});
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                shouldKeepPlaying = video && !video.paused;
            } else {
                if (audioCtx?.state === 'suspended') {
                    audioCtx.resume();
                }
                setTimeout(() => { shouldKeepPlaying = false; }, 100);
            }
        });
    }

    // ==================== DOM 监听（防抖版） ====================
    let observerTimer = null;
    const DEBOUNCE_DELAY = 500; // 500ms 防抖

    function debouncedObserverCallback() {
        tryAddControlBtn();
        // 精准定位主播放器的视频元素（避免抓到隐藏预览）
        const video = document.querySelector('.bpx-player-video-wrap video, .bilibili-player-video video, video');
        if (video) processVideo(video);
    }

    const observer = new MutationObserver(() => {
        // 清除上一次定时器，重新计时
        if (observerTimer) clearTimeout(observerTimer);
        observerTimer = setTimeout(debouncedObserverCallback, DEBOUNCE_DELAY);
    });

    // ==================== 初始化 ====================
    function init() {
        document.head.appendChild(style);
        // 缩小监听范围：仅监听播放器可能所在的主内容区
        const targetNode = document.querySelector('#app, .bpx-player, .bilibili-player, body');
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
        }
        debouncedObserverCallback();
        document.addEventListener('fullscreenchange', () => setTimeout(async () => {
            if (audioCtx?.state === 'suspended') await audioCtx.resume();
            tryAddControlBtn();
        }, 300));
    }

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init)
        : init();
})();
