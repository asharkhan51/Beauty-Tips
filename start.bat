@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting Blogs By Mifrah...
  start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
  node server.js
) else (
  echo Node.js was not found, so opening the website file directly instead.
  echo ^(This works too. See README.md, "Two ways to run it".^)
  start "" "%~dp0index.html"
  pause
)
