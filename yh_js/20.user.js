// ==UserScript==
// @name         2048下载文件重命名为标题前缀（保留扩展名）
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  下载文件用网页标题“|”前的部分命名，保留原扩展名
// @match        https://hjd2048.com/2048/read.php?tid=*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    document.addEventListener('click', function (e) {
        const a = e.target.closest('a');
        if (!a) return;

        const url = a.href;
        if (url.includes('job.php?action=download')) {
            e.preventDefault();

            fetch(url)
                .then(response => {
                    const contentType = response.headers.get('Content-Type') || '';
                    const disposition = response.headers.get('Content-Disposition') || '';

                    // 获取原始扩展名
                    let originalName = '';
                    const match = disposition.match(/filename="?(.+?)"?$/);
                    if (match) {
                        originalName = match[1];
                    }

                    let ext = '';
                    if (originalName.includes('.')) {
                        ext = '.' + originalName.split('.').pop();
                    } else if (contentType.includes('text/plain')) {
                        ext = '.txt';
                    } else if (contentType.includes('zip')) {
                        ext = '.zip';
                    } else if (contentType.includes('pdf')) {
                        ext = '.pdf';
                    }

                    // 截取标题中“|”前的部分
                    let title = document.title.split('|')[0].trim();
                    title = title.replace(/[\\\/:*?"<>|]/g, ''); // 清除非法字符

                    const filename = title + ext;

                    return response.blob().then(blob => ({ blob, filename }));
                })
                .then(({ blob, filename }) => {
                    const blobUrl = URL.createObjectURL(blob);
                    const downloadLink = document.createElement('a');
                    downloadLink.href = blobUrl;
                    downloadLink.download = filename;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(blobUrl);
                });
        }
    }, true);
})();
