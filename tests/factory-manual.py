"""Run the real manual USB helper against a serial boundary fake, never hardware."""
import importlib.util,json,pathlib,secrets,uuid
root=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('factory_usb',root/'scripts/factory_usb.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
class Port:
 def __init__(self):self.board='XIAO-'+secrets.token_hex(6).upper();self.boot=secrets.token_hex(16).upper();self.reply=None;self.writes=[];self.wrong=False
 def write(self,data):
  c=json.loads(data);self.writes.append(c)
  self.reply={'bair1':'identity' if c['bair1']=='identify' else 'configured','requestId':c['requestId'],'deviceId':self.board,'bootSession':self.boot,'protocolVersion':1,'chip':'ESP32-S3','firmwareVersion':helper.VERSION}
  if c['bair1']=='configure' and self.wrong:self.reply['deviceId']='XIAO-'+secrets.token_hex(6).upper()
 def flush(self):pass
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
