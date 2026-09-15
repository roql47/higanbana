"""Call the installed local Blender addon's documented execute_code command."""
import json,socket,sys
from pathlib import Path
path=Path(sys.argv[1]).resolve()
command={'type':'execute_code','params':{'code':f"exec(compile(open({str(path)!r}, encoding='utf-8').read(), {str(path)!r}, 'exec'), {{'__file__': {str(path)!r}, '__name__': '__main__'}})"}}
with socket.create_connection(('127.0.0.1',9876),timeout=10) as s:
    s.settimeout(180);s.sendall(json.dumps(command).encode());data=b''
    while True:
        chunk=s.recv(65536)
        if not chunk:break
        data+=chunk
        try:
            result=json.loads(data);print(json.dumps(result,ensure_ascii=False));sys.exit(0 if result.get('status')=='success' else 1)
        except json.JSONDecodeError:pass
raise RuntimeError('Blender closed the connection without a complete result')
