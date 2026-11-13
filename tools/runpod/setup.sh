#!/bin/bash
# RunPod pod → a self-hosted GitHub runner (label "gpu") for the heavy asset tasks: issues titled "[assets][gpu] ...".
# Run once in the pod's web terminal:
#   curl -sL https://raw.githubusercontent.com/evdokimovbusinez-code/bareknuckle-boxing/main/tools/runpod/setup.sh | bash -s -- RUNNER_TOKEN
# RUNNER_TOKEN: GitHub → repo Settings → Actions → Runners → New self-hosted runner → Linux → the value after "--token".
# After a pod restart run it again without a token: it only starts the runner.
set -e
export DEBIAN_FRONTEND=noninteractive RUNNER_ALLOW_RUNASROOT=1
R=/workspace/runner; mkdir -p $R; cd $R
if [ ! -f .deps ]; then
  echo "== system packages"
  apt-get update -qq
  apt-get install -y -qq sudo curl git jq ffmpeg wget ca-certificates libxi6 libxrender1 libxkbcommon0 libsm6 libgl1 libegl1 libxxf86vm1 libxfixes3 >/dev/null
  type gh >/dev/null 2>&1 || { curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
    apt-get update -qq && apt-get install -y -qq gh >/dev/null; }
  [ -x /usr/bin/google-chrome ] || { wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/gc.deb && apt-get install -y -qq /tmp/gc.deb >/dev/null; }
  touch .deps
fi
if [ ! -f .runner ]; then
  [ -n "${1:-}" ] || { echo "first run needs the runner token: bash setup.sh TOKEN"; exit 1; }
  V=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | tr -d v)
  echo "== GitHub runner $V"
  curl -sL "https://github.com/actions/runner/releases/download/v$V/actions-runner-linux-x64-$V.tar.gz" | tar xz
  ./bin/installdependencies.sh >/dev/null 2>&1 || true
  ./config.sh --url https://github.com/evdokimovbusinez-code/bareknuckle-boxing --token "$1" --labels gpu --name "runpod-$(hostname | cut -c1-8)" --unattended --replace
fi
pkill -f "Runner.Listener" 2>/dev/null || true
nohup ./run.sh > /workspace/runner.log 2>&1 &
sleep 5; tail -3 /workspace/runner.log
echo "== ready: nvidia-smi:"; nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "no GPU visible"
echo "CPU cores: $(nproc)"
