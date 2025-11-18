#!/bin/bash
#30 10 * * 1,2,3,4,5 main_move_files.sh
#new Env('机械备份');

SRC_DIRS=(
    "/ssd/云盘"
    "/ssd/迅雷下载"
)

DEST_DIR="/hdd"
DAYS=3

# -------------------------
# 移动文件部分
# -------------------------
for SRC_DIR in "${SRC_DIRS[@]}"; do
    echo "处理目录：$SRC_DIR"
    
    base_dir_name=$(basename "$SRC_DIR")

    find "$SRC_DIR" -type f -mtime +$DAYS -print0 | while IFS= read -r -d '' file; do
        rel_path="${file#$SRC_DIR/}"
        dest_path="$DEST_DIR/$base_dir_name/$rel_path"

        mkdir -p "$(dirname "$dest_path")"
        mv "$file" "$dest_path"

        echo "剪切：$file → $dest_path"
    done
done

echo "文件移动完成，开始清理空文件夹..."

# -------------------------
# 删除空文件夹部分
# -------------------------

# 构造白名单（SRC_DIRS）
declare -A SRC_WHITELIST
for d in "${SRC_DIRS[@]}"; do
    SRC_WHITELIST["$d"]=1
done

# 删除空目录（但不删除 SRC_DIRS）
while IFS= read -r dir; do
    if [[ -z "${SRC_WHITELIST[$dir]}" ]]; then
        echo "删除空文件夹：$dir"
        rmdir "$dir"
    fi
done < <(find /ssd -type d -empty | sort -r)

echo "全部处理完成！"

