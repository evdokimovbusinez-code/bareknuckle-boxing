"""Repo bot: runs Claude (Agent SDK, billed to API credits) on a task prompt in the checked-out repo.
Usage: python tools/agent.py PROMPT_FILE   -> writes .claude-result.json (is_error, result, cost, turns)."""
import asyncio, json, sys
from claude_agent_sdk import query, ClaudeAgentOptions

TOOLS = ["Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "LS", "TodoWrite",
         "Bash(bash tools/check.sh)", "Bash(python3 src/assemble.py)", "Bash(node --check:*)",
         "Bash(grep:*)", "Bash(sed -n:*)", "Bash(wc:*)", "Bash(ls:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(diff:*)", "Bash(git diff:*)", "Bash(git status:*)"]

async def main():
    prompt = open(sys.argv[1]).read()
    opts = ClaudeAgentOptions(model="claude-sonnet-5-5", max_turns=80, allowed_tools=TOOLS, permission_mode="acceptEdits",
                              setting_sources=["project"], system_prompt={"type": "preset", "preset": "claude_code"})
    out = {"is_error": True, "result": "no result", "cost": 0, "turns": 0}
    async for m in query(prompt=prompt, options=opts):
        n = type(m).__name__
        if n == "AssistantMessage":
            for b in getattr(m, "content", []):
                if type(b).__name__ == "ToolUseBlock":
                    arg = b.input.get("file_path") or b.input.get("command") or b.input.get("pattern") or ""
                    print(f"· {b.name} {str(arg)[:120]}", flush=True)
        elif n == "ResultMessage":
            out = {"is_error": bool(m.is_error), "result": m.result or "", "cost": m.total_cost_usd or 0, "turns": m.num_turns}
    json.dump(out, open(".claude-result.json", "w"), ensure_ascii=False)
    print("RESULT", "error" if out["is_error"] else "ok", f"${out['cost']:.3f}", out["turns"], "turns", flush=True)

asyncio.run(main())
