// Quicksave/load
// Made by Dungx 
// Save/load code of cplusplusnoob
// Ytb: https://www.youtube.com/@cplusplusnoob-g3h

(function() {
	window.addEventListener("load", function() {
		window.manualSave = function(name="manualSave1") {
			var runtime = cr_getC2Runtime();
			runtime.DF();
			createFloatingText("Đã lưu !", 2000);
		};

		window.manualLoad = function(name="manualSave1") {
			var runtime = cr_getC2Runtime();
			runtime.DF();
			createFloatingText("Đang tải...", 1000);
		};
		console.log("c2injt loaded !");
	});

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
	var script = document.createElement('script');
	script.src = "./mods/c2injt.js";
	document.body.appendChild(script); 
})();