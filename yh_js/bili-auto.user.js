// ==UserScript==
// @name         B站视频植入广告检测器(自动跳过+音频识别+进度条标记)
// @version      2.3.2
// @author       Amid7197 Warma10032 (modified)
// @license      GPLv2
// @description  基于大语言模型检测B站视频中的植入广告，支持自动跳过。无字幕时可调用Groq Whisper语音识别，并在进度条上以绿色块标记广告片段。支持UP主白名单。
// @match        *://*.bilibili.com/video/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    const DEFAULT_MODEL = 'glm-4-flash';
    const AD_RATIO_THRESHOLD = 1 / 3;

    // ========== 全局配置存取 ==========
    const CONFIG_KEY = 'ai-config';

    function getAIConfig() {
        return GM_getValue(CONFIG_KEY, {});
    }

    function setAIConfig(config) {
        GM_setValue(CONFIG_KEY, config);
    }

    // 广告缓存键
    const CACHE_KEY = 'cache_AD';
    const CACHE_DURATION_DAYS = 3;

    function getCacheStore() {
        return GM_getValue(CACHE_KEY, {});
    }

    function setCacheStore(store) {
        GM_setValue(CACHE_KEY, store);
    }

    function cleanExpiredCache(store) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const threshold = todayStart - (CACHE_DURATION_DAYS - 1) * 86400000;
        let changed = false;
        for (const bvid in store) {
            const entry = store[bvid];
            if (entry && entry.timestamp < threshold) {
                delete store[bvid];
                changed = true;
            }
        }
        if (changed) setCacheStore(store);
    }

    function getCachedResult(bvid) {
        const store = getCacheStore();
        cleanExpiredCache(store);
        const entry = store[bvid];
        if (!entry) return null;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const threshold = todayStart - (CACHE_DURATION_DAYS - 1) * 86400000;
        if (entry.timestamp >= threshold) {
            return {
                adTimeRanges: entry.adTimeRanges,
                videoDuration: entry.videoDuration
            };
        } else {
            delete store[bvid];
            setCacheStore(store);
            return null;
        }
    }

    function setCachedResult(bvid, data) {
        const store = getCacheStore();
        store[bvid] = {
            adTimeRanges: data.adTimeRanges,
            videoDuration: data.videoDuration,
            timestamp: Date.now(),
        };
        setCacheStore(store);
    }

    // ========== WBI 签名工具 ==========
    const WbiUtils = {
        mixinKeyEncTab: [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
            33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
            61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
            36, 20, 34, 44, 52
        ],

        getMixinKey(orig) {
            return this.mixinKeyEncTab
                .map(i => orig[i])
                .join('')
                .slice(0, 32);
        },

        md5(text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                hash = ((hash << 5) - hash) + text.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        },

        async getWbiKeys() {
            const config = getAIConfig();
            const wbiCache = config.wbi_cache;
            const today = new Date().setHours(0, 0, 0, 0);
            if (wbiCache && wbiCache.timestamp >= today) {
                return [wbiCache.img_key, wbiCache.sub_key];
            }
            try {
                const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.bilibili.com/'
                    },
                    credentials: 'include'
                });
                const data = await response.json();
                if (data.code !== 0) throw new Error(data.message);
                const imgUrl = data.data.wbi_img.img_url;
                const subUrl = data.data.wbi_img.sub_url;
                const imgKey = imgUrl.substring(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.'));
                const subKey = subUrl.substring(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.'));
                const newWbiCache = { img_key: imgKey, sub_key: subKey, timestamp: today };
                config.wbi_cache = newWbiCache;
                setAIConfig(config);
                return [imgKey, subKey];
            } catch (error) {
                console.error('【VideoAdGuard】获取WBI密钥失败:', error);
                throw error;
            }
        },

        async encWbi(params) {
            const [imgKey, subKey] = await this.getWbiKeys();
            const mixinKey = this.getMixinKey(imgKey + subKey);
            const currTime = Math.floor(Date.now() / 1000);
            const newParams = { ...params, wts: currTime };
            const query = Object.keys(newParams)
                .sort()
                .map(key => {
                    const value = newParams[key].toString()
                        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
                        .replace(/[&?:\/=]/g, '');
                    return `${key}=${encodeURIComponent(value)}`;
                })
                .join('&');
            const wbiSign = this.md5(query + mixinKey);
            return { ...newParams, w_rid: wbiSign };
        }
    };

    // ========== B站 API 封装 ==========
    const BilibiliService = {
        async fetchWithCookie(url, params = {}) {
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = `${url}?${queryString}`;
            try {
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.bilibili.com/'
                    },
                    credentials: 'include'
                });
                const data = await response.json();
                if (data.code !== 0) throw new Error(data.message);
                return data.data;
            } catch (error) {
                console.error('【VideoAdGuard】请求失败:', error);
                throw error;
            }
        },

        async getVideoInfo(bvid) {
            return await this.fetchWithCookie('https://api.bilibili.com/x/web-interface/view', { bvid });
        },
        async getComments(bvid) {
            return await this.fetchWithCookie('https://api.bilibili.com/x/v2/reply', { oid: bvid, type: 1 });
        },
        async getPlayerInfo(bvid, cid) {
            const params = { bvid, cid };
            const signedParams = await WbiUtils.encWbi(params);
            return await this.fetchWithCookie('https://api.bilibili.com/x/player/wbi/v2', signedParams);
        },
        async getCaptions(url) {
            const response = await fetch(url);
            return await response.json();
        },
        async getPlayUrl(bvid, cid) {
            const params = await WbiUtils.encWbi({
                bvid,
                cid,
                qn: 0,
                fnval: 16,
                fnver: 0,
                fourk: 1
            });
            return await this.fetchWithCookie('https://api.bilibili.com/x/player/playurl', params);
        }
    };

    // ========== 音频服务（Groq Whisper）==========
    const AudioService = {
        GROQ_OFFICIAL_URL: 'https://api.groq.com/openai/v1/audio/transcriptions',
        GROQ_PROXY_URL: 'https://ai-proxy.xiaobaozi.cn/api.groq.com/openai/v1/audio/transcriptions',
        DEFAULT_MODEL: 'whisper-large-v3-turbo',
        MAX_SIZE_MB: 19,

        getGroqApiKey() {
            return getAIConfig().groqApiKey || '';
        },
        getEnableGroqProxy() {
            return getAIConfig().enableGroqProxy || false;
        },

        async getAudioUrl(playUrlData) {
            if (!playUrlData?.dash?.audio || !Array.isArray(playUrlData.dash.audio)) return null;
            const audioStreams = playUrlData.dash.audio;
            let min = audioStreams[0];
            for (const a of audioStreams) if (a.bandwidth < min.bandwidth) min = a;
            return min.baseUrl || min.base_url || null;
        },

        async downloadAudioAsBytes(audioUrl) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: audioUrl,
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.bilibili.com/'
                    },
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(new Uint8Array(response.response).buffer);
                        } else {
                            reject(new Error(`下载音频失败: ${response.status}`));
                        }
                    },
                    onerror: (err) => reject(err)
                });
            });
        },

        async transcribe(audioBytes, fileInfo) {
            const apiKey = this.getGroqApiKey();
            if (!apiKey) throw new Error('未配置Groq API密钥');
            if (audioBytes.byteLength > this.MAX_SIZE_MB * 1024 * 1024) {
                throw new Error(`音频文件过大 (${(audioBytes.byteLength/1024/1024).toFixed(2)}MB)，超过Groq限制(${this.MAX_SIZE_MB}MB)`);
            }
            const file = new File(
                [new Blob([audioBytes], { type: fileInfo.type || 'audio/m4a' })],
                fileInfo.name || 'audio.m4a',
                { type: fileInfo.type || 'audio/m4a' }
            );
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', this.DEFAULT_MODEL);
            formData.append('response_format', 'verbose_json');

            const endpoints = [{ url: this.GROQ_OFFICIAL_URL, label: '官方' }];
            if (this.getEnableGroqProxy()) {
                endpoints.push({ url: this.GROQ_PROXY_URL, label: '代理' });
            }

            let lastError = null;
            for (const { url, label } of endpoints) {
                try {
                    const result = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url,
                            headers: { 'Authorization': `Bearer ${apiKey}` },
                            data: formData,
                            onload: (resp) => {
                                if (resp.status >= 200 && resp.status < 300) {
                                    resolve(JSON.parse(resp.responseText));
                                } else {
                                    reject(new Error(`${resp.status} ${resp.statusText}`));
                                }
                            },
                            onerror: reject
                        });
                    });
                    if (label === '代理') console.log('【VideoAdGuard】Groq代理接口调用成功');
                    return result;
                } catch (err) {
                    lastError = err;
                    console.warn(`【VideoAdGuard】Groq ${label} 接口失败:`, err);
                }
            }
            throw new Error(`语音识别失败: ${lastError?.message}`);
        }
    };

    // ========== AI 服务 （移除了 Ollama 分支） ==========
    const AIService = {
        async makeRequest(videoInfo, config) {
            const requestBody = {
                model: this.getModel(),
                messages: [
                    {
                        role: 'system',
                        content: '你是一个敏感的视频观看者，能根据视频的连贯性改变和宣传推销类内容，找出视频中可能存在的植入广告。内容如果和主题相关，即使是推荐/评价也可能只是分享而不是广告，重点要看有没有提到通过视频博主可以受益的渠道进行购买。'
                    },
                    {
                        role: 'user',
                        content: this.buildPrompt(videoInfo)
                    }
                ],
                temperature: 0.1,
                max_tokens: 1024,
                ...config.bodyExtra
            };

            console.log('【VideoAdGuard】发送LLM请求:', JSON.stringify(requestBody, null, 2));

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.getApiUrl(),
                    headers: config.headers,
                    data: JSON.stringify(requestBody),
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(JSON.parse(response.responseText));
                        } else {
                            reject(new Error('请求失败: ' + response.statusText));
                        }
                    },
                    onerror: reject
                });
            });
        },

        async analyze(videoInfo) {
            const cfg = getAIConfig();
            const apiKey = cfg.apiKey;
            if (!apiKey) throw new Error('未设置API密钥');
            const data = await this.makeRequest(videoInfo, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                bodyExtra: { response_format: { type: "json_object" } }
            });
            return JSON.parse(data.choices[0].message.content);
        },

        buildPrompt(videoInfo) {
            return `视频的标题和置顶评论如下，可供参考判断是否有植入广告。如果置顶评论中有购买链接，则肯定有广告，同时可以根据置顶评论的内容判断视频中的广告商从而确定哪部分是广告。
视频标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
下面我会给你这个视频的字幕字典，形式为 index: context. 请你完整地找出其中的植入广告，返回json格式的数据。注意要返回一整段的广告，从广告的引入到结尾重新转折回到视频内容前，因此不要返回太短的广告，可以组合成一整段返回。
字幕内容：${JSON.stringify(videoInfo.captions)}
先返回'exist': bool。true表示存在植入广告，false表示不存在植入广告。
再返回'index_lists': list[list[int]]。二维数组，行数表示广告的段数，一般来说视频是没有广告的，但也有小部分会植入一段广告，极少部分是多段广告，因此不要返回过多，只返回与标题最不相关或者与置顶链接中的商品最相关的部分。每一行是长度为2的数组[start, end]，表示一段广告的开头结尾，start和end是字幕的index。`;
        },

        getApiUrl() {
            const cfg = getAIConfig();
            return cfg.apiUrl || DEFAULT_API_URL;
        },
        getModel() {
            const cfg = getAIConfig();
            return cfg.model || DEFAULT_MODEL;
        }
    };

    // ========== 广告检测器 ==========
    const AdDetector = {
        adDetectionResult: null,
        adTimeRanges: [],
        autoSkipEnabled: true,
        autoSkipHandler: null,
        videoDuration: 0,
        analyzingBvid: null,

        async getCurrentBvid() {
            const match = window.location.pathname.match(/\/video\/(BV[\w]+)/);
            if (!match) throw new Error('未找到视频ID');
            return match[1];
        },

        // 检查 UP 主是否在白名单中
        isUpWhitelisted(ownerMid) {
            const cfg = getAIConfig();
            const whitelistStr = cfg.upWhitelist || '';
            if (!whitelistStr.trim()) return false;
            const whitelist = whitelistStr.split(',').map(s => s.trim()).filter(Boolean);
            return whitelist.includes(String(ownerMid));
        },

        async analyze() {
            let bvid;
            try {
                bvid = await this.getCurrentBvid();
            } catch {
                return;
            }

            // 防重入
            if (this.analyzingBvid === bvid) {
                console.log('【VideoAdGuard】分析正在进行中，跳过重复调用:', bvid);
                return;
            }
            this.analyzingBvid = bvid;

            try {
                const existingButton = document.querySelector('.skip-ad-button10032');
                if (existingButton) existingButton.remove();
                this.removeAutoSkip();
                this.clearProgressBarMarkers();

                // 获取视频信息（含UP主UID）
                const videoInfo = await BilibiliService.getVideoInfo(bvid);
                const ownerMid = videoInfo.owner?.mid;

                // 白名单检查
                if (ownerMid && this.isUpWhitelisted(ownerMid)) {
                    console.log(`【VideoAdGuard】UP主 ${ownerMid} 在白名单中，跳过检测`);
                    this.adTimeRanges = [];
                    this.autoSkipEnabled = false;
                    this.adDetectionResult = '该UP主在白名单中，已跳过广告检测';
                    this.showNotification(this.adDetectionResult);
                    return;
                }

                const comments = await BilibiliService.getComments(bvid);
                this.videoDuration = videoInfo.duration;

                // 先尝试读缓存
                const cached = getCachedResult(bvid);
                if (cached) {
                    this.adTimeRanges = cached.adTimeRanges;
                    this.videoDuration = cached.videoDuration;

                    if (this.adTimeRanges.length) {
                        const adTotal = this.adTimeRanges.reduce((sum, [s, e]) => sum + (e - s), 0);
                        const ratio = adTotal / this.videoDuration;
                        if (ratio > AD_RATIO_THRESHOLD) {
                            this.autoSkipEnabled = false;
                            this.adDetectionResult = `检测到过多广告（占视频${(ratio * 100).toFixed(1)}%），已禁用自动跳过`;
                        } else {
                            this.autoSkipEnabled = true;
                            this.adDetectionResult = `发现${this.adTimeRanges.length}处广告：${
                                this.adTimeRanges.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
                            }`;
                            this.setupAutoSkip();
                        }
                    } else {
                        this.adDetectionResult = '无广告内容';
                        this.autoSkipEnabled = false;
                    }

                    this.updateProgressBarMarkers();
                    console.log('【VideoAdGuard】从缓存恢复结果:', this.adDetectionResult);
                    this.showNotification(this.adDetectionResult);
                    return;
                }

                // 无缓存，开始分析
                let captions = null;
                let segmentsData = null;

                try {
                    const playerInfo = await BilibiliService.getPlayerInfo(bvid, videoInfo.cid);
                    if (playerInfo.subtitle?.subtitles?.length) {
                        let sub = playerInfo.subtitle.subtitles[0];
                        const zhSub = playerInfo.subtitle.subtitles.find(s =>
                            s.lan?.startsWith('zh') || s.lan_doc?.includes('中文')
                        );
                        if (zhSub) sub = zhSub;

                        const captionsUrl = 'https:' + sub.subtitle_url;
                        const captionsData = await BilibiliService.getCaptions(captionsUrl);
                        captions = {};
                        captionsData.body.forEach((caption, index) => {
                            captions[index] = caption.content;
                        });
                        segmentsData = captionsData.body.map((c, i) => ({ from: c.from, to: c.to, index: i }));
                    }
                } catch (e) {
                    console.warn('【VideoAdGuard】获取字幕失败:', e);
                }

                const cfg = getAIConfig();
                const enableAudio = cfg.enableAudioRecognition !== false;
                if (!captions && enableAudio) {
                    try {
                        const groqKey = AudioService.getGroqApiKey();
                        if (!groqKey) throw new Error('Groq密钥未设置');
                        console.log('【VideoAdGuard】无字幕，开始音频识别...');
                        this.showNotification('无字幕，正在使用语音识别，请稍候...');

                        const playUrlData = await BilibiliService.getPlayUrl(bvid, videoInfo.cid);
                        const audioUrl = await AudioService.getAudioUrl(playUrlData);
                        if (!audioUrl) throw new Error('未找到音频流');
                        const audioBytes = await AudioService.downloadAudioAsBytes(audioUrl);
                        const transcription = await AudioService.transcribe(audioBytes, { name: 'audio.m4a', type: 'audio/m4a' });
                        if (!transcription.segments || transcription.segments.length === 0) {
                            throw new Error('未识别到任何语音内容');
                        }
                        captions = {};
                        segmentsData = transcription.segments;
                        segmentsData.forEach((seg, idx) => {
                            captions[idx] = seg.text;
                        });
                        console.log('【VideoAdGuard】音频识别成功，分段数:', segmentsData.length);
                    } catch (e) {
                        console.error('【VideoAdGuard】音频识别失败:', e);
                        this.adDetectionResult = '音频识别失败：' + e.message;
                        this.adTimeRanges = [];
                        return;
                    }
                }

                if (!captions) {
                    this.adDetectionResult = '当前视频无字幕且无法获取语音内容';
                    this.adTimeRanges = [];
                    return;
                }

                const result = await AIService.analyze({
                    title: videoInfo.title,
                    topComment: comments.upper?.top?.content?.message || null,
                    captions
                });

                if (result.exist) {
                    const second_lists = this.segments2second(result.index_lists, segmentsData);
                    this.adTimeRanges = second_lists;
                    const adTotal = second_lists.reduce((sum, [s, e]) => sum + (e - s), 0);
                    const ratio = adTotal / this.videoDuration;

                    if (ratio > AD_RATIO_THRESHOLD) {
                        this.autoSkipEnabled = false;
                        this.adDetectionResult = `检测到过多广告（占视频${(ratio * 100).toFixed(1)}%），已禁用自动跳过`;
                        console.warn('【VideoAdGuard】广告占比超过阈值，不进行自动跳过');
                    } else {
                        this.autoSkipEnabled = true;
                        this.adDetectionResult = `发现${second_lists.length}处广告：${
                            second_lists.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
                        }`;
                        this.setupAutoSkip();
                    }

                    second_lists.forEach(([start, end]) => {
                        console.log(`【VideoAdGuard】检测到广告片段: [${this.second2time(start)}~${this.second2time(end)}]`);
                    });

                    this.showNotification(this.adDetectionResult);
                } else {
                    this.adDetectionResult = '无广告内容';
                    this.adTimeRanges = [];
                    this.autoSkipEnabled = false;
                    console.log('【VideoAdGuard】未检测到广告内容');
                }

                this.updateProgressBarMarkers();
                setCachedResult(bvid, {
                    adTimeRanges: this.adTimeRanges,
                    videoDuration: this.videoDuration
                });

            } catch (error) {
                console.error('分析失败:', error);
                this.adDetectionResult = '分析失败：' + error.message;
                this.adTimeRanges = [];
                this.autoSkipEnabled = false;
            } finally {
                if (this.analyzingBvid === bvid) {
                    this.analyzingBvid = null;
                }
            }
        },

        segments2second(indexLists, segments) {
            return indexLists.map(list => {
                const start = segments[list[0]]?.from || segments[list[0]]?.start || 0;
                const end = segments[list[list.length - 1]]?.to || segments[list[list.length - 1]]?.end || 0;
                return [start, end];
            });
        },

        second2time(seconds) {
            const hour = Math.floor(seconds / 3600);
            const min = Math.floor((seconds % 3600) / 60);
            const sec = Math.floor(seconds % 60);
            return `${hour > 0 ? hour + ':' : ''}${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        },

        removeAutoSkip() {
            const video = document.querySelector('video');
            if (video && this.autoSkipHandler) {
                video.removeEventListener('timeupdate', this.autoSkipHandler);
                this.autoSkipHandler = null;
            }
        },

        setupAutoSkip() {
            this.removeAutoSkip();
            const video = document.querySelector('video');
            if (!video) return;
            this.autoSkipHandler = () => {
                if (!this.autoSkipEnabled || !this.adTimeRanges.length) return;
                const currentTime = video.currentTime;
                for (const [start, end] of this.adTimeRanges) {
                    if (currentTime >= start && currentTime < end) {
                        video.currentTime = end;
                        console.log(`【VideoAdGuard】自动跳过广告: ${this.second2time(start)}~${this.second2time(end)}`);
                        break;
                    }
                }
            };
            video.addEventListener('timeupdate', this.autoSkipHandler);
            console.log('【VideoAdGuard】已启动自动跳过广告');
        },

        // ---------- 进度条标记 (颜色 rgb(0, 212, 0)) ----------
        clearProgressBarMarkers() {
            document.querySelectorAll('.vag-progress-marker').forEach(el => el.remove());
        },

        async updateProgressBarMarkers() {
            this.clearProgressBarMarkers();
            if (!this.adTimeRanges.length || this.videoDuration <= 0) return;

            const waitForElement = (selector, parent = document.body, timeout = 5000) => {
                return new Promise((resolve, reject) => {
                    const el = parent.querySelector(selector);
                    if (el) return resolve(el);
                    const observer = new MutationObserver((_m, obs) => {
                        const elem = parent.querySelector(selector);
                        if (elem) {
                            obs.disconnect();
                            resolve(elem);
                        }
                    });
                    observer.observe(parent, { childList: true, subtree: true });
                    setTimeout(() => {
                        observer.disconnect();
                        reject(new Error('未找到进度条容器'));
                    }, timeout);
                });
            };

            try {
                const container = await waitForElement('.bpx-player-progress-schedule', document.body, 5000);
                if (getComputedStyle(container).position === 'static') {
                    container.style.position = 'relative';
                }
                container.style.overflow = 'visible';

                for (const [start, end] of this.adTimeRanges) {
                    const startRatio = Math.min(1, start / this.videoDuration);
                    const endRatio = Math.min(1, end / this.videoDuration);
                    const widthRatio = endRatio - startRatio;
                    if (widthRatio <= 0) continue;

                    const marker = document.createElement('div');
                    marker.className = 'vag-progress-marker';
                    marker.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: ${startRatio * 100}%;
                        width: ${widthRatio * 100}%;
                        height: 100%;
                        background: rgb(0, 212, 0);
                        min-width: 2px;
                        pointer-events: none;
                        z-index: 2;
                    `;
                    container.appendChild(marker);
                }
            } catch (e) {
                console.warn('【VideoAdGuard】进度条标记更新失败:', e);
            }
        },

        showNotification(message) {
            const noti = document.createElement('div');
            noti.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px 15px;
                border-radius: 4px;
                z-index: 9999;
                max-width: 300px;
            `;
            noti.textContent = message;
            document.body.appendChild(noti);
            setTimeout(() => {
                noti.style.opacity = '0';
                noti.style.transition = 'opacity 0.5s';
                setTimeout(() => noti.remove(), 500);
            }, 5000);
        },

        addSettingsButton() {
            const btn = document.createElement('button');
            btn.textContent = '⚙️';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                border: none;
                font-size: 20px;
                cursor: pointer;
                z-index: 9999;
            `;
            document.body.appendChild(btn);
            btn.addEventListener('click', () => this.showSettingsPanel());
        },

        showSettingsPanel() {
            const existingPanel = document.querySelector('.vag-settings-panel');
            if (existingPanel) {
                existingPanel.remove();
                return;
            }

            const currentConfig = getAIConfig();

            const panel = document.createElement('div');
            panel.className = 'vag-settings-panel';
            panel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                width: 380px;
                color: #333;
                font-family: Arial, sans-serif;
            `;

            const style = document.createElement('style');
            style.textContent = `
                .vag-settings-panel .form-group { margin-bottom: 12px; }
                .vag-settings-panel label { display: block; margin-bottom: 4px; font-size: 14px; }
                .vag-settings-panel input[type="text"],
                .vag-settings-panel input[type="password"] {
                    width: 100%;
                    padding: 6px 8px;
                    box-sizing: border-box;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                .vag-settings-panel button {
                    padding: 8px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .vag-settings-panel #vag-message {
                    margin-top: 10px;
                    padding: 6px 10px;
                    border-radius: 4px;
                    font-size: 14px;
                }
                .vag-settings-panel .success { background: #dff0d8; color: #3c763d; }
                .vag-settings-panel .error { background: #f2dede; color: #a94442; }
                .vag-settings-panel .checkbox-container {
                    display: flex;
                    align-items: center;
                    position: relative;
                    padding-left: 30px;
                    cursor: pointer;
                    user-select: none;
                    font-size: 14px;
                }
                .vag-settings-panel .checkbox-container input {
                    position: absolute;
                    opacity: 0;
                    cursor: pointer;
                    height: 0;
                    width: 0;
                }
                .vag-settings-panel .checkmark {
                    position: absolute;
                    left: 0;
                    top: 0;
                    height: 20px;
                    width: 20px;
                    background-color: #eee;
                    border-radius: 4px;
                }
                .vag-settings-panel .checkbox-container:hover input ~ .checkmark {
                    background-color: #ccc;
                }
                .vag-settings-panel .checkbox-container input:checked ~ .checkmark {
                    background-color: #4CAF50;
                }
                .vag-settings-panel .checkmark:after {
                    content: "";
                    position: absolute;
                    display: none;
                }
                .vag-settings-panel .checkbox-container input:checked ~ .checkmark:after {
                    display: block;
                }
                .vag-settings-panel .checkbox-container .checkmark:after {
                    left: 7px;
                    top: 3px;
                    width: 5px;
                    height: 10px;
                    border: solid white;
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                }
                .vag-settings-panel hr {
                    margin: 15px 0 10px;
                    border: 0;
                    border-top: 1px solid #eee;
                }
            `;
            document.head.appendChild(style);

            panel.innerHTML = `
                <h3 style="margin: 0 0 15px 0; font-size: 18px;">广告检测设置</h3>
                <div class="form-group">
                    <label for="vag-api-url">API地址：</label>
                    <input type="text" id="vag-api-url" value="${currentConfig.apiUrl || DEFAULT_API_URL}">
                </div>
                <div class="form-group">
                    <label for="vag-api-key">API密钥：</label>
                    <input type="password" id="vag-api-key" value="${currentConfig.apiKey || ''}">
                </div>
                <div class="form-group">
                    <label for="vag-model">模型名称：</label>
                    <input type="text" id="vag-model" value="${currentConfig.model || DEFAULT_MODEL}">
                </div>
                <hr>
                <div class="form-group">
                    <label for="vag-groq-key">Groq API密钥：</label>
                    <input type="password" id="vag-groq-key" value="${currentConfig.groqApiKey || ''}">
                </div>
                <div class="form-group">
                    <label for="vag-enable-groq-proxy" class="checkbox-container">
                        <input type="checkbox" id="vag-enable-groq-proxy" ${currentConfig.enableGroqProxy ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        启用Groq代理回退
                    </label>
                </div>
                <div class="form-group">
                    <label for="vag-enable-audio" class="checkbox-container">
                        <input type="checkbox" id="vag-enable-audio" ${currentConfig.enableAudioRecognition !== false ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        无字幕时使用语音识别
                    </label>
                </div>
                <div class="form-group">
                    <label for="vag-up-whitelist">UP主白名单（UID，逗号分隔）：</label>
                    <input type="text" id="vag-up-whitelist" value="${currentConfig.upWhitelist || ''}" placeholder="例如：1343321779,123456">
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 15px;">
                    <button id="vag-save" style="background: #4CAF50; color: white; flex: 1; margin-right: 5px;">保存</button>
                    <button id="vag-cancel" style="background: #f44336; color: white; flex: 1; margin-left: 5px;">取消</button>
                </div>
                <div id="vag-message"></div>
            `;

            document.body.appendChild(panel);

            const messageDiv = document.getElementById('vag-message');
            const showMsg = (msg, type) => {
                messageDiv.textContent = msg;
                messageDiv.className = type;
                setTimeout(() => { messageDiv.textContent = ''; messageDiv.className = ''; }, 3000);
            };

            document.getElementById('vag-save').addEventListener('click', () => {
                const apiUrl = document.getElementById('vag-api-url').value.trim();
                const apiKey = document.getElementById('vag-api-key').value.trim();
                const model = document.getElementById('vag-model').value.trim();
                const groqKey = document.getElementById('vag-groq-key').value.trim();
                const enableGroqProxy = document.getElementById('vag-enable-groq-proxy').checked;
                const enableAudio = document.getElementById('vag-enable-audio').checked;
                const upWhitelist = document.getElementById('vag-up-whitelist').value.trim();

                if (!apiUrl) { showMsg('请输入API地址', 'error'); return; }
                if (!apiKey) { showMsg('请输入API密钥', 'error'); return; }
                if (!model) { showMsg('请输入模型名称', 'error'); return; }

                const newConfig = getAIConfig();
                newConfig.apiUrl = apiUrl;
                newConfig.apiKey = apiKey;
                newConfig.model = model;
                newConfig.groqApiKey = groqKey;
                newConfig.enableGroqProxy = enableGroqProxy;
                newConfig.enableAudioRecognition = enableAudio;
                newConfig.upWhitelist = upWhitelist;
                // wbi_cache 保持不变

                setAIConfig(newConfig);
                showMsg('设置已保存', 'success');
                setTimeout(() => panel.remove(), 1000);
            });

            document.getElementById('vag-cancel').addEventListener('click', () => panel.remove());

            ['vag-api-url', 'vag-api-key', 'vag-model', 'vag-groq-key', 'vag-up-whitelist'].forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.addEventListener('click', e => e.stopPropagation());
                    input.addEventListener('keydown', e => e.stopPropagation());
                }
            });
        }
    };

    // ========== 初始化 ==========
    function init() {
        AdDetector.analyze();
        AdDetector.addSettingsButton();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log('【VideoAdGuard】URL changed:', url);
                AdDetector.analyze();
            }
        }).observe(document, { subtree: true, childList: true });

        window.addEventListener('popstate', () => {
            console.log('【VideoAdGuard】History changed:', location.href);
            AdDetector.analyze();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
