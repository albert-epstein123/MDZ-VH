(function() {
	var extList = ["mdz_lighting", "mdz_shader_menu"];
	extList.forEach(function(src) {
		var loadScript = document.createElement('script');
		loadScript.src = `./mods/${src}.js`
		document.body.appendChild(loadScript); 
	});
})();