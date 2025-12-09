// ==UserScript==
// @name         51cto文章复制功能重写
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  重写网页复制功能，解除复制限制 1.1.1
// @author       You
// @match        *://blog.51cto.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log("文章复制脚本已加载");

    // 替换原有的复制处理函数
    window.articleCopy_xt = function() {
        return true;
    };

    // 更优雅的替换方式
    function replaceCopyHandler() {
        if (typeof window.articleCopy !== 'undefined') {
            window.articleCopy = window.articleCopy_xt;
            setupEventListeners();
            return true;
        }
        return false;
    }

    // 设置事件监听器
    function setupEventListeners() {
        const wrap = document.querySelector('.article-content-wrap');
        if (wrap) {
            // 移除所有复制相关的事件监听器
            wrap.replaceWith(wrap.cloneNode(true));

            // 重新绑定事件
            const newWrap = document.querySelector('.article-content-wrap');
            newWrap.addEventListener('copy', window.articleCopy_xt);
            newWrap.addEventListener('keydown', keydownCopyHandler);

            console.log("复制事件监听器已重置");
        }
    }

    function keydownCopyHandler(event) {
        if (event.ctrlKey && event.keyCode === 67) { // Ctrl+C
            event.preventDefault();
            event.stopPropagation();

            try {
                const selectedText = window.getSelection().toString();
                if (selectedText) {
                    copyToClipboard(selectedText);
                    console.log('已复制文本:', selectedText);
                }
            } catch (error) {
                console.error('复制失败:', error);
            }
        }
    }

    function copyToClipboard(text) {
        // 使用更现代的 Clipboard API（如果可用）
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(() => {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
        } catch (error) {
            console.error('传统复制方法失败:', error);
        } finally {
            document.body.removeChild(textarea);
        }
    }

    // 主执行逻辑
    if (replaceCopyHandler()) {
        console.log("复制处理函数已替换");
    } else {
        // 使用 MutationObserver 监听DOM变化
        const observer = new MutationObserver(function() {
            if (replaceCopyHandler()) {
                observer.disconnect();
                console.log("复制功能已启用");
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true
        });

        // 设置超时保护
        setTimeout(() => {
            observer.disconnect();
        }, 10000);
    }
})();
