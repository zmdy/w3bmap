import { readFile, writeFile, mkdir } from "node:fs/promises";

class PopupPreviewBuilder {
  async run() {
    const source = await readFile(new URL("../popup/index.html", import.meta.url), "utf8");
    const script = `<script>
class PopupPreviewRuntime {
  constructor() {
    this.record=null;
    this.runtime={id:'preview-fixture',getURL:path=>path==='_favicon/' ? new URL('../assets/technology-icons/wordpress.svg',document.baseURI).href : new URL('../'+path,document.baseURI).href,sendMessage:message=>this.send(message),openOptionsPage:async()=>{}};
    this.tabs={query:async()=>[{id:1,url:'https://demo.example/'}]};
  }
  async send({action}) {
    if(action==='state') return {ok:true,data:{running:false,connectorEnabled:true,latest:this.record?.summary??null}};
    const {FingerprintService}=await import('../src/services/FingerprintService.js');
    const {GraphBuilder}=await import('../src/models/GraphBuilder.js');
    const {CollectionRepository}=await import('../src/services/CollectionRepository.js');
    const catalog=await(await fetch('../fingerprints.json')).json();
    const snapshot={url:'https://demo.example/',title:'Popup UI fixture',collected_at:new Date().toISOString(),links:[{url:'https://demo.example/about'},{url:'https://docs.example/'}],resources:[{url:'https://demo.example/_next/static/app.js',kind:'script',observed_via:'performance'},{url:'https://js.stripe.com/v3/',kind:'script',observed_via:'performance'}],hints:[],generators:['WordPress 6.7.1'],runtimeAvailable:true,js:{'React.version':'19.1.0','jQuery.fn.jquery':'3.7.1','DD_RUM':'present'}};
    const technologies=new FingerprintService(catalog).detect(snapshot);
    if(action==='detect') return {ok:true,data:{page:snapshot.url,technologies,runtimeAvailable:true,catalogSize:catalog.technologies.length,metrics:{pages:3,domains:3,ips:null},relatedDomains:['docs.example','js.stripe.com']}};
    if(action==='analyze') {const document=new GraphBuilder().build(snapshot,technologies);const record={id:'preview',document};this.record={document,summary:new CollectionRepository({}).summary(record)};return {ok:true,data:this.record.summary};}
    if(action==='collection') return {ok:true,data:this.record?.document??null};
    if(action==='clear') {this.record=null;return {ok:true,data:null};}
    return {ok:false,error:'This is a UI fixture. Graph handoff requires the installed Chrome extension.'};
  }
}
globalThis.chrome=new PopupPreviewRuntime();
</script>`;
    const html = source.replace("<head>", '<head><base href="/w3bm%40p/extension/popup/">' + script)
      .replace("<title>", "<title>UI fixture · ");
    await mkdir(new URL("../../data/", import.meta.url), { recursive: true });
    await writeFile(new URL("../../data/popup-preview.html", import.meta.url), html);
    console.log("UI fixture with mock Chrome APIs: http://localhost/w3bm%40p/data/popup-preview.html");
  }
}

await new PopupPreviewBuilder().run();
