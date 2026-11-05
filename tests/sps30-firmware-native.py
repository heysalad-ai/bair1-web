"""Execute actual SPS30 serializer/validation logic natively; no physical claims."""
import pathlib, subprocess, tempfile, os, secrets
root=pathlib.Path(__file__).resolve().parent.parent
s=(root/'firmware/Bair1_SPS30/Bair1_SPS30.ino').read_text()
struct=s[s.index('struct Sample {'):s.index('SensirionI2cSps30 sensor;')]
functions=s[s.index('bool massValid('):s.index('bool accepted(')].replace('String(s.sequence)','std::to_string(s.sequence)')
source="""#include <ArduinoJson.h>
#include <string>
#include <atomic>
#include <cassert>
#include <cmath>
#include <iostream>
#include <ctime>
using std::isfinite;
std::string deviceId="synthetic",bootSession="synthetic-boot",factorySessionId="";
const char FACTORY_VERSION[]="bair1-xiao-sps30-1.0.0",DEVICE_NAME[]="Synthetic SPS30";
std::atomic<uint32_t> dropped{0};
"""+struct+functions+"""
int main(int argc,char**argv){assert(argc==2);deviceId=argv[1];Sample s{};s.sensorUptimeMs=30000;s.status=0;s.valid=validFrame(s,0);assert(s.valid);
 JsonDocument d;makePayload(s,d);assert(d["pm1"].is<float>());assert(d["pm1"]==0);assert(d["sps30Valid"]==true);assert(d["aqi"].isNull());
 assert(!validFrame(s,1));s.sensorUptimeMs=29999;assert(!validFrame(s,0));s.sensorUptimeMs=30000;
 s.status=1;assert(!validFrame(s,0));s.status=0;s.sensorAgeMs=2501;assert(!validFrame(s,0));s.sensorAgeMs=0;
 s.pm25=NAN;assert(!validFrame(s,0));s.pm25=1001;assert(!validFrame(s,0));s.pm25=-1;assert(!validFrame(s,0));
 s.valid=false;JsonDocument failed;makePayload(s,failed);assert(failed["pm1"].isNull());assert(failed["pm25"].isNull());assert(failed["sps30Valid"]==false);
 Sample fresh{};fresh.sensorUptimeMs=35000;fresh.status=0;fresh.sequence=1;fresh.epochSeconds=std::time(nullptr);fresh.valid=validFrame(fresh,0);JsonDocument fixture;makePayload(fresh,fixture);serializeJson(fixture,std::cout);
}
"""
b=pathlib.Path(tempfile.mkdtemp(prefix='bair1-sps-native-'));(b/'test.cpp').write_text(source)
include=os.environ.get('ARDUINOJSON_INCLUDE',str(pathlib.Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'))
subprocess.run(['clang++','-std=c++17','-I',include,str(b/'test.cpp'),'-o',str(b/'test')],check=True)
fixture=subprocess.check_output([str(b/'test'),'XIAO-'+secrets.token_hex(6).upper()]);pathlib.Path('/tmp/bair1-sps30-firmware-payload.json').write_bytes(fixture)
print('Actual SPS30 firmware serializer and validation passed: zero, warm-up, CRC error code, status, age, range, null-on-failure.')
