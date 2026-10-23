(function(){
  var $=function(i){return document.getElementById(i)};
  var S={n1:"Io",n2:"Te",since:""},photos=[],cur=0,timer=null;
  var db=null,assets=null,canEdit=false,els={},capTimers={};
  var dlg=$("dlg");

  function setNote(t){$("note").textContent=t}

  function applyMode(){
    document.body.classList.toggle("ro",!canEdit);
    ["n1","n2"].forEach(function(k){$(k).contentEditable=canEdit?"true":"false"});
    $("add").style.display=canEdit?"":"none";
    $("drop").querySelector("span").textContent=canEdit?"Trascina le vostre foto in questa pagina oppure premi “Aggiungi foto”.":"Le foto compariranno qui appena verranno aggiunte.";
    setNote(canEdit?"Foto, dediche e nomi sono salvati nel database: chi apre questa pagina, da qualsiasi browser, vede le stesse foto.":"Stai guardando l’album in sola lettura.");
    renderSince();
  }

  function saveSettings(){
    if(!db||!canEdit)return;
    db.doc("settings/main").set({n1:S.n1,n2:S.n2,since:S.since}).catch(function(){setNote("Impossibile salvare i dati. Riprova.")});
  }
  ["n1","n2"].forEach(function(k){
    $(k).addEventListener("input",function(){S[k]=$(k).textContent;saveSettings()});
    $(k).addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();e.target.blur()}});
  });

  function renderSince(){
    var el=$("since");
    if(S.since){
      var days=Math.floor((Date.now()-new Date(S.since).getTime())/864e5);
      el.innerHTML="Insieme da <b>"+Math.max(0,days).toLocaleString("it-IT")+"</b> giorni"+(canEdit?" <label><input type=\"date\" id=\"sd\" value=\""+S.since+"\" aria-label=\"Data di inizio\"></label>":"");
    }else if(canEdit){
      el.innerHTML="<label>Da quando state insieme? <input type=\"date\" id=\"sd\" aria-label=\"Data di inizio\"></label>";
    }else el.innerHTML="";
    var sd=$("sd");
    if(sd)sd.addEventListener("change",function(e){S.since=e.target.value;saveSettings();renderSince()});
  }

  function makeCard(p){
    var f=document.createElement("figure");f.className="polaroid";
    var im=document.createElement("img");im.loading="lazy";im.tabIndex=0;
    im.addEventListener("click",function(){open(indexOf(p.id))});
    im.addEventListener("keydown",function(e){if(e.key==="Enter")open(indexOf(p.id))});
    var c=document.createElement("input");c.className="cap";c.type="text";c.maxLength=60;c.placeholder=canEdit?"Scrivi una dedica…":"";
    c.addEventListener("input",function(){
      clearTimeout(capTimers[p.id]);
      capTimers[p.id]=setTimeout(function(){db.doc("photos/"+p.id).update({cap:c.value}).catch(function(){setNote("Dedica non salvata. Riprova.")})},500);
    });
    var d=document.createElement("button");d.className="del";d.textContent="✕";d.setAttribute("aria-label","Elimina foto");
    var armed=null;
    function disarm(){clearTimeout(armed);armed=null;d.classList.remove("sure");d.textContent="✕";d.setAttribute("aria-label","Elimina foto")}
    d.addEventListener("click",function(){
      if(!armed){
        d.classList.add("sure");d.textContent="Elimina?";d.setAttribute("aria-label","Conferma l’eliminazione");
        armed=setTimeout(disarm,3500);return;
      }
      disarm();d.disabled=true;
      db.doc("photos/"+p.id).delete()
        .then(function(){return assets?assets.delete(p.aid):null})
        .then(function(){setNote("Foto eliminata.")})
        .catch(function(){d.disabled=false;setNote("Impossibile eliminare la foto. Riprova.")});
    });
    f.append(im,c,d);
    return {f:f,im:im,c:c};
  }
  function indexOf(id){for(var i=0;i<photos.length;i++)if(photos[i].id===id)return i;return 0}

  function render(){
    var g=$("grid"),ids={};
    $("drop").classList.toggle("show",!photos.length);
    photos.forEach(function(p,i){
      ids[p.id]=1;
      var e=els[p.id];
      if(!e){e=els[p.id]=makeCard(p)}
      var src="/_blob/"+p.aid;
      if(e.im.getAttribute("src")!==src)e.im.src=src;
      e.im.alt=p.cap||"Foto di coppia "+(i+1);
      e.f.style.setProperty("--r",((i%5)-2)*1.5+"deg");
      if(document.activeElement!==e.c)e.c.value=p.cap||"";
      e.c.readOnly=!canEdit;
      e.c.setAttribute("aria-label","Dedica per la foto "+(i+1));
      g.appendChild(e.f);
    });
    Object.keys(els).forEach(function(id){if(!ids[id]){els[id].f.remove();delete els[id]}});
    if(dlg.open){if(!photos.length)dlg.close();else{cur=Math.min(cur,photos.length-1);show()}}
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
  function errText(e){return (e&&(e.code||e.message))||"errore sconosciuto"}
  function addFiles(list){
    if(!canEdit||!db||!assets)return;
    var files=Array.prototype.filter.call(list,function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)});
    if(!files.length){setNote("Seleziona almeno un file immagine.");return}
    setNote("Caricamento di "+files.length+" foto in corso…");
    var chain=Promise.resolve(),ok=0,errs=[];
    files.forEach(function(file,i){
      chain=chain.then(function(){return shrink(file)}).then(function(b){
        var blob=b||(/^image\/(jpeg|png|webp|gif)$/.test(file.type)?file:null);
        if(!blob){errs.push(file.name+": formato non supportato");return}
        return assets.upload(blob,{type:blob.type}).then(function(r){
          return db.collection("photos").add({aid:r.id,cap:"",ts:Date.now()+i}).then(function(){ok++},function(e){
            errs.push("salvataggio nel database ("+errText(e)+")");
            try{assets.delete(r.id)}catch(_){}
          });
        },function(e){errs.push("caricamento del file ("+errText(e)+")")});
      });
    });
    chain.then(function(){
      if(!errs.length)setNote("Foto salvate nel database.");
      else setNote((ok?"Salvate "+ok+" foto su "+files.length+". ":"Nessuna foto salvata. ")+"Errore: "+errs[0]+".");
      if(ok)burst(8);
    });
  }
  $("add").onclick=function(){$("file").click()};
  $("file").onchange=function(e){addFiles(e.target.files);e.target.value=""};
  ["dragenter","dragover"].forEach(function(t){document.addEventListener(t,function(e){if(!canEdit)return;e.preventDefault();document.body.classList.add("over")})});
  ["dragleave","drop"].forEach(function(t){document.addEventListener(t,function(e){if(!canEdit)return;e.preventDefault();document.body.classList.remove("over");if(t==="drop"&&e.dataTransfer)addFiles(e.dataTransfer.files)})});

  function show(){var p=photos[cur];if(!p)return;$("big").src="/_blob/"+p.aid;$("big").alt=p.cap||"";$("bigcap").textContent=p.cap||""}
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
    if(!photos.length){if(canEdit)$("add").click();return}
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

  renderSince();render();
  setNote("Collegamento al database…");

  (async function(){
    try{
      if(!window.claude)throw 0;
      db=await claude.use("db");
      assets=await claude.use("assets");
      var user=await claude.use("user");
      if(!db){setNote("Il database non è disponibile: apri la pagina da claude.ai e accedi con il tuo account.");return}
      var w=user?await user.can("data.write"):null;
      canEdit=(w!==false)&&!!assets;
      applyMode();
      db.doc("settings/main").onSnapshot(function(snap){
        var d=snap.exists?snap.data():null;
        if(d){
          S.n1=d.n1||"Io";S.n2=d.n2||"Te";S.since=d.since||"";
          if(document.activeElement!==$("n1"))$("n1").textContent=S.n1;
          if(document.activeElement!==$("n2"))$("n2").textContent=S.n2;
          if(!document.activeElement||document.activeElement.id!=="sd")renderSince();
        }
      },function(){});
      db.collection("photos").orderBy("ts").onSnapshot(function(snap){
        photos=snap.docs.map(function(x){var d=x.data()||{};return {id:x.id,aid:d.aid,cap:d.cap||""}}).filter(function(p){return p.aid});
        render();
      },function(){setNote("Impossibile leggere le foto dal database.")});
    }catch(e){setNote("Il database non è disponibile in questa visualizzazione.")}
  })();
})();
