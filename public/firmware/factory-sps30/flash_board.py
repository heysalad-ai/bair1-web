import pathlib,re,subprocess,sys
import verify_package
root=pathlib.Path(__file__).resolve().parent
port=input('Enter board COM port (for example COM7): ').strip()
if not re.fullmatch(r'COM[0-9]+',port,re.I):
 sys.exit('Invalid COM port.')
args=[sys.executable,'-m','esptool','--chip','esp32s3','--port',port,'write-flash','0x0','bootloader.bin','0x8000','partitions.bin','0xe000','boot_app0.bin','0x10000','application.bin']
sys.exit(subprocess.run(args,cwd=root).returncode)
