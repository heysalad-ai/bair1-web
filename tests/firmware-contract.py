"""Compile the actual sketch serializer/acknowledger natively; never flash or contact a server."""
import pathlib,subprocess,os,tempfile,uuid
root=pathlib.Path(__file__).resolve().parent.parent
s=(root/'firmware/Bair1_Xiao/Bair1_Xiao.ino').read_text()
struct=s[s.index('struct Sample {'):s.index('Adafruit_BME280 bme;')]
payload=s[s.index('void makePayload('):s.index('\nbool accepted(')].replace('String(s.sequence)','std::to_string(s.sequence)')
ack=s[s.index('bool accepted('):s.index('\nvoid uploadTask')].replace('String','std::string')
source='''#include <ArduinoJson.h>
#include <string>
#include <atomic>
#include <iostream>
#include <ctime>
#include <cassert>
#include "bair1_config.h"
std::string deviceId, bootSession="native-test-boot";
std::atomic<uint32_t> dropped{0};
'''+struct+payload+ack+'''
int main(int argc,char **argv){
 if(argc>1 && std::string(argv[1])=="ack") {
  std::string line; int i=0;
  while(std::getline(std::cin,line)) {JsonDocument d;assert(!deserializeJson(d,line));std::string body;serializeJson(d["body"],body);
   assert(accepted(d["status"],body)==(i<2));++i;
  }
  assert(i==3);std::cout<<"Actual firmware accepted stored/duplicate and rejected conflict replies\\n";return 0;
 }
 assert(argc==2); deviceId=argv[1]; Sample s{};s.sequence=42;s.epochSeconds=std::time(nullptr)-60;s.uptimeMs=120000;
 s.temperature=21.5;s.humidity=55;s.pressure=1010;s.altitude=27;s.d3Raw=2000;s.d3Mv=1500;s.d2Raw=1000;s.d2Mv=750;s.bmeValid=true;
 JsonDocument d;makePayload(s,d);serializeJson(d,std::cout);std::cout<<"\\n";
}
'''
build=pathlib.Path(tempfile.mkdtemp(prefix='bair1-native-'))
(build/'contract.cpp').write_text(source)
include=os.environ.get('ARDUINOJSON_INCLUDE',str(pathlib.Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'))
subprocess.run(['clang++','-std=c++17','-I',include,'-I',str(root/'firmware/Bair1_Xiao'),str(build/'contract.cpp'),'-o',str(build/'contract')],check=True)
fixture=pathlib.Path('/tmp/bair1-firmware-payload.json');fixture.write_bytes(subprocess.check_output([str(build/'contract'),str(uuid.uuid4())]))
pathlib.Path('/tmp/bair1-native-contract-path').write_text(str(build/'contract'))
print('Actual sketch serializer compiled; generated synthetic payload in /tmp/bair1-firmware-payload.json')
