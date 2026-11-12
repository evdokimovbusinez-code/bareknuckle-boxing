# dispatcher: run an arbitrary script from tools/assets/ via the allowlisted
#   python3 tools/assets/ <script> [args...]
# (the SDK Bash rule "python3 tools/assets/:*" needs a space after the slash,
#  and Python runs a directory argument as its __main__.py)
import sys, runpy
args = sys.argv[1:]
if args:
    sys.argv = args
    runpy.run_path(args[0], run_name="__main__")
else:
    print("usage: python3 tools/assets/ SCRIPT [args...]")
