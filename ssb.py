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

def get_domain_from_userlist(path='userlist.txt', line_no=3):
    """
    从 userlist.txt 读取指定行的域名（默认第3行）
    """
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        domain = lines[line_no - 1].strip()
        return domain.lstrip('|')  # 去掉 || 前缀
    except Exception as e:
        logger.error(f"读取 userlist.txt 第{line_no}行失败: {e}")
        return None


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


def update_userlist_domain(file_path, new_url):
    """
    ✅ 将 userlist.txt 第二行更新为新 URL 的域名
    """
    try:
        parsed = urlparse(new_url)
        domain = parsed.netloc or new_url.split('/')[2]
        domain_line = f"{domain}\n"   

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


def update_ssb_url(file_path, new_url):
    """
    将完整 URL 写入第 1 行，
    将域名写入第 2 行。
    """
    try:
        parsed = urlparse(new_url)
        domain = parsed.netloc or new_url.split('/')[2]

        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # 保证至少两行
        if len(lines) < 2:
            lines += ['\n'] * (2 - len(lines))

        old_url = lines[0].strip() if len(lines) > 0 else "(无)"
        old_domain = lines[1].strip() if len(lines) > 1 else "(无)"
        logger.info(f"ssb_url.txt 原第一行: {old_url}")
        logger.info(f"ssb_url.txt 原第二行: {old_domain}")

        # 写入新值
        lines[0] = new_url + "\n"
        lines[1] = domain + "\n"

        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        logger.info(f"ssb_url.txt 第一行已更新为: {new_url}")
        logger.info(f"ssb_url.txt 第二行已更新为: {domain}")

    except FileNotFoundError:
        # 如果文件不存在，自动创建
        with open(file_path, "w", encoding="utf-8") as f:
            parsed = urlparse(new_url)
            domain = parsed.netloc or new_url.split('/')[2]
            f.write(new_url + "\n")
            f.write(domain + "\n")
        logger.info(f"ssb_url.txt 不存在，已创建并写入内容。")
    except Exception as e:
        logger.error(f"更新 ssb_url.txt 失败: {e}")


if __name__ == '__main__':
    try:
        domain = get_domain_from_userlist('userlist.txt', 3)
        if not domain:
            logger.error("无法从 userlist.txt 获取域名")
            sys.exit(1)

        start_url = 'http://' + domain
        final_url = get_refresh_url(start_url)

        if not final_url:
            logger.error("无法获取最终访问地址")
            sys.exit(1)

        logger.info(f"最终访问地址: {final_url}")

        url = get_url(final_url)
        if url:
            update_userlist_domain("userlist.txt", url)
        else:
            logger.error("页面中未找到「搜书吧」链接")

        # 调用新的 replace_match_line 函数
        if url:
            update_userlist_domain("userlist.txt", url)
        else:
            logger.error("未能获取到有效URL，无法更新。")
    except Exception as e:
        logger.error(e)
        sys.exit(1)
