# Build-only workaround for this Mac's duplicate obsolete SwiftBridging module map.
# Does not modify Command Line Tools, SDKs, or OS security settings.
import json, os, sys
out=os.path.abspath(sys.argv[1]);os.makedirs(out,exist_ok=True)
with open(out+'/empty.modulemap','w') as f:f.write('// Obsolete duplicate module map masked for this build only.\n')
with open(out+'/toolchain-overlay.json','w') as f:json.dump({'version':0,'roots':[{'type':'file','name':'/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap','external-contents':out+'/empty.modulemap'}]},f)
