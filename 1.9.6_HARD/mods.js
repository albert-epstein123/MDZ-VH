//MOD LOADER SCREEN
//Made by AlphaSystemsPL
//Altered by Dungx


const {mods}=await(await fetch("mods.json")).json();
let install=localStorage.getItem("mods") || `["server-simulator"]`;
install=JSON.parse(install);

const link=document.createElement("link");
link.rel="shortcut icon";
link.href="icon-256.png";
document.head.append(link);

const style=document.createElement("style");
style.innerHTML=/*css*/ `
@font-face {
	font-weight: normal;
	font-style: normal;
}
#mods{
	font-family: monospace;
	position:fixed;
	top:0;
	left:0;
	right:0;
	bottom:0;
	display:-webkit-flex;
	justify-content:center;
	align-content:center;
	padding:32px;
	-webkit-box-sizing:border-box;
}
#mods *{
	-webkit-box-sizing:border-box;
}
#mods .content{
	position: relative;
	background:#111;
	text-align:center;
	padding:32px;
	border-radius:4px;
}
#mods .title{
	font-size:20px;
	font-weight: bold;
}
#mods .list{
	margin-top:32px;
	font-family: monospace;
	background:#222;  
	overflow: auto;
	max-height: calc(100% - 82px);
	width:480px;
	text-align:left;
	border-radius:4px;
}
#mods .list label{
	display:-webkit-flex;
	align-items:center;
	justify-content:space-between;
	padding:8px 12px;
	cursor: pointer;
	user-select: none;
}
#mods .list label:hover{
	background:rgba(255,255,255,.025);
}
#mods .list label div{
	font-weight: bold;
	width:90%;
	text-overflow: ellipsis;
	overflow: hidden;
}
#mods .list .mod_name{
	font-size:18px;
	color:#fff;
}
#mods .list .version{
	font-size:15px;
	color:#aaa;
}
#mods .list .description{
	font-size:12px;
	color:#aaa;
	display:block;
	text-overflow: ellipsis;
	overflow: hidden;
}
#mods .list label input{
	display: none;
}
#mods .list mark{
	display:inline-block;
	background:#670101;
	width:28px;
	height: 20px;
	border-radius:4px;
	position: relative;
	-webkit-transition:.3s;
}
#mods .list mark::after{
	content:"";
	display:inline-block;
	position: absolute;
	top:2px;
	left:2px;
	height: 16px;
	width: 16px;
	-webkit-transition:.3s;
	-webkit-transform:translateX(0px);
	background:#aaa;
	border-radius:4px;
}
#mods .list label input:checked + mark{
	background:#266326;
}
#mods .list label input:checked + mark::after{
	-webkit-transform:translateX(8px);
}
#mods .start{
	position: absolute;
	bottom:0;
	left:0;
	right: 0;
	font-size:25px;
	padding:16px 0;
	cursor: pointer;
}
#mods .start:hover{
	color:#bc4b4b;
}
`;
document.head.append(style);

// Change the directory to game's folder (here is /1.9.6 HARD/)
const cache=await caches.open(`c2offline-${location.origin}/1.9.6 HARD/`);

const offline=[
	"mods.js",
	"mods.json",
];
for(const src of offline){
	const response=await fetch(src);
	await cache.put(src,response);
};

// Check if mods are enabled previously and create info
let list=``;
for(const mod of mods){
	let checked="";
	if(install.includes(mod.script)) checked="checked";
	if(mod.description=="") mod.description="&nbsp;"
	list+=/*html*/`
		<label>
			<div><span class="mod_name">${mod.name}</span><span class="version"> ver.${mod.version}</span> <span class="description">${mod.description}</span></div>
			<input type="checkbox" data-mod="${mod.script}" ${checked}>
			<mark></mark>
		</label>
	`;
	const response=await fetch(`./mods/${mod.script}.js`);
	await cache.put(`mods/${mod.script}.js`,response);
};

// Create window
const div=document.createElement("div");
div.id="mods";
div.innerHTML=/*html*/`
	<div class="content">
		<p class = "title">Danh sách MODS:<br>
		</p>
		<div class="list">
			${list}
		</div>
		<a class="start">START</a>
	</div>
`;
div.querySelector(".start").addEventListener("pointerup",start);
document.body.append(div);
console.log("mod.js is loaded");

// Wait until START button is pressed, then load the mods
// Some mods require c2runtime.js to be in same mods' directory
async function start(){
	install=[];
	document.querySelectorAll("#mods input[data-mod]").forEach(function(e){
		if(e.checked){
			const mod=e.getAttribute("data-mod");
			install.push(mod);
		}
	});
	div.remove();
	style.remove();

	for(const mod of mods){
		if(!install.includes(mod.script)) continue;
		const e=(await import(`./mods/${mod.script}.js`));
		if(e.install) await e.install();
	}

	localStorage.setItem("mods",JSON.stringify(install));
	console.log(install);

	// Start the game
	// Create new runtime using the c2canvas
	window.c2runtime=cr_createRuntime("c2canvas");
	
	// Pause and resume on page becoming visible/invisible
	function onVisibilityChanged() {
		if (document.hidden || document.mozHidden || document.webkitHidden || document.msHidden)
			cr_setSuspended(true);
		else
			cr_setSuspended(false);
	}
	
	document.addEventListener("visibilitychange", onVisibilityChanged, false);
	document.addEventListener("mozvisibilitychange", onVisibilityChanged, false);
	document.addEventListener("webkitvisibilitychange", onVisibilityChanged, false);
	document.addEventListener("msvisibilitychange", onVisibilityChanged, false);
	
	function OnRegisterSWError(e)
	{
		console.warn("Failed to register service worker: ", e);
	}
	
	// Runtime calls this global method when ready to start caching (i.e. after startup).
	// This registers the service worker which caches resources for offline support.
	window.C2_RegisterSW = function C2_RegisterSW()
	{
		if (!navigator.serviceWorker)
			return;		// no SW support, ignore call
		
		try {
			navigator.serviceWorker.register("sw.js", { scope: "./" })
			.then(function (reg)
			{
				console.log("Registered service worker on " + reg.scope);
			})
			.catch(OnRegisterSWError);
		}
		catch (e)
		{
			OnRegisterSWError(e);
		}
	}
}