// ==UserScript==
// @name         Discuz! 依赖式加载霞鹜文楷（精简检测版）
// @description  仅通过文本检测Discuz!网站，以依赖形式加载霞鹜文楷字体
// @version     1.0.21
// @match        *://b2kk.brs5d7fw.com/*
// @grant        GM_addStyle
// @run-at       document-start  // 提前执行，优先加载字体资源
// ==/UserScript==


(function() {
    'use strict';

    const fontStyle = `
        @font-face {
            font-family: '霞鹜文楷';
            /* 浏览器会按顺序检测：本地 A -> 本地 B -> 远程下载 */
            src: local('LXGW WenKai'), 
                 local('LXGW WenKai Lite'), 
                 local('霞鹜文楷'), 
                 local('霞鹜文楷 Screen'),
                 url('https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.520/LXGWWenKaiMonoLite-Regular.ttf') format('truetype');
            font-display: swap;
        }

        /* 针对 Discuz! 核心容器进行字体覆盖，使用通配符优化选择器 */
        body, input, textarea, button, select, 
        .t_f, .pcb, .pls, .plc, .xst, .xs2, .xg1, .xg2, .xi2, .z, .y, .bm, .fl, .tl, .pt, .pb {
            font-family: '霞鹜文楷', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif !important;
        }

        /* 代码块特殊处理：建议保留等宽 */
        code, pre, .code, .blockcode {
            font-family: '霞鹜文楷', Consolas, monospace !important;
        }

        /* 标题加粗 */
        h1, h2, h3, h4, h5, h6, .ts h1, .ts h2 {
            font-weight: 600 !important;
        }
    `;

    // 样式注入逻辑：兼容不同脚本管理器
    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(fontStyle);
    } else {
        const style = document.createElement('style');
        style.textContent = fontStyle;
        if (document.head) {
            document.head.appendChild(style);
        } else {
            // 处理 document-start 阶段 head 还没生成的情况
            const observer = new MutationObserver(() => {
                if (document.head) {
                    document.head.appendChild(style);
                    observer.disconnect();
                }
            });
            observer.observe(document.documentElement, { childList: true });
        }
    }

    // 仅用于调试：检查最终生效情况
    document.fonts.ready.then(() => {
        if (document.fonts.check('12px "霞鹜文楷"')) {
            console.log('%c[字体检测] 霞鹜文楷已就绪', 'color: #4caf50; font-weight: bold;');
        }
    });
})();
