// ==UserScript==
// @name         HuggingFace Enhanced Tools Pro
// @namespace    http://tampermonkey.net/
// @version      1.2.2
// @author       Amid7197
// @description  Tools for HuggingFace: GGUF filter, mirror redirect and download links extraction
// @match        https://huggingface.co/*
// @match        https://hf-mirror.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @license      GPL-3.0 License
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 全局设置 ====================
    // 加载或初始化设置
    let settings = {
        filterEnabled: false   // 默认不过滤
    };

    // ==================== 主控制面板 ====================
    function createControlPanel() {
        if (document.querySelector('.hf-tools-panel')) return;

        const panel = document.createElement('div');
        panel.className = 'hf-tools-panel';
        panel.style.position = 'fixed';
        panel.style.bottom = '20px';
        panel.style.right = '20px';
        panel.style.zIndex = '9999';
        panel.style.padding = '10px';
        panel.style.background = '#fff';
        panel.style.border = '1px solid #ddd';
        panel.style.borderRadius = '5px';
        panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.gap = '8px';
        panel.style.minWidth = '140px';

const filterToggle = document.createElement('button');
        filterToggle.textContent = '文件过滤🔍';
        filterToggle.style.backgroundColor = settings.filterEnabled ? '#f44336' : '#ffff00';
        filterToggle.style.color = 'black';
        filterToggle.addEventListener('click', () => {
            settings.filterEnabled = !settings.filterEnabled;
            GM_setValue('filterEnabled', settings.filterEnabled);
            filterToggle.style.backgroundColor = settings.filterEnabled ? '#f44336' : '#ffff00';
            updateFileDisplay();
        });

        // 复制下载链接按钮
        const copyLinksBtn = document.createElement('button');
        copyLinksBtn.textContent = '复制链接📋';
        copyLinksBtn.style.backgroundColor = '#4CAF50';
        copyLinksBtn.style.color = 'white';
        copyLinksBtn.addEventListener('click', copyAllDownloadLinks);

        // 镜像站跳转按钮
        const mirrorBtn = document.createElement('button');
        mirrorBtn.textContent = window.location.host.includes('hf-mirror.com') ?
            '跳转主站🚀' : '跳转镜像🚀';
        mirrorBtn.style.backgroundColor = '#2196F3';
        mirrorBtn.style.color = 'white';
        mirrorBtn.addEventListener('click', toggleMirrorSite);

        // 组装面板
        panel.appendChild(filterToggle);
        panel.appendChild(copyLinksBtn);
        panel.appendChild(mirrorBtn);
        document.body.appendChild(panel);
    }

    // ==================== GGUF 文件处理 ====================
    function updateFileDisplay() {
        const fileLinks = document.querySelectorAll('a[href$=".gguf"]');
        const highlightStyle = 'background-color: yellow; font-weight: bold; color: #000';

        fileLinks.forEach(link => {
            const fileName = link.textContent.trim();
            const row = link.closest('tr') || link.closest('div');

            // 始终高亮Q4_K_M文件
            if (fileName.includes('Q4_K_M')) {
                if (row) {
                    row.style.cssText = highlightStyle;
                } else {
                    link.style.cssText = highlightStyle;
                }
            }

            // 过滤处理
            if (settings.filterEnabled) {
                if (!/(Q(4_K_M|5|6|8)|IQ|F16|F8\d)/.test(fileName)) {
                    if (row) {
                        row.style.display = 'none';
                    }
                } else {
                    if (row) {
                        row.style.display = '';
                    }
                }
            } else {
                // 当过滤关闭时，确保所有文件可见
                if (row) {
                    row.style.display = '';
                }
            }
        });
    }

    // ==================== 下载链接处理 ====================
    function getDownloadLinks() {
        const links = [];
        const elements = document.querySelectorAll('a[download][href]');
        const currentHost = window.location.host;
        let baseUrl = currentHost.includes('hf-mirror.com') ?
            'https://hf-mirror.com' : 'https://huggingface.co';

        elements.forEach((element) => {
            const href = element.getAttribute('href');
            if (href) {
                links.push(baseUrl + href);
            }
        });
        return links;
    }

    function copyAllDownloadLinks() {
        const links = getDownloadLinks();
        if (links.length === 0) {
            showNotification('未找到下载链接', 'error');
            return;
        }

        const allLinksText = links.join('\n');
        navigator.clipboard.writeText(allLinksText)
            .then(() => showNotification(`已复制 ${links.length} 个下载链接`))
            .catch(err => {
                console.error('复制失败:', err);
                showNotification('复制失败，请检查控制台', 'error');
            });
    }

    // ==================== 镜像站跳转 ====================
    function toggleMirrorSite() {
        const newUrl = window.location.href.includes('hf-mirror.com') ?
            window.location.href.replace('hf-mirror.com', 'huggingface.co') :
            window.location.href.replace('huggingface.co', 'hf-mirror.com');
        window.location.href = newUrl;
    }

    // ==================== 辅助函数 ====================
    function showNotification(message, type = 'info') {
        if (typeof GM_notification !== 'undefined') {
            GM_notification({
                text: message,
                title: 'HuggingFace Tools',
                highlight: type === 'error'
            });
        } else {
            alert(message);
        }
    }

    // ==================== 主初始化 ====================
    function initialize() {
        // 创建控制面板
        createControlPanel();

        // 初始文件处理
        updateFileDisplay();

        // 设置MutationObserver监听DOM变化
        const observer = new MutationObserver(() => {
            if (!document.querySelector('.hf-tools-panel')) {
                createControlPanel();
            }
            updateFileDisplay();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 注册Tampermonkey菜单命令
        if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand('切换GGUF过滤', () => {
                settings.filterEnabled = !settings.filterEnabled;
                GM_setValue('filterEnabled', settings.filterEnabled);
                updateFileDisplay();
            });

            GM_registerMenuCommand('复制下载链接', copyAllDownloadLinks);
        }
    }

    // 启动脚本
    initialize();
})();
