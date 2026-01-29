# -*- coding: utf-8 -*-
import os
import sys
import requests
import time
import logging
import urllib3
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

# 屏蔽 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(formatter)
logger.addHandler(ch)

def get_domain_from_userlist(file_path, line_number):
    """从 userlist.txt 获取指定行的域名"""
    try:
        if not os.path.exists(file_path): return None
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            return lines[line_number - 1].strip() if len(lines) >= line_number else None
    except Exception as e:
        logger.error(f"读取文件失败: {e}")
        return None

def check_connection(url):
    """检测是否能直连（模拟 curl）"""
    try:
        requests.get(url, verify=False, timeout=10)
        return True
    except Exception:
        return False

def get_refresh_url(current_url: str):
    """提取 meta refresh 跳转地址，并自动补全相对路径"""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        resp = requests.get(current_url, verify=False, timeout=10, headers=headers)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, 'html.parser')
        meta = soup.find('meta', attrs={'http-equiv': lambda x: x and x.lower() == 'refresh'})

        if meta:
            content = meta.get('content', '')
            if 'url=' in content.lower():
                # 提取 url= 之后的所有字符
                parts = re.split('url=', content, flags=re.IGNORECASE)
                raw_url = parts[1].strip()
                # 核心修复：将相对路径 (如 /sou/go.html) 转换为绝对路径
                full_url = urljoin(current_url, raw_url)
                logger.info(f"解析到跳转目标: {full_url}")
                return full_url
        return None
    except Exception as e:
        logger.error(f"解析跳转出错: {e}")
        return None

def get_final_link_from_page(url: str):
    """在最终页面中寻找『最新地址』按钮"""
    try:
        resp = requests.get(url, verify=False, timeout=10)
        soup = BeautifulSoup(resp.content, 'html.parser')
        # 寻找包含“最新地址”字样的链接
        links = soup.find_all('a', href=True)
        for link in links:
            if "最新地址" in link.get_text():
                return link['href']
    except Exception as e:
        logger.error(f"提取最终链接失败: {e}")
    return None

def update_userlist(file_path, final_url):
    """更新 userlist.txt 第 3 行"""
    try:
        domain = urlparse(final_url).netloc
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        while len(lines) < 3: lines.append("\n")
        lines[2] = domain + "\n"
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(lines)
        logger.info(f"成功更新域名到第 3 行: {domain}")
    except Exception as e:
        logger.error(f"更新文件失败: {e}")

import re # 补齐正则模块

if __name__ == '__main__':
    # 1. 获取初始域名
    domain = get_domain_from_userlist('userlist.txt', 3)
    if not domain:
        logger.error("无法读取初始域名")
        sys.exit(1)

    current_step_url = 'https://' + domain
    logger.info(f"开始检测: {current_step_url}")

    if check_connection(current_step_url):
        # 执行三次跳转逻辑
        for i in range(1, 4):
            logger.info(f"正在进行第 {i} 次跳转解析...")
            next_url = get_refresh_url(current_step_url)
            if next_url:
                current_step_url = next_url
                time.sleep(1.5) # 稍微等待模拟真实访问
            else:
                logger.warning(f"第 {i} 次未发现跳转标签，可能已到达目标页或页面结构变化。")
                break
        
        # 跳转结束后，尝试抓取“最新地址”
        final_target = get_final_link_from_page(current_step_url)
        if final_target:
            logger.info(f"拿到最终地址: {final_target}")
            update_userlist('userlist.txt', final_target)
        else:
            logger.error("未能从最终页面提取到『最新地址』。")
    else:
        logger.error("初始域名无法连接 (Connection Reset)。")
