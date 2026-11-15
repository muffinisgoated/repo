"""Compile the exact pure Swift projection. This is not native UI acceptance."""
from pathlib import Path
import subprocess,json,tempfile
source=Path('admin/App.swift').read_text()
pure=source[source.index('// BEGIN ARCADE PRESENTATION'):source.index('@main struct AdminApp:App')]
checks=r'''
func check(_ value:Bool,_ message:String){if !value{fatalError(message)}}
check(ArcadePresentation.cards([:])[0].1=="Unavailable","older collector")
for size in [10,30,50,100]{
 let games:[[String:Any]]=(0..<size).map{["id":"g-\($0)","name":String(format:"Game %03d",$0),"clients":$0%3,"sessions":$0%4,"launches":$0]}
 let metrics:[String:Any]=["arcade":["available":true,"historyAvailable":true,"clientsOnline":2,"openSessions":3,"totalLaunches":size*(size-1)/2,"mostPopular":"Game","startedAt":"2026-11-08T00:00:00.000Z","games":games]]
 let start=Date();for _ in 0..<300 {check(ArcadePresentation.rows(metrics,query:"",sort:"launches").first?.total==size-1,"launch sorting");check(ArcadePresentation.rows(metrics,query:"Game 001",sort:"name").count==1,"search")}
 check(ArcadePresentation.rows(metrics,query:"",sort:"fewest").first?.total==0,"ascending")
 check(ArcadePresentation.cards(metrics)[0].1=="2","distinct clients")
 check(ArcadePresentation.coverage(metrics).contains("non-Private"),"privacy coverage")
 print("games=\(size) rows=\(size) iterations=300 searchSortMs=\(Date().timeIntervalSince(start)*1000)")
}
let unavailable:[String:Any]=["arcade":["available":true,"historyAvailable":false,"games":[["id":"x","name":"X","launches":9]]]]
check(ArcadePresentation.cards(unavailable)[2].1=="Unavailable","unavailable history")
check(ArcadePresentation.rows(unavailable,query:"",sort:"name")[0].launches=="Unavailable","row history")
print("PASS: actual Swift presentation logic; controlled fixtures, not authenticated native UI")
'''
with tempfile.TemporaryDirectory(prefix='poxey-arcade-swift-') as directory:
 p=Path(directory);(p/'main.swift').write_text('import Foundation\nimport CoreFoundation\n'+pure+checks)
 overlay=str(Path('outputs/stage72-admin/toolchain-overlay.json').resolve())
 subprocess.run(['swiftc','-vfsoverlay',overlay,'-Xcc','-ivfsoverlay','-Xcc',overlay,'-sdk','/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk','-module-cache-path','/private/tmp/poxey-admin-swift-cache-fixed',str(p/'main.swift'),'-o',str(p/'verify')],check=True)
 subprocess.run([str(p/'verify')],check=True)
