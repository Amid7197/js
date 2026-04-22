// ==UserScript==
// @name         Github 高速下载 (自定义加速源+apk二维码)
// @match        *://github.com/*
// @version      1.0.12
// @icon         https://github.githubassets.com/favicons/favicon.png
// @author       Amid7197
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @require      https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js
// @run-at       document-end
// @license      GPL-3.0
// ==/UserScript==


(function () {
    'use strict';

    // ========== 配置管理 ==========

    // 默认加速源设为空字符串，允许为空
    const DEFAULT_DOMAIN = '';
    // 获取已保存的值，如果没有则使用空字符串
    let customDomain = GM_getValue('customDomain', DEFAULT_DOMAIN);

    // 确保 customDomain 不为 null/undefined
    if (customDomain === null || customDomain === undefined) {
        customDomain = '';
    }

    function normalizeDomain(domain) {
        if (!domain || domain.trim() === '') return '';
        domain = domain.trim();
        if (!domain.startsWith('http')) {
            domain = 'https://' + domain;
        }
        if (domain.endsWith('/')) {
            domain = domain.slice(0, -1);
        }
        return domain;
    }

    function setupDomain() {
        const current = GM_getValue('customDomain', '');
        const input = prompt('请输入你的加速源域名 (例如: https://ghproxy.net)\n无需包含 /https://github.com 后缀，脚本会自动拼接。\n\n留空则使用原始链接（不加速）', current || '');

        if (input !== null) {
            if (input.trim() === '') {
                GM_setValue('customDomain', '');
                alert(`设置成功！加速源已清空，将使用原始链接。\n\n请刷新页面生效。`);
                location.reload();
            } else {
                const formatted = normalizeDomain(input);
                GM_setValue('customDomain', formatted);
                alert(`设置成功！当前加速源为：\n${formatted}\n\n请刷新页面生效。`);
                location.reload();
            }
        }
    }

    GM_registerMenuCommand("⚙️ 设置加速源域名", setupDomain);

    // ========== 核心逻辑 ==========
    // 获取加速源，如果为空则直接使用原始链接
    function getAccelUrl(baseUrl, path) {
        if (!customDomain || customDomain === '') {
            return baseUrl + path;
        }
        return `${customDomain}/${baseUrl}` + path;
    }

    // ========== Release 加速 (保留二维码功能) ==========
    function addRelease() {
        if (!location.pathname.includes('/releases')) return;
        document.querySelectorAll('.Box-footer').forEach(footer => {
            if (footer.querySelector('.XIU2-RS')) return;
            footer.querySelectorAll('li.Box-row a').forEach(a => {
                if(a.getAttribute('rel') !== 'nofollow') return;

                const href = a.href.split(location.host)[1];
                if (!href) return;

                // 根据是否设置加速源来生成链接
                let url;
                if (!customDomain || customDomain === '') {
                    url = a.href; // 使用原始链接
                } else {
                    url = `${customDomain}/https://github.com${href}`;
                }

                const btnText = (!customDomain || customDomain === '') ? '原始链接' : '加速';
                const html = `<div class="XIU2-RS" style="margin-top:3px;margin-left:8px;">
                                <a class="btn btn-sm" href="${url}" target="_blank"
                                   style="font-size:12px;" rel="noreferrer">${btnText}</a>
                              </div>`;

                if (a.parentElement.nextElementSibling) {
                    a.parentElement.nextElementSibling.insertAdjacentHTML('beforeend', html);

                    // --- APK/IPA 文件悬停显示二维码 (保留) ---
                    if (a.href.toLowerCase().endsWith('.apk') || a.href.toLowerCase().endsWith('.ipa')) {
                        const newBtn = a.parentElement.nextElementSibling.querySelector('.XIU2-RS a');
                        let hoverTimeout;
                        let qrCodeElement = null;

                        newBtn.addEventListener('mouseenter', () => {
                            hoverTimeout = setTimeout(() => {
                                // 检查 QRCode 对象是否已加载
                                if (typeof QRCode === 'undefined') {
                                    console.error("[Github 高速下载脚本] 错误：QRCode 库未加载。请检查 @require 配置和网络连接。");
                                    return;
                                }

                                if (qrCodeElement) return;

                                qrCodeElement = document.createElement('div');
                                qrCodeElement.id = 'xiu2-qr-code-container';
                                document.body.appendChild(qrCodeElement);

                                try {
                                    new QRCode(qrCodeElement, {
                                        text: newBtn.href,
                                        width: 150,
                                        height: 150,
                                        correctLevel: QRCode.CorrectLevel.M,
                                        render: "image"
                                    });

                                    // 定位计算逻辑
                                    const rect = newBtn.getBoundingClientRect();

                                    setTimeout(() => {
                                        const qrWidth = qrCodeElement.offsetWidth;
                                        const leftPos = (rect.left + window.scrollX) - qrWidth;
                                        qrCodeElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
                                        qrCodeElement.style.position = "absolute";
                                        qrCodeElement.style.left = `${leftPos}px`;
                                    }, 50);

                                } catch (e) {
                                    console.error("[Github 高速下载脚本] 二维码生成失败：", e);
                                    if (qrCodeElement) {
                                        qrCodeElement.remove();
                                        qrCodeElement = null;
                                    }
                                }
                            }, 300);
                        });

                        newBtn.addEventListener('mouseleave', () => {
                            clearTimeout(hoverTimeout);
                            if (qrCodeElement) {
                                qrCodeElement.remove();
                                qrCodeElement = null;
                            }
                        });
                    }
                }
            });
        });
    }

    // ========== 样式 ==========
    GM_addStyle(`
        #xiu2-qr-code-container {
            position: fixed;
            background: white;
            padding: 12px;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(140,149,159,0.2);
            z-index: 9999;
        }
        #xiu2-qr-code-container img {
            display: block;
        }
    `);

    // ========== 初始化 ==========
    setTimeout(addRelease, 1000);

    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches && node.matches('.Box')) addRelease();
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
