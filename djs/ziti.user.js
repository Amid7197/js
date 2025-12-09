// ==UserScript==
// @name         Discuz! 依赖式加载霞鹜文楷（精简检测版）
// @description  仅通过文本检测Discuz!网站，以依赖形式加载霞鹜文楷字体
// @version     1.0.8
// @match        *://supn.nypfsdimhg.com/*
// @match        https://supn.nypfsdimhg.com/*
// @grant        GM_addStyle
// @run-at       document-start  // 提前执行，优先加载字体资源
// @downloadURL  https://raw.githubusercontent.com/andadmadm/js/refs/heads/main/ziti.js
// @updateURL    https://raw.githubusercontent.com/andadmadm/js/refs/heads/main/ziti.js
// ==/UserScript==


(function() {
    'use strict';

    // 添加字体样式
    const fontStyle = `
        @font-face {
            font-family: '霞鹜文楷';
            src: url('https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.520/LXGWWenKaiMonoLite-Regular.ttf') format('truetype');
            font-display: swap;
        }

        /* 应用到Discuz!论坛的主要元素 */
        body,
        div,
        p,
        span,
        a,
        td,
        th,
        li,
        input,
        textarea,
        button,
        .t_f,
        .pcb,
        .pls,
        .plc,
        .xst,
        .xs2,
        .xg1,
        .xg2,
        .xi2,
        .z,
        .y,
        .mtw,
        .bm,
        .bm_h,
        .bm_c,
        .fl,
        .flb,
        .nfl,
        .nflb,
        .tl,
        .th,
        .tf,
        .tb,
        .ts,
        .pt,
        .pb,
        .pi,
        .pcht,
        .pcht tr,
        .pcht td,
        .pbn,
        .pbt,
        .pby,
        .pbs,
        .pbtn,
        .pbtn a,
        .pg,
        .pgb,
        .pgb a,
        .pgb span,
        .pgbtn,
        .pgbtn a,
        .pgbtn span {
            font-family: 霞鹜文楷 !important;
        }

        /* 代码块保持等宽字体 */
        code,
        pre,
        .code,
        .blockcode {
            font-family: 霞鹜文楷 !important;
        }

        /* 标题字体适当加粗 */
        h1, h2, h3, h4, h5, h6,
        .ts h1, .ts h2, .ts h3, .ts h4, .ts h5, .ts h6 {
            font-weight: 600 !important;
        }
    `;

    // 添加样式到页面
    GM_addStyle(fontStyle);

    // 备用方案：如果GM_addStyle不工作，使用DOM方式插入样式
    if (typeof GM_addStyle === 'undefined') {
        const style = document.createElement('style');
        style.textContent = fontStyle;
        document.head.appendChild(style);
    }

    // 监听字体加载状态
    document.fonts.ready.then(() => {
        console.log('霞鹜文楷字体加载完成');
    }).catch((error) => {
        console.warn('字体加载失败:', error);
    });

    // 添加字体加载检测
    const checkFont = new FontFace('霞鹜文楷', 'url(https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.520/LXGWWenKaiMonoLite-Regular.ttf)');

    checkFont.load().then((loadedFont) => {
        document.fonts.add(loadedFont);
        console.log('霞鹜文楷字体成功加载');
    }).catch((error) => {
        console.warn('霞鹜文楷字体加载失败:', error);
    });
})();
