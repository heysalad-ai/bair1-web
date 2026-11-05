"""Run the real manual USB helper against a serial boundary fake, never hardware."""
import importlib.util,json,pathlib,secrets,uuid
import contextlib,io,sys,types
from unittest.mock import patch
root=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('factory_usb',root/'scripts/factory_usb.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
class Port:
 def __init__(self):self.board='XIAO-'+secrets.token_hex(6).upper();self.boot=secrets.token_hex(16).upper();self.reply=None;self.writes=[];self.wrong=False
 def write(self,data):
  c=json.loads(data);self.writes.append(c)
  self.reply={'bair1':'identity' if c['bair1']=='identify' else 'configured','requestId':c['requestId'],'deviceId':self.board,'bootSession':self.boot,'protocolVersion':1,'chip':'ESP32-S3','firmwareVersion':helper.VERSION}
  if c['bair1']=='configure' and self.wrong:self.reply['deviceId']='XIAO-'+secrets.token_hex(6).upper()
 def flush(self):pass
 def __enter__(self):return self
 def __exit__(self,*_args):return False
 def readline(self,_limit):
  if self.reply is None:return b''
  result=(json.dumps(self.reply)+'\n').encode();self.reply=None;return result
port=Port();assert helper.identity(port)['deviceId']==port.board
settings={'deviceId':port.board,'ssid':'Synthetic factory','password':'synthetic-password','apiKey':'bair1_synthetic_key_not_a_real_credential','factorySessionId':str(uuid.uuid4()),'url':helper.UPLOAD_URL}
helper.configure(port,settings);assert port.writes[-1]['bootSession']==port.boot
before=len(port.writes)
try:helper.configure(port,{**settings,'deviceId':'XIAO-'+secrets.token_hex(6).upper()});raise AssertionError('Wrong board was accepted')
except ValueError:pass
assert len(port.writes)==before+1 # identity only; no settings sent to the wrong board
try:helper.configure(port,{**settings,'url':'https://synthetic.invalid'});raise AssertionError('Wrong server accepted')
except ValueError:pass
port.wrong=True
try:helper.configure(port,settings);raise AssertionError('Wrong acknowledgment accepted')
except ValueError:pass
print('Actual manual helper passed: identity, matching-board configuration, fresh boot binding, wrong-board/server rejection and acknowledgment validation.')
# pyserial 3.5's Windows backend rejects exclusive=False before opening a port.
# Execute the real CLI entry point, not only its already-open serial routines.
opened=Port()
def windows_serial(*args,**kwargs):
 if kwargs.get('exclusive') is not None and not kwargs['exclusive']:
  raise ValueError('win32 only supports exclusive access')
 assert args==('COM7',115200)
 return opened
# Scope the Windows platform simulation to the helper. Changing sys.platform
# globally makes newer Python stdlib modules import Windows-only native APIs on Linux.
with patch.dict(sys.modules,{'serial':types.SimpleNamespace(Serial=windows_serial)}), patch.object(helper,'sys',types.SimpleNamespace(platform='win32')), patch.object(sys,'argv',['factory_usb.py','--port','COM7','--identify']), patch.object(helper.time,'sleep',lambda _:None), contextlib.redirect_stdout(io.StringIO()) as captured:
 helper.main()
assert captured.getvalue().strip()==opened.board
print('Windows serial-open regression passed through the actual helper CLI entry point.')
