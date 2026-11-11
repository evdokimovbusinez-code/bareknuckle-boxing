"""Repo bot: runs a model through the Agent SDK — GLM-5.3-Flash via OpenRouter by default, Claude by tag (Agent SDK, billed to API credits) on a task prompt in the checked-out repo.
Usage: python tools/agent.py PROMPT_FILE   -> writes .claude-result.json (is_error, result, cost, turns)."""
import asyncio, json, os, sys
from claude_agent_sdk import query, ClaudeAgentOptions

TOOLS = ["Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "LS", "TodoWrite",
         "Bash(bash tools/check.sh)", "Bash(bash tools/shot.sh:*)", "Bash(python3 src/assemble.py)", "Bash(node --check:*)",
         "Bash(grep:*)", "Bash(sed -n:*)", "Bash(wc:*)", "Bash(ls:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(diff:*)", "Bash(git diff:*)", "Bash(git status:*)", "Bash(git log:*)"]

async def main():
    prompt = open(sys.argv[1]).read()
    eff = os.environ.get("BOT_EFFORT") or None   # reasoning effort only for Claude models
    opts = ClaudeAgentOptions(model=os.environ.get("BOT_MODEL", "z-ai/glm-5.3-flash"), effort=eff,
                              max_budget_usd=float(os.environ.get("BOT_BUDGET", "8")), max_turns=int(os.environ.get("BOT_TURNS", "100")), max_buffer_size=64 * 1024 * 1024, allowed_tools=TOOLS, permission_mode="acceptEdits",
                              setting_sources=["project"], system_prompt={"type": "preset", "preset": "claude_code"})
    out = {"is_error": True, "result": "no result", "cost": 0, "turns": 0}
    try:
      async for m in query(prompt=prompt, options=opts):
          n = type(m).__name__
          if n == "AssistantMessage":
              for b in getattr(m, "content", []):
                  if type(b).__name__ == "ToolUseBlock":
                      arg = b.input.get("file_path") or b.input.get("command") or b.input.get("pattern") or ""
                      print(f"· {b.name} {str(arg)[:120]}", flush=True)
          elif n == "ResultMessage":
              models = ", ".join(sorted((m.model_usage or {}).keys())) or opts.model
              out = {"is_error": bool(m.is_error), "result": m.result or "; ".join(map(str, m.errors or [])) or (m.subtype or ""),
                     "cost": m.total_cost_usd or 0, "turns": m.num_turns, "model": f"{models} · effort {opts.effort}",
                     "usage": m.model_usage or {}, "ms": getattr(m, "duration_ms", 0)}
    except Exception as e:   # keep partial work: the workflow still commits it and reports the error
        out = {**out, "is_error": True, "result": f"SDK error: {str(e)[:300]}"}
    json.dump(out, open(".claude-result.json", "w"), ensure_ascii=False)
    print("RESULT", "error" if out["is_error"] else "ok", f"${out['cost']:.3f}", out["turns"], "turns", out.get("model", ""), flush=True)

asyncio.run(main())
