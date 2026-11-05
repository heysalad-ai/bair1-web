"""Execute the actual firmware USB parser/validator with native USB/NVS boundary fakes."""
import os,pathlib,secrets,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parent.parent
header=(root/'firmware/Bair1_Xiao/factory_usb.h').read_text().replace('#pragma once','').replace('#include <Preferences.h>','').replace('String','std::string').replace('key.startsWith("bair1_")','(key.rfind("bair1_",0)==0)')
source=r'''
#include <ArduinoJson.h>
#include <string>
#include <cstring>
#include <cctype>
#include <cassert>
#include <iostream>
std::string deviceId,bootSession="ABCDEF0123456789ABCDEF0123456789";
const char WIFI_SSID[]="",WIFI_PASSWORD[]="",BAIR1_API_KEY[]="",BAIR1_URL[]="";
struct Preferences { static inline std::string stored;static inline bool fail=false;bool begin(const char*,bool){return true;}void end(){}std::string getstd::string(const char*,const char*){return stored;}size_t putstd::string(const char*,const std::string&s){if(fail)return 0;stored=s;return s.size();} };
struct SerialFake {std::string input,output;int available(){return input.size();}char read(){char c=input[0];input.erase(0,1);return c;}size_t write(uint8_t c){output+=char(c);return 1;}size_t write(const uint8_t*p,size_t n){output.append((const char*)p,n);return n;}void println(){output+='\n';}void flush(){} } Serial;
struct EspFake {bool restarted=false;void restart(){restarted=true;}} ESP;
void delay(int){}
'''.replace('getstd::string','getString').replace('putstd::string','putString')
# Substitution changes only Arduino String types. Preserve Preferences method names.
header=header.replace('getstd::string','getString').replace('putstd::string','putString')
source+=header+r'''
JsonDocument command(){JsonDocument d;d["bair1"]="configure";d["requestId"]="native-request";d["deviceId"]=deviceId;d["bootSession"]=bootSession;d["ssid"]="Synthetic factory";d["password"]="synthetic-password";d["apiKey"]="bair1_synthetic_key_only_not_a_real_credential";d["url"]=FACTORY_URL;d["factorySessionId"]="00000000-0000-4000-8000-000000000000";return d;}
void send(JsonDocument &d){std::string line;serializeJson(d,line);handleFactoryCommand(line);}
int main(int argc,char**argv){assert(argc==2);deviceId=argv[1];
 JsonDocument identify;identify["bair1"]="identify";identify["requestId"]="native-identify";send(identify);assert(Serial.output.find("identity")!=std::string::npos);assert(Preferences::stored.empty());Serial.output.clear();
 auto d=command();assert(validFactorySettings(d));
 d["url"]="https://synthetic.invalid";assert(!validFactorySettings(d));d=command();d["password"]="short";assert(!validFactorySettings(d));d=command();d["ssid"]=std::string(33,'x');assert(!validFactorySettings(d));d=command();d["ssid"]=std::string("a\0b",3);assert(!validFactorySettings(d));
 d=command();d["deviceId"]="wrong-board";send(d);assert(Preferences::stored.empty());assert(!ESP.restarted);d=command();d["bootSession"]="old-boot";send(d);assert(Preferences::stored.empty());
 d=command();Preferences::fail=true;send(d);assert(!ESP.restarted);Preferences::fail=false;
 Serial.output.clear();d=command();send(d);assert(ESP.restarted);assert(Serial.output.find("configured")!=std::string::npos);assert(Serial.output.find("synthetic-password")==std::string::npos);assert(Serial.output.find("bair1_synthetic_key")==std::string::npos);
 loadFactoryConfig();assert(runtimeSsid=="Synthetic factory");assert(runtimePassword=="synthetic-password");assert(runtimeKey.find("bair1_")==0);assert(factorySessionId.size()==36);
 ESP.restarted=false;Serial.output.clear();auto saved=Preferences::stored;Serial.input=std::string(2100,'x')+"\n";while(Serial.available())pollFactoryUsb();assert(!ESP.restarted);assert(Preferences::stored==saved);assert(Serial.output.empty());
 std::cout<<"Actual firmware USB parser: identity, persistence, wrong-board/boot, invalid config, failed storage, overflow and no-secret acknowledgment checks passed\n";
}
'''
build=pathlib.Path(tempfile.mkdtemp(prefix='bair1-usb-native-'));(build/'contract.cpp').write_text(source)
include=os.environ.get('ARDUINOJSON_INCLUDE',str(pathlib.Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'))
subprocess.run(['clang++','-std=c++17','-I',include,str(build/'contract.cpp'),'-o',str(build/'contract')],check=True)
subprocess.run([str(build/'contract'),'XIAO-'+secrets.token_hex(6).upper()],check=True)
