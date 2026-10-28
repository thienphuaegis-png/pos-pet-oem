@echo off
chcp 65001 >nul
echo ========================================================
echo   DONG BO VA TAO CHECKPOINT 3-TRONG-1 (POS MASTERCARE)
echo ========================================================

echo [1/3] Dong bo CodeGraph AST...
call codegraph.cmd sync .

echo [2/3] Cap nhat PROJECT_STATE.json cho AI Agent...
.venv\Scripts\python.exe scripts\generate_checkpoint.py

echo [3/3] Kiem tra so do Archify...
if exist ".ai\checkpoints\diagrams\pos_checkout_flow.html" (
    echo   [OK] So do pos_checkout_flow.html san sang.
)

echo ========================================================
echo   HOAN TAT CHECKPOINT! CO THE BAT DAU PHIEN AI MOI.
echo ========================================================
pause
