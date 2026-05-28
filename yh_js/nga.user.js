// ==UserScript==
// @name         NGA网址重定向 + 版头折叠助手
// @version      1.0.3
// @description  统一NGA域名避免重复登录，支持自定义目标域名；并在目标域名下自动折叠版头/版规/置顶。
// @match        *://bbs.nga.cn/*
// @match        *://g.nga.cn/*
// @match        *://nga.178.com/*
// @match        *://ngabbs.com/*
// @match        *://bbs.ngacn.cc/*
// @author       aiedit WaterEast Shy07
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @license      MIT
// https://greasyfork.org/zh-CN/scripts/453395
// https://greasyfork.org/zh-CN/scripts/36772
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_DEST = "bbs.nga.cn";

    // 读取用户设置的目标域名（小写）
    let destination = GM_getValue("NGA_DEST", DEFAULT_DEST);
    if (typeof destination === 'string') {
        destination = destination.trim().toLowerCase();
    } else {
        destination = DEFAULT_DEST;
    }

    // 域名不匹配 → 执行重定向
    if (location.hostname.toLowerCase() !== destination) {
        try {
            const newUrl = new URL(location.href);
            newUrl.hostname = destination;
            window.location.replace(newUrl.href);
        } catch (e) {
            window.location.replace(location.href.replace(location.hostname, destination));
        }
        return; // 终止，不执行后续折叠代码
    }

    // 域名匹配 → 等待页面就绪后执行版头折叠
    function initFold() {
        // 等待 NGA 全局变量 commonui 和 __CURRENT_UID 就绪
        if (typeof commonui === 'undefined' || typeof __CURRENT_UID === 'undefined') {
            setTimeout(initFold, 100);
            return;
        }

        // 以下是原版折叠脚本的核心逻辑（已适配匿名函数传参）
        ((ui, self) => {
            if (ui === undefined) return;

            const targetNode = document.querySelector('body');
            const config = { childList: true };
            let manualOpen = false;

            const toggle = () => {
                const toppedTopic = document.querySelector('#toppedtopic');
                if (toppedTopic) {
                    toppedTopic.style.display = manualOpen ? 'none' : 'block';
                    manualOpen = !manualOpen;
                }
            };

            const hookClickEvent = () => {
                const el = document.querySelector('#toptopics a[class="block_txt block_txt_c0"]');
                if (el) {
                    el.href = 'javascript:;';
                    el.addEventListener('click', toggle);
                }
            };

            const hideToppedTopic = () => {
                const toppedTopic = document.querySelector('#toppedtopic');
                if (!manualOpen && toppedTopic) {
                    toppedTopic.style.display = 'none';
                }
            };

            // 初始执行
            hideToppedTopic();
            hookClickEvent();

            // 钩子：监听 ui.eval 调用，在 topicArg.add 时重新隐藏
            let initialized = false;
            const hookFunction = (object, functionName, callback) => {
                const originalFunction = object[functionName];
                object[functionName] = function () {
                    const returnValue = originalFunction.apply(this, arguments);
                    callback.apply(this, [returnValue, originalFunction, arguments]);
                    return returnValue;
                };
            };

            hookFunction(ui, 'eval', () => {
                if (initialized) return;
                if (ui.topicArg) {
                    hookFunction(
                        ui.topicArg,
                        'add',
                        () => {
                            hideToppedTopic();
                            hookClickEvent();
                        }
                    );
                    initialized = true;
                }
            });
        })(commonui, __CURRENT_UID);
    }

    // 根据文档状态决定何时启动折叠
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFold);
    } else {
        initFold();
    }

    // 菜单：设置目标域名
    GM_registerMenuCommand("设置重定向目标域名（当前：" + destination + "）", () => {
        const input = prompt("请输入要统一跳转到的 NGA 域名（如 bbs.nga.cn,g.nga.cn,nga.178.com.ngabbs.com）：", destination);
        if (input !== null) {
            const newDest = input.trim().toLowerCase();
            if (newDest === "") {
                alert("域名不能为空，设置未保存。");
                return;
            }
            GM_setValue("NGA_DEST", newDest);
            alert("目标域名已设置为：" + newDest + "\n刷新后生效。");
        }
    });
})();
