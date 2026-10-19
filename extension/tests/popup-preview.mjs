import { readFile, writeFile, mkdir } from "node:fs/promises";

class PopupPreviewBuilder {
  async run() {
    const source = await readFile(new URL("../popup/index.html", import.meta.url), "utf8");
    const script = `<script>
class PopupPreviewRuntime {
  constructor() {
    this.record=null; this.running=false; this.progress=null;
    this.runtime={id:'preview-fixture',getURL:path=>path==='_favicon/' ? new URL('../assets/technology-icons/wordpress.svg',document.baseURI).href : new URL('../'+path,document.baseURI).href,sendMessage:message=>this.send(message),openOptionsPage:async()=>{}};
    this.tabs={query:async()=>[{id:1,url:'https://demo.example/'}]};
  }
  async send({action}) {
    if(action==='analyze') {this.running=true;this.progress={stage:'browser',message:'Collecting page findings…',connector:null};}
    if(action==='state') return {ok:true,data:{running:this.running,progress:this.progress,connectorEnabled:true,latest:this.record?.summary??null}};
    const {FingerprintService}=await import('../src/services/FingerprintService.js');
    const {GraphBuilder}=await import('../src/models/GraphBuilder.js');
    const {CollectionRepository}=await import('../src/services/CollectionRepository.js');
    const catalog=await(await fetch('../fingerprints.json')).json();
    const snapshot={url:'https://demo.example/',title:'Popup UI fixture',collected_at:new Date().toISOString(),links:[{url:'https://demo.example/about'},{url:'https://docs.example/'}],resources:[{url:'https://demo.example/_next/static/app.js',kind:'script',observed_via:'performance'},{url:'https://js.stripe.com/v3/',kind:'script',observed_via:'performance'}],hints:[],generators:['WordPress 6.7.1'],runtimeAvailable:true,js:{'React.version':'19.1.0','jQuery.fn.jquery':'3.7.1','DD_RUM':'present'}};
    const hosts=['api.simet.nic.br','ipv4-api.simet.nic.br','ipv6-api.simet.nic.br','ipv4.sp-ix-p1.sp-ix.peers.simet.nic.br','ipv4.sp-ix-p2.sp-ix.peers.simet.nic.br','ipv4.sp-ix-p3.sp-ix.peers.simet.nic.br','ipv4.sp-p1.sp.peers.simet.nic.br','fonts.gstatic.com','www.gstatic.com'];
    snapshot.resources.push(...hosts.map(host=>({url:'https://'+host+'/fixture.js',kind:'script',observed_via:'performance'})));
    const technologies=new FingerprintService(catalog).detect(snapshot);
    const graph=new GraphBuilder().build(snapshot,technologies);
    const entities=new CollectionRepository({}).entities(graph);
    if(action==='detect') return {ok:true,data:{page:snapshot.url,technologies,runtimeAvailable:true,catalogSize:catalog.technologies.length,entities,metrics:{...new CollectionRepository({}).summary({id:'preview',document:graph}).metrics,ips:null},relatedDomains:['docs.example','js.stripe.com',...hosts]}};
    if(action==='analyze') {
      const {ConnectorEnrichmentService}=await import('../src/services/ConnectorEnrichmentService.js');
      const {ConnectorSettings}=await import('../src/models/ConnectorSettings.js');
      const {DocumentValidator}=await import('../explorer/src/services/DocumentValidator.js');
      this.running=true;
      const settings=new ConnectorSettings({endpoint:'https://connector.example/w3bmap.php',apiKey:'a'.repeat(64)});
      const connector={capabilities:async()=>{await new Promise(resolve=>setTimeout(resolve,700));return {modules:settings.modules};},
        analyze:async()=>{await new Promise(resolve=>setTimeout(resolve,1500));
          const root={...graph.nodes[0],source:'probe'};
          const ip={...root,id:'ip:1.1.1.1',label:'1.1.1.1',type:'ip',evidence:{fixture:true}};
          return {...graph,source:'probe',nodes:[root,ip],edges:[],results:Object.fromEntries(settings.modules.map(module=>[module,{fixture:true}])),errors:[]};}};
      try {
        const combined=await new ConnectorEnrichmentService(connector,new DocumentValidator(),new CollectionRepository({})).enrich(graph,settings,report=>{this.progress={stage:'connector',message:report.connection==='checking'?'Testing the PHP connection…':'Running PHP checks…',connector:report};});
        const document=combined.document;const record={id:'preview',document};
        this.record={document,summary:new CollectionRepository({}).summary(record)};
        return {ok:true,data:this.record.summary};
      } finally {this.running=false;this.progress=null;}
    }
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
