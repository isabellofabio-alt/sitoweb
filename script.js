(function(){
  var $=function(i){return document.getElementById(i)};
  var API="api.php",S={n1:"Io",n2:"Te",since:""},photos=[],admin=false,cur=0,timer=null;
  var els={},capT={},setT=null,dlg=$("dlg"),uploading=false;

  function note(t){$("note").textContent=t}
  function api(action,opt){
    opt=opt||{};
    var o={method:"GET",credentials:"same-origin",headers:{"X-Requested-With":"album"}};
    if(opt.json){o.method="POST";o.headers["Content-Type"]="application/json";o.body=JSON.stringify(opt.json)}
    if(opt.form){o.method="POST";o.body=opt.form}
    if(opt.post&&!o.body){o.method="POST"}
    return fetch(API+"?action="+action,o).then(function(r){
      return r.text().then(function(t){
        var d;
        try{d=JSON.parse(t)}catch(e){
          var snip=t.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,160);
          throw new Error("Il server non ha risposto con dati validi (HTTP "+r.status+")"+(snip?": "+snip:"")+".");
        }
        if(!r.ok||d.error)throw new Error(d.error||("Errore "+r.status));
        return d;
      });
    },function(){throw new Error("Impossibile contattare api.php: controlla che sia nella stessa cartella e che la pagina sia aperta dal tuo server (non come file locale).")});
  }

  function applyMode(){
    document.body.classList.toggle("ro",!admin);
    ["n1","n2"].forEach(function(k){$(k).contentEditable=admin?"true":"false"});
    $("add").style.display=admin?"":"none";
    $("lock").textContent=admin?"🔓 Esci dalla modifica":"🔒 Modifica";
    $("drop").querySelector("span").textContent=admin?"Trascina le vostre foto in questa pagina oppure premi “Aggiungi foto”.":"Le foto compariranno qui appena verranno aggiunte.";
    if(!admin)$("login").classList.remove("show");
    renderSince();
  }

  function renderSince(){
    var el=$("since");
    if(S.since){
      var days=Math.floor((Date.now()-new Date(S.since).getTime())/864e5);
      el.innerHTML="Insieme da <b>"+Math.max(0,days).toLocaleString("it-IT")+"</b> giorni"+(admin?" <label><input type=\"date\" id=\"sd\" value=\""+S.since+"\" aria-label=\"Data di inizio\"></label>":"");
    }else if(admin){
      el.innerHTML="<label>Da quando state insieme? <input type=\"date\" id=\"sd\" aria-label=\"Data di inizio\"></label>";
    }else el.innerHTML="";
    var sd=$("sd");
    if(sd)sd.addEventListener("change",function(e){S.since=e.target.value;saveSettings();renderSince()});
  }

  function saveSettings(){
    if(!admin)return;
    clearTimeout(setT);
    setT=setTimeout(function(){api("settings",{json:S}).catch(function(e){note(e.message)})},500);
  }
  ["n1","n2"].forEach(function(k){
    $(k).addEventListener("input",function(){S[k]=$(k).textContent;saveSettings()});
    $(k).addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();e.target.blur()}});
  });

  function src(p){return API+"?action=image&id="+p.id}
  function indexOf(id){for(var i=0;i<photos.length;i++)if(photos[i].id===id)return i;return 0}

  function makeCard(p){
    var f=document.createElement("figure");f.className="polaroid";
    var im=document.createElement("img");im.loading="lazy";im.tabIndex=0;
    im.addEventListener("click",function(){open(indexOf(p.id))});
    im.addEventListener("keydown",function(e){if(e.key==="Enter")open(indexOf(p.id))});
    var c=document.createElement("input");c.className="cap";c.type="text";c.maxLength=60;c.placeholder="Scrivi una dedica…";
    c.addEventListener("input",function(){
      clearTimeout(capT[p.id]);
      capT[p.id]=setTimeout(function(){api("caption",{json:{id:p.id,cap:c.value}}).catch(function(e){note(e.message)})},500);
    });
    var d=document.createElement("button");d.className="del";d.textContent="✕";d.setAttribute("aria-label","Elimina foto");
    var armed=null;
    function disarm(){clearTimeout(armed);armed=null;d.classList.remove("sure");d.textContent="✕";d.setAttribute("aria-label","Elimina foto")}
    d.addEventListener("click",function(){
      if(!armed){d.classList.add("sure");d.textContent="Elimina?";d.setAttribute("aria-label","Conferma l’eliminazione");armed=setTimeout(disarm,3500);return}
      disarm();d.disabled=true;
      api("delete",{json:{id:p.id}}).then(function(){note("Foto eliminata.");return refresh()}).catch(function(e){d.disabled=false;note(e.message)});
    });
    f.append(im,c,d);
    return {f:f,im:im,c:c};
  }

  function render(){
    var g=$("grid"),ids={};
    $("drop").classList.toggle("show",!photos.length);
    photos.forEach(function(p,i){
      ids[p.id]=1;
      var e=els[p.id]||(els[p.id]=makeCard(p));
      if(e.im.getAttribute("src")!==src(p))e.im.src=src(p);
      e.im.alt=p.cap||"Foto di coppia "+(i+1);
      e.f.style.setProperty("--r",((i%5)-2)*1.5+"deg");
      if(document.activeElement!==e.c)e.c.value=p.cap||"";
      e.c.readOnly=!admin;
      e.c.setAttribute("aria-label","Dedica per la foto "+(i+1));
      g.appendChild(e.f);
    });
    Object.keys(els).forEach(function(id){if(!ids[id]){els[id].f.remove();delete els[id]}});
    if(dlg.open){if(!photos.length)dlg.close();else{cur=Math.min(cur,photos.length-1);show()}}
  }

  function refresh(){
    return api("state").then(function(d){
      admin=!!d.admin;
      var a=document.activeElement,editing=a&&(a.id==="n1"||a.id==="n2"||a.id==="sd");
      if(!editing){S=d.settings;$("n1").textContent=S.n1;$("n2").textContent=S.n2}
      photos=d.photos;
      applyMode();render();
      if(!uploading)note(admin?"Modalità modifica attiva. Tutto viene salvato nel database MySQL.":"Stai guardando l’album in sola lettura.");
    }).catch(function(e){note(e.message)});
  }

  function shrink(file){
    return new Promise(function(res){
      var u=URL.createObjectURL(file),im=new Image();
      im.onload=function(){
        var m=1400,k=Math.min(1,m/Math.max(im.width,im.height)),cv=document.createElement("canvas");
        cv.width=Math.round(im.width*k);cv.height=Math.round(im.height*k);
        cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height);
        URL.revokeObjectURL(u);cv.toBlob(function(b){res(b)},"image/jpeg",.82);
      };
      im.onerror=function(){URL.revokeObjectURL(u);res(null)};
      im.src=u;
    });
  }
  function addFiles(list){
    if(!admin)return;
    var files=Array.prototype.filter.call(list,function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)});
    if(!files.length){note("Seleziona almeno un file immagine.");return}
    uploading=true;note("Caricamento di "+files.length+" foto in corso…");
    var chain=Promise.resolve(),ok=0,errs=[];
    files.forEach(function(file){
      chain=chain.then(function(){return shrink(file)}).then(function(b){
        var blob=b||(/^image\/(jpeg|png|webp|gif)$/.test(file.type)?file:null);
        if(!blob){errs.push(file.name+": formato non supportato");return}
        var fd=new FormData();fd.append("photo",blob,"foto.jpg");
        return api("upload",{form:fd}).then(function(){ok++},function(e){errs.push(e.message)});
      });
    });
    chain.then(function(){
      uploading=false;
      return refresh();
    }).then(function(){
      note(errs.length?(ok?"Salvate "+ok+" foto su "+files.length+". ":"Nessuna foto salvata. ")+errs[0]:"Foto salvate nel database.");
      if(ok)burst(8);
    });
  }
  $("add").onclick=function(){$("file").click()};
  $("file").onchange=function(e){addFiles(e.target.files);e.target.value=""};
  ["dragenter","dragover"].forEach(function(t){document.addEventListener(t,function(e){if(!admin)return;e.preventDefault();document.body.classList.add("over")})});
  ["dragleave","drop"].forEach(function(t){document.addEventListener(t,function(e){if(!admin)return;e.preventDefault();document.body.classList.remove("over");if(t==="drop"&&e.dataTransfer)addFiles(e.dataTransfer.files)})});

  $("lock").onclick=function(){
    if(admin){api("logout",{post:1}).then(refresh).catch(function(e){note(e.message)});return}
    $("login").classList.toggle("show");if($("login").classList.contains("show"))$("pw").focus();
  };
  $("login").addEventListener("submit",function(e){
    e.preventDefault();
    api("login",{json:{password:$("pw").value}}).then(function(){$("pw").value="";return refresh()}).catch(function(err){note(err.message)});
  });

  function show(){var p=photos[cur];if(!p)return;$("big").src=src(p);$("big").alt=p.cap||"";$("bigcap").textContent=p.cap||""}
  function open(i){if(!photos.length)return;cur=i;show();if(!dlg.open)dlg.showModal()}
  function step(d){if(!photos.length)return;cur=(cur+d+photos.length)%photos.length;show()}
  function stop(){clearInterval(timer);timer=null;$("play").textContent="▶ Guarda il nostro film"}
  $("prev").onclick=function(){stop();step(-1)};
  $("next").onclick=function(){stop();step(1)};
  $("close").onclick=function(){dlg.close()};
  dlg.addEventListener("close",stop);
  dlg.addEventListener("click",function(e){if(e.target===dlg)dlg.close()});
  document.addEventListener("keydown",function(e){if(!dlg.open)return;if(e.key==="ArrowRight")step(1);if(e.key==="ArrowLeft")step(-1)});
  $("play").onclick=function(){
    if(!photos.length){if(admin)$("add").click();return}
    open(0);$("play").textContent="❚❚ Pausa";
    timer=setInterval(function(){step(1)},3000);
  };

  function burst(n){
    var h=$("hearts"),set=["♥","❤","💗","💕"];
    for(var i=0;i<n;i++){
      var s=document.createElement("span");
      s.textContent=set[i%set.length];s.style.left=Math.random()*95+"%";
      s.style.setProperty("--s",(1.2+Math.random()*1.8)+"rem");s.style.setProperty("--a",(Math.random()*60-30)+"deg");
      s.style.animationDelay=Math.random()*.8+"s";s.style.color="#e0245e";
      h.appendChild(s);setTimeout(function(el){el.remove()},4200,s);
    }
  }
  $("love").onclick=function(){burst(24)};

  note("Collegamento al database…");
  refresh();
  setInterval(function(){
    var a=document.activeElement;
    if(document.hidden||uploading||dlg.open||(a&&(a.tagName==="INPUT"||a.isContentEditable)))return;
    refresh();
  },20000);
})();