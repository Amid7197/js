// ==UserScript==
// @name         South Plus 跳转（可自定义目标域名，保留路径）
// @namespace    https://south-plus.net/
// @version      1.4.0
// @description  将所有镜像域名跳转到自定义目标域名，保留路径；自动转换 /simple/ 链接
// @author       ai Amid7197
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

    // 获取目标域名（完整 URL），存储时允许只存域名，自动添加 https://
    function getTargetBaseUrl() {
        let val = GM_getValue('targetBaseUrl', 'south-plus.net');
        // 如果已包含协议头，直接返回；否则在前面加上 https://
        if (!/^https?:\/\//i.test(val)) {
            val = 'https://' + val;
        }
        return val;
    }

    // 菜单：设置目标域名
    GM_registerMenuCommand('设置跳转目标域名', function() {
        let raw = GM_getValue('targetBaseUrl', 'south-plus.net');
        // 显示时去掉协议，让输入更简单
        let display = raw.replace(/^https?:\/\//i, '');
        let input = prompt('请输入目标域名（例如 south-plus.net）', display);
        if (input !== null) {
            input = input.trim();
            if (input) {
                // 如果用户输入了完整协议则原样保存，否则只保存域名（下次自动加 https）
                GM_setValue('targetBaseUrl', input);
                alert('目标域名已更新，刷新页面后生效。');
            }
        }
    });

    var baseUrl = getTargetBaseUrl();

    // 特殊处理 /simple/index.php?t数字.html → read.php
    var simpleMatch = location.href.match(/\/simple\/index\.php\?t(\d+)\.html/);
    if (simpleMatch) {
        var tid = simpleMatch[1];
        var newUrl = baseUrl.replace(/\/+$/, '') + '/read.php?tid-' + tid + '.html';
        location.replace(newUrl);
        return;
    }

    // 比较当前域名与目标域名（严格区分 www）
    try {
        var targetUrlObj = new URL(baseUrl);
        var targetHostname = targetUrlObj.hostname;
        var currentHostname = location.hostname;

        if (currentHostname === targetHostname) {
            return; // 域名一致，不跳转
        }
    } catch (e) {
        // 解析失败，直接跳转（保留路径）
    }

    // 构建新地址：目标域名 + 原路径 + 查询参数 + hash
    var newUrl = baseUrl.replace(/\/+$/, '') + location.pathname + location.search + location.hash;
    location.replace(newUrl);
})();
