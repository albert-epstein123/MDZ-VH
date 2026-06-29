// C2injt Extension Loader
// Cre: Dungx
// Required to load extension for inject Tool script

(function() {
	let displayText = ``
	let extList = []
	for (const mod of mods) {
		if (mod.extension == "c2injt" && install.includes(mod.script)) {
			extList.push(mod.script);
			displayText += ", "+mod.name
		}
	};
	extList.push("c2injt");
	if (extList.length == 1) console.log("No extension is loaded!");
	extList.forEach(function(src) {
		var loadScript = document.createElement('script');
		loadScript.src = `./mods/${src}.js`
		document.body.appendChild(loadScript); 
	});
 	var style = document.createElement('style');
	style.innerHTML = `
		#mod-loaded-notif {
			position: fixed;
			top: 20px;
			left: -300px;
			opacity: 0;
			background-color: #040A18; 
			color: #00FFFF; 
			padding: 12px 20px;
			
			font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			font-size: 16px;
			font-weight: 800; 
			text-transform: uppercase;
			border-left: 5px solid #00FFFF;
			box-shadow: 0px 4px 15px rgba(0, 255, 255, 0.2);
			z-index: 999999; 
			pointer-events: none; 
			
			animation: slideFadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
		}
		.notif-subtext {
			display: block;
			font-size: 11px;
			font-weight: 400; 
			color: rgba(0, 255, 255, 0.7); 
			margin-top: 4px;
			text-transform: none; 
		}
		
		@keyframes slideFadeIn {
			0% { left: -300px; opacity: 0; }
			100% { left: 20px; opacity: 1; }
		}

		.notif-fade-out {
			animation: fadeOut 0.5s ease-in forwards !important;
		}

		@keyframes fadeOut {
			0% { opacity: 1; left: 20px; }
			100% { opacity: 0; left: 20px; }
		}
	`;
	document.head.appendChild(style);
	extList = extList.pop()
	var notif = document.createElement('div');
	notif.id = "mod-loaded-notif";
	notif.innerHTML = `ROCK AND ROLL<span class='notif-subtext'>Loaded: ${displayText}.</span>`;
	document.body.appendChild(notif);
	setTimeout(function() {
		notif.classList.add('notif-fade-out');
		setTimeout(function() {
			notif.remove();
		}, 500);
	}, 3000);
})();
