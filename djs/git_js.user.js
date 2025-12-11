// ==UserScript==
// @name         Github 高速下载 (精简版，自用, 带APK二维码)
// @match        *://github.com/*
// @version      1.0.1
// @icon         https://github.githubassets.com/favicons/favicon.png
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js
// @run-at       document-end
// @license      GPL-3.0
// ==/UserScript==

(function () {
    'use strict';

    // 用户可以自定义加速源
    const ACCEL_SOURCE = 'https://github.llnas.de5.net';  // 自定义加速源，可以修改为其他服务

    // 仅保留一个加速源
    const ACCEL = {
        repo: [`${ACCEL_SOURCE}/https://github.com`, '加速'],
        raw: [`${ACCEL_SOURCE}/https://raw.githubusercontent.com`, '加速']
    };

    // 为二维码弹出框添加样式
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

    // ========== Release 加速 ==========
    function addRelease() {
        if (!location.pathname.includes('/releases')) return;
        document.querySelectorAll('.Box-footer').forEach(footer => {
            if (footer.querySelector('.XIU2-RS')) return;
            footer.querySelectorAll('li.Box-row a').forEach(a => {
                const href = a.href.split(location.host)[1];
                const url = ACCEL.repo[0] + href;
                const html = `<div class="XIU2-RS" style="margin-top:3px;margin-left:8px;">
                                <a class="btn btn-sm" href="${url}" target="_blank"
                                   style="font-size:12px;" rel="noreferrer">${ACCEL.repo[1]}</a>
                              </div>`;

                if (a.parentElement.nextElementSibling) {
                    a.parentElement.nextElementSibling.insertAdjacentHTML('beforeend', html);

                    // --- 新增功能：APK 文件悬停显示二维码 ---
                    if (a.href.toLowerCase().endsWith('.apk') || a.href.toLowerCase().endsWith('.ipa')) {
                        const newBtn = a.parentElement.nextElementSibling.querySelector('.XIU2-RS a');
                        let hoverTimeout;
                        let qrCodeElement = null;

                        // 鼠标移入按钮
                        newBtn.addEventListener('mouseenter', () => {
                            hoverTimeout = setTimeout(() => {
                                if (qrCodeElement) return;

                                qrCodeElement = document.createElement('div');
                                qrCodeElement.id = 'xiu2-qr-code-container';
                                document.body.appendChild(qrCodeElement);

                                new QRCode(qrCodeElement, {
                                    text: newBtn.href,
                                    width: 150,
                                    height: 150,
                                    correctLevel: QRCode.CorrectLevel.M,
                                    render: "image" // 强制生成 img
                                });

                                const rect = newBtn.getBoundingClientRect();
                                qrCodeElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
                                qrCodeElement.style.left = `${rect.left + window.scrollX}px`;
                                qrCodeElement.style.position = "absolute"; // 改成 absolute
                            }, 500); // 先缩短时间看看效果
                        });

                        // 鼠标移出按钮
                        newBtn.addEventListener('mouseleave', () => {
                            // 清除计时器和已显示的二维码
                            clearTimeout(hoverTimeout);
                            if (qrCodeElement) {
                                qrCodeElement.remove();
                                qrCodeElement = null;
                            }
                        });
                    }
                    // --- 新增功能结束 ---
                }
            });
        });
    }

    // ========== 初始化 ==========
    setTimeout(addRelease, 1000);

    // 监控 DOM 变化
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches && node.matches('.Box')) addRelease();
                if (node.parentElement?.id === '__primerPortalRoot__') addGitClone(node);
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
