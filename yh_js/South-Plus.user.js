// ==UserScript==
// @name         South Plus 跳转
// @namespace    https://south-plus.net/
// @version      2.0.1
// @description  镜像站统一跳转至自定义域名（保留路径），自动转换 /simple/ 链接
// @author       MY_AI
// @match        *://*.east-plus.net/*
// @match        *://east-plus.net/*
// @match        *://*.south-plus.net/*
// @match        *://south-plus.net/*
// @match        *://*.south-plus.org/*
// @match        *://south-plus.org/*
// @match        *://*.white-plus.net/*
// @match        *://white-plus.net/*
// @match        *://*.north-plus.net/*
// @match        *://north-plus.net/*
// @match        *://*.level-plus.net/*
// @match        *://level-plus.net/*
// @match        *://*.soul-plus.net/*
// @match        *://soul-plus.net/*
// @match        *://*.snow-plus.net/*
// @match        *://snow-plus.net/*
// @match        *://*.spring-plus.net/*
// @match        *://spring-plus.net/*
// @match        *://*.summer-plus.net/*
// @match        *://summer-plus.net/*
// @match        *://*.blue-plus.net/*
// @match        *://blue-plus.net/*
// @match        *://*.imoutolove.me/*
// @match        *://imoutolove.me/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT = 'south-plus.net';

    // 读取设置（纯主机名）
    let target = GM_getValue('TARGET_HOST', DEFAULT);
    if (typeof target !== 'string' || !target.trim()) target = DEFAULT;
    target = target.trim().toLowerCase();

    // 菜单：设置目标域名
    GM_registerMenuCommand('设置跳转目标域名', () => {
        let current = GM_getValue('TARGET_HOST', DEFAULT);
        let input = prompt('请输入目标域名（例如 south-plus.net）', current);
        if (input !== null && (input = input.trim())) {
            GM_setValue('TARGET_HOST', input);
            alert('已保存，刷新页面后生效。');
        }
    });

    // 特殊处理 /simple/index.php?t数字.html → read.php
    const m = location.pathname.match(/^\/simple\/index\.php$/);
    if (m && location.search) {
        const tid = location.search.match(/[?&]t(\d+)(?:\.html)?/);
        if (tid) {
            const newUrl = location.protocol + '//' + target + '/read.php?tid-' + tid[1] + '.html';
            location.replace(newUrl);
            return;
        }
    }

    // 域名不匹配 → 替换 hostname 跳转
    if (location.hostname.toLowerCase() !== target) {
        try {
            const u = new URL(location.href);
            u.hostname = target;
            location.replace(u.href);
        } catch (e) {
            // 降级：简单替换
            location.replace(location.href.replace(location.hostname, target));
        }
    }
})();
