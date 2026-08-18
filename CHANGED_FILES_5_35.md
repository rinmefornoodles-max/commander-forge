#!/usr/bin/env sh
set -eu
mkdir -p out
javac -d out src/main/java/com/commanderforge/gateway/CommanderForgeGateway.java
exec java -cp out com.commanderforge.gateway.CommanderForgeGateway
