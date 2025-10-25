# -*- coding: utf-8 -*-
"""
实现搜书吧论坛登入和发布空间动态
"""
import os
import re
import sys
from copy import copy

import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
import time
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

ch = logging.StreamHandler(stream=sys.stdout)
ch.setLevel(logging.INFO)
ch.setFormatter(formatter)
logger.addHandler(ch)

def get_refresh_url(url: str):
    try:
        response = requests.get(url, verify=False)
        if response.status_code != 403:
            response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')
        meta_tags = soup.find_all('meta', {'http-equiv': 'refresh'})

        if meta_tags:
            content = meta_tags[0].get('content', '')
            if 'url=' in content:
                redirect_url = content.split('url=')[1].strip()
                print(f"Redirecting to: {redirect_url}")
                return redirect_url
        else:
            print("No meta refresh tag found.")
            return None
    except Exception as e:
        print(f'An unexpected error occurred: {e}')
        return None

def get_url(url: str):
    resp = requests.get(url, verify=False)
    soup = BeautifulSoup(resp.content, 'html.parser')
    
    links = soup.find_all('a', href=True)
    for link in links:
        if link.text == "搜书吧":
            return link['href']
    return None

def replace_match_line(js_file, new_url):
    """
    修改JS文件中的 @match URL，并增加版本号。
    如果URL没有变化，则不进行任何修改。
    """
    try:
        # Step 1: 读取文件内容
        with open(js_file, "r", encoding="utf-8") as f:
            content = f.read()

        # Step 2: 查找当前的 @match 和 @version
        match_line = re.search(r"// @match\s+(.*)", content)
        version_line = re.search(r"// @version\s+([\d.]+)", content)

        if not match_line or not version_line:
            logger.error(f"在 {js_file} 中未找到 @match 或 @version 行，无法进行更新。")
            return

        current_url_with_wildcard = match_line.group(1).strip()
        # 移除网址末尾的通配符 *
        current_url_base = current_url_with_wildcard.rstrip('*')

        # 如果URL没有变化，则直接返回
        if current_url_base == new_url:
            logger.info(f"网址没有变化，无需更新 {js_file}。")
            return

        logger.info(f"网址已更改，正在更新 {js_file}。")

        # Step 3: 更新 @match 行
        new_content = re.sub(
            r"// @match\s+.*",
            f"// @match        {new_url}*",
            content,
            count=1
        )

        # Step 4: 增加 @version 号
        version_str = version_line.group(1)
        parts = version_str.split('.')
        try:
            # 增加最后一个版本号
            minor_version = int(parts[-1]) + 1
            new_version_str = '.'.join(parts[:-1] + [str(minor_version)])
        except (ValueError, IndexError):
            logger.error(f"版本号格式不正确：{version_str}，无法自动递增。")
            new_version_str = version_str # 保持原样

        new_content_with_version = re.sub(
            r"// @version\s+.*",
            f"// @version      {new_version_str}",
            new_content,
            count=1
        )

        # Step 5: 写入新内容
        with open(js_file, "w", encoding="utf-8") as f:
            f.write(new_content_with_version)

        logger.info(f"已成功更新 {js_file} 的 @match 为 {new_url}*，版本号已更新为 {new_version_str}。")

    except FileNotFoundError:
        logger.error(f"文件 {js_file} 未找到。")
    except Exception as e:
        logger.error(f"替换失败: {e}")

def update_userlist_domain(file_path, new_url):
    """
    ✅ 将 userlist.txt 第二行更新为新 URL 的域名，前面加上 '||'
    """
    try:
        parsed = urlparse(new_url)
        domain = parsed.netloc or new_url.split('/')[2]
        domain_line = f"||{domain}\n"   # ✅ 加上 '||'

        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        old_line = lines[1].strip() if len(lines) > 1 else "(无)"
        logger.info(f"userlist.txt 原第二行: {old_line}")

        # 确保至少有两行
        if len(lines) < 3:
            lines += ['\n'] * (3 - len(lines))

        # 更新第二行
        lines[2] = domain_line

        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        logger.info(f"userlist.txt 第二行已更新为: {domain_line.strip()}")
    except Exception as e:
        logger.error(f"更新 userlist.txt 失败: {e}")

if __name__ == '__main__':
    try:
        redirect_url = get_refresh_url('http://' + os.environ.get('www.soushu2030.com', 'www.soushu2025.com'))
        time.sleep(2)
        redirect_url2 = get_refresh_url(redirect_url)
        url = get_url(redirect_url2)
        logger.info(f'获取到的最终网址为: {url}')
        
        # 调用新的 replace_match_line 函数
        if url:
            replace_match_line("xin_Discuz.js", url)
            replace_match_line("ziti.js", url)
            update_userlist_domain("userlist.txt", url)
        else:
            logger.error("未能获取到有效URL，无法更新。")
    except Exception as e:
        logger.error(e)
        sys.exit(1)
