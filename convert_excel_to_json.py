#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script chuyển đổi file Excel trắc nghiệm thành file questions.json
Hỗ trợ các file Excel có cấu trúc:
No. | Question | Option A | Option B | Option C | Option D | Correct Answer | Points
"""

import os
import sys
import json
import openpyxl

# Đảm bảo in tiếng Việt không bị lỗi trên Windows console
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def convert_excel_to_json(excel_file_path, output_json_path='questions.json'):
    if not os.path.exists(excel_file_path):
        print(f"[Error] File not found: {excel_file_path}")
        return False

    print(f"Reading: {excel_file_path} ...")
    wb = openpyxl.load_workbook(excel_file_path, data_only=True)
    sheet = wb.active

    rows = list(sheet.iter_rows(values_only=True))
    if len(rows) < 2:
        print("Lỗi: File Excel không có đủ dữ liệu (cần ít nhất dòng tiêu đề và 1 dòng câu hỏi).")
        return False

    header = [str(col).strip().lower() if col is not None else '' for col in rows[0]]
    print("Dòng tiêu đề:", header)

    questions = []
    
    # Tìm vị trí các cột
    # Hỗ trợ cả tiếng Anh lẫn tiếng Việt
    col_map = {
        'id': 0,
        'question': 1,
        'optionA': 2,
        'optionB': 3,
        'optionC': 4,
        'optionD': 5,
        'correctAnswer': 6,
        'points': 7
    }

    # Tự động nhận diện cột theo tên nếu có
    for idx, col_name in enumerate(header):
        if 'no' in col_name or 'stt' in col_name:
            col_map['id'] = idx
        elif 'question' in col_name or 'câu hỏi' in col_name or 'cau hoi' in col_name:
            col_map['question'] = idx
        elif 'option a' in col_name or 'đáp án a' in col_name or col_name == 'a':
            col_map['optionA'] = idx
        elif 'option b' in col_name or 'đáp án b' in col_name or col_name == 'b':
            col_map['optionB'] = idx
        elif 'option c' in col_name or 'đáp án c' in col_name or col_name == 'c':
            col_map['optionC'] = idx
        elif 'option d' in col_name or 'đáp án d' in col_name or col_name == 'd':
            col_map['optionD'] = idx
        elif 'correct' in col_name or 'đáp án đúng' in col_name or 'dap an dung' in col_name:
            col_map['correctAnswer'] = idx
        elif 'point' in col_name or 'điểm' in col_name or 'diem' in col_name:
            col_map['points'] = idx

    for row_idx, row in enumerate(rows[1:], start=1):
        # Bỏ qua dòng trống
        if not any(row):
            continue

        def get_val(col_key, default=""):
            idx = col_map.get(col_key)
            if idx is not None and idx < len(row) and row[idx] is not None:
                return str(row[idx]).strip()
            return default

        question_text = get_val('question')
        if not question_text:
            continue

        raw_correct = get_val('correctAnswer', 'A').upper()
        # Chuẩn hóa đáp án đúng về dạng A, B, C, D
        correct_ans = 'A'
        for char in raw_correct:
            if char in ['A', 'B', 'C', 'D']:
                correct_ans = char
                break

        # Lấy điểm (mặc định là 2 hoặc 1 nếu không có)
        raw_points = get_val('points', '2')
        try:
            points = float(raw_points)
            if points.is_integer():
                points = int(points)
        except ValueError:
            points = 2

        q_item = {
            "id": row_idx,
            "question": question_text,
            "optionA": get_val('optionA'),
            "optionB": get_val('optionB'),
            "optionC": get_val('optionC'),
            "optionD": get_val('optionD'),
            "correctAnswer": correct_ans,
            "points": points
        }
        questions.append(q_item)

    print(f"Successfully loaded {len(questions)} questions.")

    # Ghi ra file JSON UTF-8
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"Saved to: {output_json_path}")
    return True

if __name__ == '__main__':
    # Ưu tiên file tuần 1 hoặc tham số truyền vào
    target_excel = 'quiz_tuan1_networking.xlsx'
    if len(sys.argv) > 1:
        target_excel = sys.argv[1]

    output_file = 'questions.json'
    if len(sys.argv) > 2:
        output_file = sys.argv[2]

    success = convert_excel_to_json(target_excel, output_file)
    if not success:
        sys.exit(1)
