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

def get_domain_from_userlist(file_path, line_number):
    """
    从 userlist.txt 获取指定行的域名
    """
    try:
        if not os.path.exists(file_path):
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            if len(lines) >= line_number:
                return lines[line_number - 1].strip()
    except Exception as e:
        logger.error(f"读取 {file_path} 出错: {e}")
    return None

def check_connection(url):
    """
    模拟 curl -v 检查连接。
    如果返回连接重置或无法访问，则返回 False。
    """
    try:
        # 使用较短的 timeout，verify=False 跳过 SSL 验证
        response = requests.get(url, verify=False, timeout=10)
        logger.info(f"连接测试成功: {url} (状态码: {response.status_code})")
        return True
    except requests.exceptions.ConnectionError:
        logger.error(f"连接失败: {url} 被重置 (Connection Reset) 或无法解析。")
        return False
    except Exception as e:
        logger.error(f"连接测试发生异常: {e}")
        return False


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
        # 1. 从 userlist.txt 第 3 行读取域名
        domain = get_domain_from_userlist('userlist.txt', 3)
        
        if domain:
            target_url = 'https://' + domain
            logger.info(f"准备测试连接: {target_url}")

            # 2. 检查是否可以直连 (无 Connection Reset)
            if check_connection(target_url):
                # 3. 如果可以直连，执行原有的重定向获取逻辑
                redirect_url = get_refresh_url(target_url)
                
                if redirect_url:
                    time.sleep(2)
                    redirect_url2 = get_refresh_url(redirect_url)
                    url = get_url(redirect_url2)
                    
                    logger.info(f'获取到的最终网址为: {url}')
                    
                    if url:
                        update_userlist_domain("userlist.txt", url)
                    else:
                        logger.error("未能获取到有效URL，无法更新。")
            else:
                logger.error(f"跳过后续操作，因为无法直连域名: {domain}")
        else:
            logger.error("在 userlist.txt 第 3 行未找到域名。")
            
    except Exception as e:
        logger.error(f"主程序运行失败: {e}")
        sys.exit(1)
