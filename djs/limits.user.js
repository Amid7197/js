// ==UserScript==
// @namespace         https://www.github.com/Cat7373/remove-web-limits/
// @name              网页限制解除（精简优化版）
// @version           2.0.10
// @description       解除大部分网站禁止复制、剪切、选择文本、右键菜单的限制。
// @homepageURL       https://github.com/xinggsf/gm/
// @author            xinggsf 半烟半雨溪桥畔
// @license           LGPLv3
// @include           https://www.zhihu.com/*
// @include           https://www.bilibili.com/read/*
// @include           *://imac.hk/*
// @include           https://life.tw/*

// @include           *://b.faloo.com/*
// @include           *://bbs.coocaa.com/*
// @include           *://book.hjsm.tom.com/*
// @include           *://book.zhulang.com/*
// @include           *://book.zongheng.com/*
// @include           *://book.hjsm.tom.com/*
// @include           *://chokstick.com/*
// @include           *://chuangshi.qq.com/*
// @include           *://yunqi.qq.com/*
// @include           *://city.udn.com/*
// @include           *://cutelisa55.pixnet.net/*
// @include           *://huayu.baidu.com/*
// @include           *://tiyu.baidu.com/*
// @include           *://yd.baidu.com/*
// @include           *://yuedu.baidu.com/*
// @include           *://luxmuscles.com/*
// @include           *://read.qidian.com/*
// @include           *://www.15yan.com/*
// @include           *://www.17k.com/*
// @include           *://www.18183.com/*
// @include           *://www.360doc.com/*
// @include           *://www.eyu.com/*
// @include           *://www.hongshu.com/*
// @include           *://www.coco01.com/*
// @include           *://news.missevan.com/*
// @include           *://www.hongxiu.com/*
// @include           *://www.imooc.com/*
// @include           *://www.readnovel.com/*
// @include           *://www.tadu.com/*
// @include           *://www.jjwxc.net/*
// @include           *://www.xxsy.net/*
// @include           *://www.z3z4.com/*
// @include           *://yuedu.163.com/*

// @include           *://*2dfan.*/topics/*
// @include           *://*sis001.*/*
// @include           *://*.sayhanabi.*/thread-*.html
// @include           *://*.uaa*.com/novel/chapter*
// @grant             GM_addStyle
// @run-at            document-start
// ==/UserScript==

(function() {
    const key = encodeURIComponent('复制限制解除:执行判断');
    if (window[key]) return;
    window[key] = true;
    'use strict';
 
    const default_rule = {
        name: "default",
        hook_eventNames: "select|selectstart|copy|cut|dragstart",
        unhook_eventNames: "mousedown|mouseup|keydown|keyup",
        dom0: true,
        hook_addEventListener: true,
        hook_preventDefault: true,
        hook_set_returnValue: true,
        add_css: true
    };
 
    let hook_eventNames, unhook_eventNames, eventNames;
    const storageName = getRandStr(
        'qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM',
        parseInt(Math.random() * 12 + 8)
    );
 
    const EventTarget_addEventListener = EventTarget.prototype.addEventListener;
    const document_addEventListener = document.addEventListener;
    const Event_preventDefault = Event.prototype.preventDefault;
 
    function addEventListener(type, func, useCapture) {
        const _addEventListener = this === document 
            ? document_addEventListener 
            : EventTarget_addEventListener;
 
        if (hook_eventNames.includes(type)) {
            _addEventListener.call(this, type, returnTrue, useCapture);
        } else if (unhook_eventNames.includes(type)) {
            const funcsName = storageName + type + (useCapture ? 't' : 'f');
            if (!this[funcsName]) {
                this[funcsName] = [];
                _addEventListener.call(
                    this, 
                    type, 
                    useCapture ? unhook_t : unhook_f, 
                    useCapture
                );
            }
            this[funcsName].push(func);
        } else {
            _addEventListener.apply(this, arguments);
        }
    }
 
    function clearLoop() {
        const elements = getElements();
        elements.forEach(element => {
            eventNames.forEach(eventName => {
                const prop = 'on' + eventName;
                if (element[prop] && element[prop] !== onxxx) {
                    if (unhook_eventNames.includes(eventName)) {
                        element[storageName + prop] = element[prop];
                        element[prop] = onxxx;
                    } else {
                        element[prop] = null;
                    }
                }
            });
        });
    }
 
    function returnTrue(e) {
        return true;
    }
 
    function unhook_t(e) {
        return unhook(e, this, storageName + e.type + 't');
    }
 
    function unhook_f(e) {
        return unhook(e, this, storageName + e.type + 'f');
    }
 
    function unhook(e, self, funcsName) {
        (self[funcsName] || []).forEach(fn => fn(e));
        e.returnValue = true;
        return true;
    }
 
    function onxxx(e) {
        this[storageName + 'on' + e.type](e);
        e.returnValue = true;
        return true;
    }
 
    function getRandStr(chars, len) {
        return Array.from({length: len}, () => 
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    }
 
    function getElements() {
        return Array.from(document.getElementsByTagName('*')).concat(document);
    }
 
    function addStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }
 
    function init() {
        const rule = default_rule;
 
        hook_eventNames = rule.hook_eventNames.split('|');
        unhook_eventNames = rule.unhook_eventNames.split('|');
        eventNames = [...hook_eventNames, ...unhook_eventNames];
 
        if (rule.dom0) {
            setInterval(clearLoop, 30000);
            setTimeout(clearLoop, 2500);
            window.addEventListener('load', clearLoop, true);
            clearLoop();
        }
 
        if (rule.hook_addEventListener) {
            EventTarget.prototype.addEventListener = addEventListener;
            document.addEventListener = addEventListener;
        }
 
        if (rule.hook_preventDefault) {
            Event.prototype.preventDefault = function() {
                if (!eventNames.includes(this.type)) {
                    Event_preventDefault.apply(this, arguments);
                }
            };
        }
 
        if (rule.hook_set_returnValue) {
            Object.defineProperty(Event.prototype, 'returnValue', {
                set: function(value) {
                    if (value !== true && eventNames.includes(this.type)) {
                        return;
                    }
                    this._returnValue = value;
                },
                get: function() {
                    return this._returnValue;
                }
            });
        }
 
        if (rule.add_css) {
            addStyle('html,*{user-select:text!important;-webkit-user-select:text!important;}');
        }
    }
 
    init();
})();
