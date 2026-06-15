// Quicksave/load
// Made by Dungx 
// Save/load code of cplusplusnoob
// Ytb: https://www.youtube.com/@cplusplusnoob-g3h
// Note: This script is a extension of c2injt script

(function() {
	window.manualSave = function(name="manualSave1") {
		var runtime = cr_getC2Runtime();
		runtime.Np = name;
		runtime.DF();
		createFloatingText("Saved !", 2000);
	};
	window.manualLoad = function(name="manualSave1") {
		var runtime = cr_getC2Runtime();
		runtime.Kl = name;
		runtime.DF();
		createFloatingText("Loading...", 1000);
	};

	console.log("quicksave_load.js is loaded!");
	function createFloatingText(message, duration) { 
		const popup = document.createElement("div");
		popup.textContent = message;
		popup.style.cssText = `
			position: fixed;
			top: 10%;
			left: 50%;
			transform: translateX(-50%);
			background: rgb(90, 90, 90);
			color: #fff;
			padding: 14px 28px;
			font-family: monospace;
			border-radius: 8px;
			font-size: 15px;
			opacity: 0;
			transition: opacity 0.4s ease;
			pointer-events: none;
			z-index: 9999;
		`;
		document.body.appendChild(popup);

		// Fade in
		requestAnimationFrame(() => {
			popup.style.opacity = "1";
		});

		// Fade out then remove
		setTimeout(() => {
			popup.style.opacity = "0";
			popup.addEventListener("transitionend", () => popup.remove());
		}, duration);
	};
})();