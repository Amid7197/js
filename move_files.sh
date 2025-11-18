#!/bin/bash
#机械备份
#0 11 * * 1,2,3,4,5 move_files.sh

SRC_DIRS=(
    "/ssd/云盘"
    "/ssd/迅雷下载"
)

# 修改目标路径，确保每个源目录有对应的目标子目录
DEST_DIR="/hdd"
DAYS=3

for SRC_DIR in "${SRC_DIRS[@]}"; do
    echo "处理目录：$SRC_DIR"
    
    # 获取源目录的基准部分，用来在目标目录中创建相应的子目录
    base_dir_name=$(basename "$SRC_DIR")

    find "$SRC_DIR" -type f -mtime +$DAYS -print0 | while IFS= read -r -d '' file; do
        # 获取文件相对路径
        rel_path="${file#$SRC_DIR/}"
        
        # 构建目标路径，加入基准目录（例如 /hdd/云盘）
        dest_path="$DEST_DIR/$base_dir_name/$rel_path"
        
        # 创建目标目录
        mkdir -p "$(dirname "$dest_path")"
        
        # 执行剪切操作
        mv "$file" "$dest_path"
        
        echo "剪切：$file → $dest_path"
    done
done

echo "全部处理完成！"
