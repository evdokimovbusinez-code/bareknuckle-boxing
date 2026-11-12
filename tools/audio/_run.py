import runpy, sys
_parts = open('tools/audio/_cmd.txt').read().split()
sys.argv = _parts
runpy.run_path(_parts[0], run_name='__main__')
