@echo off
if not exist out mkdir out
javac -d out src\main\java\com\commanderforge\gateway\CommanderForgeGateway.java
if errorlevel 1 exit /b 1
java -cp out com.commanderforge.gateway.CommanderForgeGateway
