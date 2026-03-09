@echo off
set DIR=%~dp0
if exist "%DIR%node_modules\.bin\electron.cmd" (
  call "%DIR%node_modules\.bin\electron.cmd" "%DIR%"
) else (
  node "%DIR%scripts\gui.mjs"
)
