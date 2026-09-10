@echo off
chcp 65001 > nul
title Hệ Thống Trắc Nghiệm Trực Tuyến - Server
echo ===================================================================
echo   ĐANG KHỞI CHẠY HỆ THỐNG KIỂM TRA TRẮC NGHIỆM TRỰC TUYẾN
echo   Địa chỉ: http://localhost:8000
echo   (Không tắt cửa sổ này trong khi làm bài)
echo ===================================================================
echo.
timeout /t 1 > nul
start http://localhost:8000
python -m http.server 8000
pause
