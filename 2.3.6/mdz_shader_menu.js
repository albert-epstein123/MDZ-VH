// ============================================================
// MDZ SHADER MENU - "Video Settings" in the game's own Options screen.
//
// Adds one native menu row (the game's own wooden plate and caption, cloned
// from the Sounds row) directly above "Sounds". Pressing it opens a panel with
// every setting of mdz_lighting.js: on/off, presets, the sliders, quality,
// weather, preview hour, plus credits.
//
// In game, while the shader is on, the pause menu (gear button) gets the same
// row under "Map: ...": it closes that menu (by tapping its own Resume) and
// opens the settings docked at the side, so the changes show live.
//
// Stand-alone: needs only c2runtime.js and mdz_lighting.js, and reads the
// 2.3.3 runtime through its minified names (with the readable names as a
// fallback), so it works without the multiplayer mod or the toolkit.
//
// Load it BEFORE mdz_lighting.js: it sets the lighting mod's defaults, and the
// fresh profiles start with shaders OFF; multiplayer can require server-controlled LOS.
// ============================================================
(function () {
    'use strict';
    if (window.MDZShaderMenu) return;
    if (/[?&]dedicated=1(?:&|$)/.test(location.search) && /[?&]render=0(?:&|$)/.test(location.search)) return;
    // index.html?nomods=1 is the stock game for the test tools (like the lighting mod)
    try { if (/[?&]nomods=1(&|$)/.test(location.search) && !window.MDZ_LIGHTING_FORCE) return; } catch (e) {}
    // The multiplayer build sets this: its Options screen row belongs to
    // DebugHost, so there is only the in-game row - always shown there (it is
    // the way to switch the shader on) - and the lighting keeps its own defaults.
    const INGAME_ONLY = !!window.MDZ_SHADER_MENU_INGAME_ONLY;

    // The shader is off until the player switches it on (the choice is saved
    // by mdz_lighting.js itself).
    if (!INGAME_ONLY) window.MDZ_LIGHTING_DEFAULTS = Object.assign({ enabled: false }, window.MDZ_LIGHTING_DEFAULTS || {});

    const DISCORD_URL = 'https://discord.gg/8XcqDRDQeQ';
    const CREDIT_NAME = '@Civert0';
    const PLATE_TYPE = 't630';                             // wooden menu plate
    const LABEL_TYPES = ['t415', 't1056', 't224', 't282']; // menu captions
    const SOUNDS_ID = 17;          // plate id (var 0) of "Sounds: ON/OFF" in Options
    const OUR_ID = 909094;         // our plate's id: matches no menu action
    const DEBUG_HOST_ID = 909093;  // the multiplayer mod's DebugHost row, if present
    // In-game pause menu (gear button), plate ids read live from 2.3.3:
    // Main-menu 66, Sounds 4, Movement 6, Map 7, Resume 3. Map and Resume
    // are a row and a bit apart - our row goes in that gap.
    const GAME_MAP_ID = 7, GAME_RESUME_ID = 3;
    const BOARD_TYPE = 't438';     // the wooden board behind that menu
    const PANEL_ID = 'mdz-shader-panel', STYLE_ID = 'mdz-shader-style', HITBOX_ID = 'mdz-shader-hitbox';

    // ---------------------------------------------------------------
    // Text, in the game's own languages (the "Language" global)
    // ---------------------------------------------------------------
    const KEYS = ["title","shader","on","off","offHint","preset","presetPick","cinematic","balanced","subtle","performance","strength","shadows","wind","lamps","water","fog","rays","vignette","grain","pool","hour","game","quality","qLow","qMed","qHigh","auto","autoTip","weather","strike","reset","credits","discord","missing","close","fireflies","shine","fps","fpsOff","extreme","fogMode","fogBoth","fogGround","fogTop","flySize","flyPixel","cleanShadows","glow","snowfall","frost","footprints","snowCover","leaves","detected","raysMode","raysObjects","raysStatic","showFps","warnHigh","thisDevice","keep","goBack","ao","aberration","menuSaver","share","copyCode","applyCode","copied","applied","badCode","secLight","secNature","secSnow","secReset","tip","gotIt","nvg","secVision","vision","visionDark","visionRange","visionHide","custom"];
    const L10N = {
  "EN": [
    "Video Settings",
    "Shader",
    "ON",
    "OFF",
    "Off: the game looks exactly as normal.",
    "Preset",
    "Choose a look…",
    "Cinematic",
    "Balanced",
    "Subtle",
    "Performance",
    "Strength",
    "Shadows",
    "Wind",
    "Fire Lights",
    "Water",
    "Fog",
    "Light Shafts",
    "Vignette",
    "Grain",
    "Player Light",
    "Preview Hour",
    "Game",
    "Quality",
    "Low",
    "Medium",
    "High",
    "Auto",
    "Lower the quality by itself when the game runs slow",
    "Weather: rain fog, wet ground, lightning",
    "Strike",
    "Reset",
    "Shader by",
    "Join my Discord",
    "Shader file missing (mdz_lighting.js)",
    "Close",
    "Fireflies",
    "Object Shine",
    "FPS Limit",
    "Unlimited",
    "Extreme",
    "Fog Style",
    "Both",
    "Object-aware",
    "Classic (on top)",
    "Firefly Size",
    "Pixel fireflies",
    "Replace painted shadows",
    "Glow",
    "Snowfall",
    "Frost & Breath",
    "Footprints (snow, sand, mud)",
    "Snow on trees, cars, roofs",
    "Falling Leaves",
    "Detected",
    "Shaft Style",
    "Object-aware",
    "Static (original)",
    "Show FPS",
    "The highest setting uses the most graphics power: the phone can heat up and the battery drains faster. Best for flagship phones.",
    "This device",
    "Keep",
    "Go back",
    "Contact Shadows",
    "Hit & Low Blood",
    "Battery saver: 30 FPS in menus",
    "Share",
    "Copy code",
    "Apply",
    "Code copied",
    "Settings applied",
    "Not a valid code",
    "Lighting",
    "Weather & Nature",
    "Snow",
    "Reset",
    "Video Settings is in the game menu: tap ⚙ (top right), then Video Settings.",
    "Got it",
    "Night Vision",
    "Line of Sight",
    "Walls block your view",
    "Darkness",
    "View Range",
    "Hide what you can't see",
    "Custom"
  ],
  "RU": [
    "Настройки видео",
    "Шейдер",
    "ВКЛ",
    "ВЫКЛ",
    "Выключен: игра выглядит как обычно.",
    "Пресет",
    "Выбрать стиль…",
    "Кино",
    "Баланс",
    "Мягкий",
    "Производительность",
    "Сила",
    "Тени",
    "Ветер",
    "Свет огня",
    "Вода",
    "Туман",
    "Лучи света",
    "Виньетка",
    "Зернистость",
    "Свет у игрока",
    "Час (превью)",
    "Игра",
    "Качество",
    "Низкое",
    "Среднее",
    "Высокое",
    "Авто",
    "Снижать качество, когда игра тормозит",
    "Погода: туман, мокрая земля, молнии",
    "Молния",
    "Сброс",
    "Шейдер:",
    "Мой Discord",
    "Файл шейдера не найден (mdz_lighting.js)",
    "Закрыть",
    "Светлячки",
    "Блики",
    "Лимит FPS",
    "Без лимита",
    "Экстрим",
    "Стиль тумана",
    "Оба",
    "Под объектами",
    "Классический (сверху)",
    "Размер светлячков",
    "Пиксельные светлячки",
    "Заменить нарисованные тени",
    "Свечение",
    "Снегопад",
    "Иней и дыхание",
    "Следы (снег, песок, грязь)",
    "Снег на деревьях, машинах, крышах",
    "Листопад",
    "Определено",
    "Стиль лучей",
    "С учётом объектов",
    "Статичные (исходные)",
    "Показывать FPS",
    "Максимальная настройка сильнее всего нагружает графику: телефон может нагреваться, а батарея — быстрее садиться. Лучше для флагманов.",
    "Это устройство",
    "Оставить",
    "Назад",
    "Контактные тени",
    "Удар и мало крови",
    "Экономия батареи: 30 FPS в меню",
    "Поделиться",
    "Копировать код",
    "Применить",
    "Код скопирован",
    "Настройки применены",
    "Неверный код",
    "Освещение",
    "Погода и природа",
    "Снег",
    "Сброс",
    "Настройки видео — в игровом меню: нажми ⚙ (справа вверху), затем «Настройки видео».",
    "Понятно",
    "Ночное видение",
    "Прямая видимость",
    "Стены закрывают обзор",
    "Затемнение",
    "Дальность обзора",
    "Скрывать то, чего не видно",
    "Пользовательский"
  ],
  "DE": [
    "Videoeinstellungen",
    "Shader",
    "AN",
    "AUS",
    "Aus: Das Spiel sieht ganz normal aus.",
    "Voreinstellung",
    "Stil wählen…",
    "Kino",
    "Ausgewogen",
    "Dezent",
    "Leistung",
    "Stärke",
    "Schatten",
    "Wind",
    "Feuerlicht",
    "Wasser",
    "Nebel",
    "Lichtstrahlen",
    "Vignette",
    "Körnung",
    "Spielerlicht",
    "Vorschau-Uhrzeit",
    "Spiel",
    "Qualität",
    "Niedrig",
    "Mittel",
    "Hoch",
    "Auto",
    "Qualität automatisch senken, wenn das Spiel ruckelt",
    "Wetter: Regennebel, nasser Boden, Blitze",
    "Blitz",
    "Zurücksetzen",
    "Shader von",
    "Mein Discord",
    "Shader-Datei fehlt (mdz_lighting.js)",
    "Schließen",
    "Glühwürmchen",
    "Glanz",
    "FPS-Limit",
    "Unbegrenzt",
    "Extrem",
    "Nebelstil",
    "Beide",
    "Unter Objekten",
    "Klassisch (oben)",
    "Glühwürmchen-Größe",
    "Pixel-Glühwürmchen",
    "Gemalte Schatten ersetzen",
    "Leuchten",
    "Schneefall",
    "Frost & Atem",
    "Fußspuren (Schnee, Sand, Schlamm)",
    "Schnee auf Bäumen, Autos, Dächern",
    "Fallendes Laub",
    "Erkannt",
    "Strahlenstil",
    "Objektbezogen",
    "Statisch (original)",
    "FPS anzeigen",
    "Die höchste Stufe braucht die meiste Grafikleistung: Das Handy kann warm werden und der Akku schneller leer sein. Am besten für Flaggschiff-Handys.",
    "Dieses Gerät",
    "Behalten",
    "Zurück",
    "Kontaktschatten",
    "Treffer & wenig Blut",
    "Akku sparen: 30 FPS in Menüs",
    "Teilen",
    "Code kopieren",
    "Anwenden",
    "Code kopiert",
    "Einstellungen übernommen",
    "Kein gültiger Code",
    "Licht",
    "Wetter & Natur",
    "Schnee",
    "Zurücksetzen",
    "Die Videoeinstellungen sind im Spielmenü: Tippe auf ⚙ (oben rechts), dann auf Videoeinstellungen.",
    "Verstanden",
    "Nachtsicht",
    "Sichtlinie",
    "Wände versperren die Sicht",
    "Dunkelheit",
    "Sichtweite",
    "Verbergen, was du nicht siehst",
    "Benutzerdefiniert"
  ],
  "ES": [
    "Ajustes de vídeo",
    "Shader",
    "SÍ",
    "NO",
    "Apagado: el juego se ve como siempre.",
    "Preajuste",
    "Elegir estilo…",
    "Cinemático",
    "Equilibrado",
    "Sutil",
    "Rendimiento",
    "Fuerza",
    "Sombras",
    "Viento",
    "Luz de fuego",
    "Agua",
    "Niebla",
    "Rayos de luz",
    "Viñeta",
    "Grano",
    "Luz del jugador",
    "Hora de vista previa",
    "Juego",
    "Calidad",
    "Baja",
    "Media",
    "Alta",
    "Auto",
    "Bajar la calidad sola cuando el juego va lento",
    "Clima: niebla, suelo mojado, rayos",
    "Rayo",
    "Restablecer",
    "Shader por",
    "Únete a mi Discord",
    "Falta el archivo del shader (mdz_lighting.js)",
    "Cerrar",
    "Luciérnagas",
    "Brillos",
    "Límite FPS",
    "Sin límite",
    "Extremo",
    "Estilo de niebla",
    "Ambas",
    "Bajo los objetos",
    "Clásica (encima)",
    "Tamaño de luciérnagas",
    "Luciérnagas pixeladas",
    "Reemplazar sombras pintadas",
    "Resplandor",
    "Nevada",
    "Escarcha y aliento",
    "Huellas (nieve, arena, barro)",
    "Nieve en árboles, coches, techos",
    "Hojas que caen",
    "Detectado",
    "Estilo de rayos",
    "Según objetos",
    "Estáticos (original)",
    "Mostrar FPS",
    "El ajuste más alto usa la mayor potencia gráfica: el teléfono puede calentarse y la batería gastarse más rápido. Ideal para teléfonos de gama alta.",
    "Este dispositivo",
    "Mantener",
    "Volver",
    "Sombras de contacto",
    "Golpe y poca sangre",
    "Ahorro de batería: 30 FPS en menús",
    "Compartir",
    "Copiar código",
    "Aplicar",
    "Código copiado",
    "Ajustes aplicados",
    "Código no válido",
    "Iluminación",
    "Clima y naturaleza",
    "Nieve",
    "Restablecer",
    "Los ajustes de vídeo están en el menú del juego: toca ⚙ (arriba a la derecha) y luego Ajustes de vídeo.",
    "Entendido",
    "Visión nocturna",
    "Línea de visión",
    "Las paredes tapan la vista",
    "Oscuridad",
    "Alcance de visión",
    "Ocultar lo que no ves",
    "personalizado"
  ],
  "FR": [
    "Paramètres vidéo",
    "Shader",
    "OUI",
    "NON",
    "Désactivé : le jeu garde son aspect normal.",
    "Préréglage",
    "Choisir un style…",
    "Cinéma",
    "Équilibré",
    "Discret",
    "Performance",
    "Intensité",
    "Ombres",
    "Vent",
    "Lumière du feu",
    "Eau",
    "Brouillard",
    "Rayons de lumière",
    "Vignette",
    "Grain",
    "Lumière du joueur",
    "Heure d'aperçu",
    "Jeu",
    "Qualité",
    "Basse",
    "Moyenne",
    "Haute",
    "Auto",
    "Baisser la qualité quand le jeu ralentit",
    "Météo : brouillard, sol mouillé, éclairs",
    "Éclair",
    "Réinitialiser",
    "Shader par",
    "Rejoins mon Discord",
    "Fichier du shader introuvable (mdz_lighting.js)",
    "Fermer",
    "Lucioles",
    "Reflets",
    "Limite FPS",
    "Illimité",
    "Extrême",
    "Style de brouillard",
    "Les deux",
    "Sous les objets",
    "Classique (au-dessus)",
    "Taille des lucioles",
    "Lucioles pixel",
    "Remplacer les ombres peintes",
    "Lueur",
    "Chute de neige",
    "Givre et souffle",
    "Traces (neige, sable, boue)",
    "Neige sur arbres, voitures, toits",
    "Feuilles qui tombent",
    "Détecté",
    "Style des rayons",
    "Selon les objets",
    "Statiques (original)",
    "Afficher les FPS",
    "Le réglage le plus élevé utilise le plus de puissance graphique : le téléphone peut chauffer et la batterie se vider plus vite. Idéal pour les téléphones haut de gamme.",
    "Cet appareil",
    "Garder",
    "Retour",
    "Ombres de contact",
    "Coup et peu de sang",
    "Économie de batterie : 30 FPS dans les menus",
    "Partager",
    "Copier le code",
    "Appliquer",
    "Code copié",
    "Réglages appliqués",
    "Code invalide",
    "Éclairage",
    "Météo et nature",
    "Neige",
    "Réinitialiser",
    "Les paramètres vidéo sont dans le menu du jeu : touche ⚙ (en haut à droite), puis Paramètres vidéo.",
    "Compris",
    "Vision nocturne",
    "Ligne de vue",
    "Les murs bloquent la vue",
    "Obscurité",
    "Portée de vue",
    "Cacher ce que tu ne vois pas",
    "Personnalisé"
  ],
  "IT": [
    "Impostazioni video",
    "Shader",
    "ON",
    "OFF",
    "Spento: il gioco ha il suo aspetto normale.",
    "Preimpostazione",
    "Scegli uno stile…",
    "Cinematografico",
    "Bilanciato",
    "Leggero",
    "Prestazioni",
    "Intensità",
    "Ombre",
    "Vento",
    "Luce del fuoco",
    "Acqua",
    "Nebbia",
    "Raggi di luce",
    "Vignettatura",
    "Grana",
    "Luce del giocatore",
    "Ora di anteprima",
    "Gioco",
    "Qualità",
    "Bassa",
    "Media",
    "Alta",
    "Auto",
    "Abbassa la qualità da solo quando il gioco rallenta",
    "Meteo: nebbia, terreno bagnato, fulmini",
    "Fulmine",
    "Ripristina",
    "Shader di",
    "Entra nel mio Discord",
    "File dello shader mancante (mdz_lighting.js)",
    "Chiudi",
    "Lucciole",
    "Riflessi",
    "Limite FPS",
    "Illimitato",
    "Estremo",
    "Stile nebbia",
    "Entrambe",
    "Sotto gli oggetti",
    "Classica (sopra)",
    "Dimensione lucciole",
    "Lucciole pixel",
    "Sostituisci ombre dipinte",
    "Bagliore",
    "Nevicata",
    "Brina e respiro",
    "Impronte (neve, sabbia, fango)",
    "Neve su alberi, auto, tetti",
    "Foglie cadenti",
    "Rilevato",
    "Stile raggi",
    "In base agli oggetti",
    "Statici (originali)",
    "Mostra FPS",
    "L'impostazione più alta usa più potenza grafica: il telefono può scaldarsi e la batteria scaricarsi prima. Ideale per i telefoni di fascia alta.",
    "Questo dispositivo",
    "Mantieni",
    "Indietro",
    "Ombre di contatto",
    "Colpo e poco sangue",
    "Risparmio batteria: 30 FPS nei menu",
    "Condividi",
    "Copia codice",
    "Applica",
    "Codice copiato",
    "Impostazioni applicate",
    "Codice non valido",
    "Illuminazione",
    "Meteo e natura",
    "Neve",
    "Ripristina",
    "Le impostazioni video sono nel menu di gioco: tocca ⚙ (in alto a destra), poi Impostazioni video.",
    "Ho capito",
    "Visione notturna",
    "Linea di vista",
    "I muri bloccano la vista",
    "Oscurità",
    "Raggio visivo",
    "Nascondi ciò che non vedi",
    "Personalizzato"
  ],
  "CZ": [
    "Nastavení videa",
    "Shader",
    "ZAP",
    "VYP",
    "Vypnuto: hra vypadá jako obvykle.",
    "Předvolba",
    "Vybrat styl…",
    "Filmový",
    "Vyvážený",
    "Jemný",
    "Výkon",
    "Síla",
    "Stíny",
    "Vítr",
    "Světlo ohně",
    "Voda",
    "Mlha",
    "Paprsky světla",
    "Vinětace",
    "Zrno",
    "Světlo hráče",
    "Náhled hodiny",
    "Hra",
    "Kvalita",
    "Nízká",
    "Střední",
    "Vysoká",
    "Auto",
    "Snížit kvalitu, když hra seká",
    "Počasí: mlha, mokrá zem, blesky",
    "Blesk",
    "Obnovit",
    "Shader od",
    "Připoj se na můj Discord",
    "Chybí soubor shaderu (mdz_lighting.js)",
    "Zavřít",
    "Světlušky",
    "Lesk",
    "Limit FPS",
    "Bez limitu",
    "Extrémní",
    "Styl mlhy",
    "Obojí",
    "Pod objekty",
    "Klasická (navrchu)",
    "Velikost světlušek",
    "Pixelové světlušky",
    "Nahradit malované stíny",
    "Záře",
    "Sněžení",
    "Mráz a dech",
    "Stopy (sníh, písek, bláto)",
    "Sníh na stromech, autech, střechách",
    "Padající listí",
    "Zjištěno",
    "Styl paprsků",
    "Podle objektů",
    "Statické (původní)",
    "Zobrazit FPS",
    "Nejvyšší nastavení nejvíc zatěžuje grafiku: telefon se může zahřívat a baterie rychleji vybíjet. Nejlepší pro vlajkové telefony.",
    "Toto zařízení",
    "Ponechat",
    "Zpět",
    "Kontaktní stíny",
    "Zásah a málo krve",
    "Úspora baterie: 30 FPS v menu",
    "Sdílet",
    "Kopírovat kód",
    "Použít",
    "Kód zkopírován",
    "Nastavení použito",
    "Neplatný kód",
    "Osvětlení",
    "Počasí a příroda",
    "Sníh",
    "Obnovit",
    "Nastavení videa najdeš v herním menu: klepni na ⚙ (vpravo nahoře) a pak na Nastavení videa.",
    "Rozumím",
    "Noční vidění",
    "Přímá viditelnost",
    "Zdi blokují výhled",
    "Tma",
    "Dohled",
    "Skrýt, co nevidíš",
    "Vlastní"
  ],
  "PT": [
    "Configurações de vídeo",
    "Shader",
    "LIG",
    "DESL",
    "Desligado: o jogo fica com o visual normal.",
    "Predefinição",
    "Escolher estilo…",
    "Cinematográfico",
    "Equilibrado",
    "Sutil",
    "Desempenho",
    "Força",
    "Sombras",
    "Vento",
    "Luz do fogo",
    "Água",
    "Névoa",
    "Raios de luz",
    "Vinheta",
    "Granulação",
    "Luz do jogador",
    "Hora de prévia",
    "Jogo",
    "Qualidade",
    "Baixa",
    "Média",
    "Alta",
    "Auto",
    "Baixar a qualidade sozinho quando o jogo fica lento",
    "Clima: névoa, chão molhado, raios",
    "Raio",
    "Redefinir",
    "Shader por",
    "Entre no meu Discord",
    "Arquivo do shader não encontrado (mdz_lighting.js)",
    "Fechar",
    "Vaga-lumes",
    "Brilhos",
    "Limite FPS",
    "Sem limite",
    "Extremo",
    "Estilo da névoa",
    "Ambas",
    "Sob os objetos",
    "Clássica (por cima)",
    "Tamanho dos vaga-lumes",
    "Vaga-lumes pixelados",
    "Substituir sombras pintadas",
    "Brilho",
    "Nevasca",
    "Geada e respiração",
    "Pegadas (neve, areia, lama)",
    "Neve em árvores, carros, telhados",
    "Folhas caindo",
    "Detectado",
    "Estilo dos raios",
    "Conforme objetos",
    "Estáticos (original)",
    "Mostrar FPS",
    "A configuração mais alta usa a maior potência gráfica: o celular pode esquentar e a bateria acabar mais rápido. Ideal para celulares topo de linha.",
    "Este dispositivo",
    "Manter",
    "Voltar",
    "Sombras de contato",
    "Golpe e pouco sangue",
    "Economia de bateria: 30 FPS nos menus",
    "Compartilhar",
    "Copiar código",
    "Aplicar",
    "Código copiado",
    "Configurações aplicadas",
    "Código inválido",
    "Iluminação",
    "Clima e natureza",
    "Neve",
    "Redefinir",
    "As configurações de vídeo ficam no menu do jogo: toque em ⚙ (canto superior direito) e depois em Configurações de vídeo.",
    "Entendi",
    "Visão noturna",
    "Linha de visão",
    "Paredes bloqueiam a visão",
    "Escuridão",
    "Alcance de visão",
    "Ocultar o que você não vê",
    "Personalizado"
  ],
  "VI": [
	"Cài đặt Shader",	
	"Shader",	
	"BẬT",	
	"TẮT",	
	"Tắt: Hình ảnh thị như bình thường.",	
	"Cấu hình",	
	"Chọn cấu hình…",	
	"Tuyết đối điện ảnh",	
	"Cân bằng",	
	"Tinh tế",	
	"Chế độ nhanh",	
	"Cường độ",	
	"Bóng đổ",	
	"Gió",	
	"Ánh sáng lửa",	
	"Nước",	
	"Sương mù",	
	"Luồng sáng",	
	"H.ứng tối góc",	
	"Nhiễu hạt",	
	"Ánh sáng nhân vật",	
	"Chỉnh giờ xem trước",	
	"Game",	
	"Chất lượng",	
	"Thấp",	
	"Trung",	
	"Cao",	
	"Tự động",	
	"Tự động giảm chất lượng khi lag",	
	"Thời tiết: mưa, sương mù, đất ướt, sét",	
	"ĐÁNH SÉT",	
	"RESET",	
	"Làm bởi",	
	"VÀO DIS ĐI",	
	"Thiếu tệp shader (mdz_lighting.js)",	
	"Đóng",	
	"Đom đóm",	
	"Độ bóng vật thể",	
	"Giới hạn FPS",	
	"Không giới hạn",	
	"RAYTRAYCING RTX PRO 6000 CMMR",	
	"Kiểu sương mù",	
	"Cả hai",	
	"Theo vật thể",	
	"Cổ điển (lớp trên cùng)",	
	"Kích thước đom đóm",	
	"Đom đóm Pixel",	
	"Thay thế bóng đổ vẽ sẵn",	
	"Phát sáng",	
	"Tuyết rơi",	
	"Băng giá & Hơi thở",	
	"Dấu chân (tuyết, cát, bùn)",	
	"Tuyết trên cây, xe, mái nhà",	
	"Lá rơi",	
	"Đã phát hiện",	
	"Kiểu luồng sáng",	
	"Theo vật thể",	
	"Tĩnh (gốc)",	
	"Hiển thị FPS",	
	"Cấu hình này rất ngốn điện, tài nguyên của card. Chỉ phù hợp nhất cho dòng flagship.",	
	"Chipset: ",	
	"VẪN CHIẾN",	
	"HỦY",	
	"Bóng tiếp xúc",	
	"Đòn đánh & Máu",	
	"Chế độ tiết kiệm pin: Tự động chỉnh 30 FPS trong menu",	
	"Chia sẻ",	
	"Copy mã",	
	"Áp dụng",	
	"Đã copy",	
	"Đã áp dụng",	
	"Sai mã",	
	"Ánh sáng",	
	"Thời tiết & Thiên nhiên",	
	"Tuyết",	
	"Đặt lại",	
	"Cài đặt Video nằm trong menu trò chơi",	
	"Đã hiểu",	
	"Nhìn đêm",	
	"Tầm nhìn",	
	"FOG-OF-WAR: Tầm nhìn bị giới hạn, tường sẽ chắn tầm nhìn",	
	"Bóng tối",	
	"Phạm vi tầm nhìn",
	"Ẩn những gì không thấy",
	"Tủy chỉnh"
  ]
};
    let lang = 'EN';
    const t = key => { const row = L10N[lang] || L10N.EN, i = KEYS.indexOf(key); return (row[i] !== undefined ? row[i] : L10N.EN[i]) || key; };
    function normalizeLang(code) {
        let c = String(code || '').trim().toUpperCase().split(/[-_]/)[0];
        if (c === 'CS') c = 'CZ';
        if (c === 'BR') c = 'PT';
        return L10N[c] ? c : null;
    }

    // ---------------------------------------------------------------
    // Runtime access (2.3.3 minified names first, readable as fallback)
    // ---------------------------------------------------------------
    const rt = () => { try { return typeof window.cr_getC2Runtime === 'function' ? window.cr_getC2Runtime() : null; } catch (e) { return null; } };
    const typesOf = r => r && (r.S || r.types_by_index) || [];
    const instancesOf = type => type && (type.q || type.instances) || [];
    const varsOf = i => i && (i.cc || i.instance_vars) || [];
    const layerOf = i => i && (i.C || i.layer) || null;
    // A new instance only joins its type's list on the next tick; until then
    // it waits in the runtime's create row (Ce).
    function isLive(i) {
        if (!i || !i.type) return false;
        if (instancesOf(i.type).indexOf(i) !== -1) return true;
        const r = rt(), pending = r && (r.Ce || r.createRow);
        return !!(pending && pending.indexOf && pending.indexOf(i) !== -1);
    }
    function bboxChanged(i) { try { (i.P || i.set_bbox_changed).call(i); } catch (e) {} }
    function redraw() { const r = rt(); if (r) { r.X = true; r.redraw = true; } }
    let typeCache = null, typeCacheRt = null;
    function typeByName(name) {
        const r = rt();
        if (!r) return null;
        if (typeCacheRt !== r) { typeCacheRt = r; typeCache = {}; }
        // only hits are kept: the runtime exists before its types are loaded
        if (!typeCache[name]) typeCache[name] = typesOf(r).find(x => x && x.name === name) || null;
        return typeCache[name];
    }
    function globalsList(r) {
        if (!r) return [];
        if (Array.isArray(r.all_global_vars)) return r.all_global_vars;
        for (const key of Object.keys(r)) {
            const a = r[key];
            if (Array.isArray(a) && a.length > 20 && a.every(v => v && typeof v.name === 'string' && Object.prototype.hasOwnProperty.call(v, 'data'))) return a;
        }
        return [];
    }
    let langVar = null, langVarRt = null;
    function readLang() {
        const r = rt();
        if (r && (langVarRt !== r || !langVar)) { langVarRt = r; langVar = globalsList(r).find(v => v.name === 'Language') || null; }
        return normalizeLang(langVar && langVar.data) || normalizeLang(navigator.language) || 'EN';
    }
    function createInstance(type, layer, x, y) {
        const r = rt(), fn = r && (r.Yn || r.createInstance);
        return fn ? fn.call(r, type, layer, x, y) : null;
    }
    function destroyInstance(inst) {
        const r = rt(), fn = r && (r.$e || r.DestroyInstance);
        try { if (fn && isLive(inst)) fn.call(r, inst); } catch (e) {}
    }
    const textOf = i => (i && typeof i.text === 'string') ? i.text : '';
    function setText(i, s) {
        if (!i || i.text === s) return;
        i.text = s; i.Xc = true; i.text_changed = true;
        redraw();
    }

    // ---------------------------------------------------------------
    // The native row
    // ---------------------------------------------------------------
    // Plates and their captions. A caption is drawn near the top of its plate,
    // so on a small screen the NEXT row's caption can be closer to a plate's
    // centre than its own. Every plate in the column votes with the offsets of
    // the captions around it; the offset they all share is the convention, and
    // the caption closest to it is this plate's own.
    function menuLabels() {
        const out = [];
        for (const name of LABEL_TYPES) for (const l of instancesOf(typeByName(name)))
            if (l && l.visible !== false && textOf(l).trim() && (!row || l !== row.label)) out.push(l);
        return out;
    }
    function captionFor(plate, column) {
        const labels = menuLabels(), votes = {};
        for (const p of [plate].concat(column)) {
            const reach = Math.max(20, Math.abs(p.height || 32));
            for (const l of labels) {
                if (Math.abs(l.x - p.x) > 40 || Math.abs(l.y - p.y) > reach) continue;
                const k = Math.round(l.y - p.y);
                votes[k] = (votes[k] || 0) + 1;
            }
        }
        let conv = null, best = 0;
        for (const k of Object.keys(votes)) if (votes[k] > best || (votes[k] === best && Math.abs(+k) < Math.abs(conv))) { best = votes[k]; conv = +k; }
        let pick = null, err = Infinity;
        for (const l of labels) {
            if (Math.abs(l.x - plate.x) > 40) continue;
            const e = conv === null ? Math.hypot(l.x - plate.x, l.y - plate.y) : Math.abs((l.y - plate.y) - conv);
            if (e < err && (conv === null || e <= 6)) { err = e; pick = l; }
        }
        return pick;
    }
    const shaderOn = () => { try { return !!(window.MDZLighting && window.MDZLighting.get().enabled); } catch (e) { return false; } };
    // Where our row goes:
    //  Options screen: one row above Sounds (above the DebugHost row when the
    //    multiplayer mod put one there), in the Sounds column.
    //  In-game menu (only while the shader is on): halfway between Map and
    //    Resume, when the game left room there.
    function findSlot() {
        const plates = instancesOf(typeByName(PLATE_TYPE)).filter(p => p && p.visible !== false && (!row || p !== row.plate));
        const byId = id => plates.find(p => Number(varsOf(p)[0]) === id);
        const sounds = byId(SOUNDS_ID);
        if (sounds && !INGAME_ONLY) {
            const column = plates.filter(p => p !== sounds && Math.abs(p.x - sounds.x) < 24);
            const label = captionFor(sounds, column);
            if (!label) return null;
            let spacing = Infinity;
            for (const p of column) { const d = Math.abs(p.y - sounds.y); if (d >= 24 && d <= 70) spacing = Math.min(spacing, d); }
            if (!isFinite(spacing)) spacing = 36;
            let y = sounds.y - spacing;
            for (let k = 0; k < 3 && column.some(p => Math.abs(p.y - y) < spacing * 0.5); k++) y -= spacing;
            return { kind: 'options', anchor: sounds, label, y };
        }
        const map = byId(GAME_MAP_ID), resume = byId(GAME_RESUME_ID);
        if (map && resume && Math.abs(map.x - resume.x) < 24 && resume.y > map.y) {
            const column = plates.filter(p => p !== map && Math.abs(p.x - map.x) < 24);
            let spacing = Infinity;
            for (const p of column) { const d = Math.abs(p.y - map.y); if (d >= 24 && d <= 100) spacing = Math.min(spacing, d); }
            if (!isFinite(spacing)) return null;
            const label = captionFor(map, column);
            const resumeLabel = captionFor(resume, column);
            if (!label || !resumeLabel) return null;
            // A full row at the menu's own spacing under Map; Resume (with its
            // caption) moves down by one row and the board behind the menu grows
            // by as much. Measured from where they were, so it never adds up.
            const y = map.y + spacing;
            if (column.some(p => p !== resume && Math.abs(p.y - y) < spacing * 0.5)) return null;
            if (origOf(resume).y - map.y < spacing * 1.2) return null;   // the game left no gap here
            let board = null;
            for (const b of instancesOf(typeByName(BOARD_TYPE)))
                if (b && b.visible !== false && layerOf(b) === layerOf(map) && Math.abs(b.x - map.x) < 24 &&
                    origOf(b).y - origOf(b).h / 2 < map.y && origOf(b).y + origOf(b).h / 2 > origOf(resume).y) { board = b; break; }
            return { kind: 'game', anchor: map, label, y, resume, resumeLabel, board, shift: spacing };
        }
        return null;
    }
    let row = null;   // { kind, plate, label, offX, offY, anchor, resume, moved }
    // Where the game put something before we moved it (keyed by instance and
    // uid: Construct recycles instance objects).
    const ORIG = new WeakMap();
    function origOf(i) {
        let o = ORIG.get(i);
        if (!o || o.uid !== i.uid) { o = { uid: i.uid, y: i.y, h: i.height }; ORIG.set(i, o); }
        return o;
    }
    function moveFromOrig(i, dy, dh) {
        const o = origOf(i), ny = o.y + dy, nh = o.h + (dh || 0);
        if (i.y !== ny || i.height !== nh) { i.y = ny; i.height = nh; bboxChanged(i); }
    }
    function putBack(list) {
        for (const i of list || []) if (i && isLive(i)) { const o = ORIG.get(i); if (o && o.uid === i.uid) { i.y = o.y; i.height = o.h; bboxChanged(i); } ORIG.delete(i); }
    }
    function copyLook(src, dst) {
        for (const k of ['width', 'height', 'opacity', 'hotspotX', 'hotspotY', 'blend_mode'])
            if (src[k] !== undefined) dst[k] = src[k];
        dst.visible = true;
    }
    // The same frame of the same animation as the Sounds plate (a new instance
    // starts on the type's first animation otherwise).
    function copySpriteFrame(src, dst) {
        for (const k of ['ab', 'Y', 'mc', '$n', 'cur_animation', 'cur_frame'])
            if (src[k] !== undefined) { try { dst[k] = src[k]; } catch (e) {} }
    }
    function copyTextLook(src, dst) {
        copyLook(src, dst);
        for (const k of ['font', 'color', 'Wf', 'Bg', 'kn', 'Il', 'lineHeight', 'ef', 'ej', 'characterSet', 'Sn', 'Pg'])
            if (src[k] !== undefined) dst[k] = src[k];
    }
    function destroyRow() {
        if (!row) return;
        const r = row; row = null;
        putBack(r.moved);
        for (const i of [r.label, r.plate]) { if (i) { i.visible = false; destroyInstance(i); } }
        redraw();
    }
    function buildRow(slot) {
        const src = slot.anchor, lab = slot.label;
        let plate = null, label = null;
        try {
            plate = createInstance(src.type, layerOf(src), src.x, slot.y);
            if (!plate) return false;
            copyLook(src, plate);
            copySpriteFrame(src, plate);
            const v = varsOf(plate);
            for (let i = 0; i < v.length; i++) v[i] = 0;
            if (v.length) v[0] = OUR_ID;   // a press that reaches the game does nothing
            const offX = lab.x - src.x, offY = lab.y - src.y;
            label = createInstance(lab.type, layerOf(lab), src.x + offX, slot.y + offY);
            if (!label) { destroyInstance(plate); return false; }
            copyTextLook(lab, label);
            setText(label, t('title'));
            row = { kind: slot.kind, plate, label, offX, offY, anchor: src, resume: slot.resume || null };
            redraw();
            return true;
        } catch (e) {
            if (!buildRow.warned) { buildRow.warned = true; console.warn('[MDZ Shader Menu] row:', e && e.message || e); }
            destroyInstance(label); destroyInstance(plate);
            row = null;
            return false;
        }
    }
    function syncRow(slot) {
        if (!slot) { destroyRow(); return; }
        if (!row || !isLive(row.plate) || !isLive(row.label) || row.anchor !== slot.anchor || row.kind !== slot.kind) {
            destroyRow();
            if (!buildRow(slot)) return;
        }
        const p = row.plate, l = row.label, a = slot.anchor;
        row.resume = slot.resume || null;
        if (slot.kind === 'game') {
            const moved = [slot.resume, slot.resumeLabel, slot.board].filter(Boolean);
            putBack((row.moved || []).filter(i => moved.indexOf(i) === -1));
            moveFromOrig(slot.resume, slot.shift);
            moveFromOrig(slot.resumeLabel, slot.shift);
            if (slot.board) moveFromOrig(slot.board, slot.shift / 2, slot.shift);
            row.moved = moved;
        }
        row.offX = slot.label.x - a.x; row.offY = slot.label.y - a.y;
        if (p.height !== a.height || p.width !== a.width) { p.height = a.height; p.width = a.width; bboxChanged(p); }
        if (p.x !== a.x || p.y !== slot.y) { p.x = a.x; p.y = slot.y; bboxChanged(p); }
        const lx = p.x + row.offX, ly = p.y + row.offY;
        if (l.x !== lx || l.y !== ly) { l.x = lx; l.y = ly; bboxChanged(l); }
        p.visible = l.visible = true;
        p.opacity = pressing ? 0.6 : a.opacity;
        l.opacity = a.opacity;
        setText(l, t('title'));
    }

    // ---------------------------------------------------------------
    // Pressing it: a see-through DOM button over the plate
    // ---------------------------------------------------------------
    // Construct listens for pointer, mouse and touch events on the document;
    // stopping them here keeps a press on our controls from also pressing
    // whatever game button is underneath.
    const SHIELD = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'mousedown', 'mouseup', 'mousemove',
        'click', 'dblclick', 'touchstart', 'touchend', 'touchmove', 'touchcancel', 'contextmenu', 'wheel'];
    function shield(el) { for (const ev of SHIELD) el.addEventListener(ev, e => e.stopPropagation(), false); }
    let hitbox = null, pressing = false;
    function ensureHitbox() {
        if (hitbox) return hitbox;
        hitbox = document.createElement('button');
        hitbox.id = HITBOX_ID;
        hitbox.type = 'button';
        hitbox.style.cssText = 'position:fixed;display:none;padding:0;margin:0;border:0;background:transparent;cursor:pointer;z-index:100040;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
        shield(hitbox);
        hitbox.addEventListener('pointerdown', () => { pressing = true; redraw(); });
        const up = () => { pressing = false; redraw(); };
        hitbox.addEventListener('pointerup', up);
        hitbox.addEventListener('pointercancel', up);
        hitbox.addEventListener('pointerleave', up);
        hitbox.addEventListener('click', e => {
            e.preventDefault(); pressing = false;
            if (row && row.kind === 'game') openFromGame(row.resume); else openPanel('menu');
        });
        document.body.appendChild(hitbox);
        return hitbox;
    }
    // A click on the canvas as the game sees a real one: pointer events for
    // its Touch plugin, mouse events for its Mouse plugin (jQuery, document).
    function tapCanvas(x, y, done) {
        const canvas = document.getElementById('c2canvas');
        if (!canvas) { if (done) done(); return; }
        const o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1 };
        const p = Object.assign({ pointerId: 9901, pointerType: 'mouse', isPrimary: true }, o);
        const fire = (Ctor, type, opts) => { try { canvas.dispatchEvent(new Ctor(type, opts)); } catch (e) {} };
        fire(PointerEvent, 'pointermove', Object.assign({}, p, { buttons: 0 }));
        fire(MouseEvent, 'mousemove', Object.assign({}, o, { buttons: 0 }));
        fire(PointerEvent, 'pointerdown', p);
        fire(MouseEvent, 'mousedown', o);
        // held for a few frames, so the event sheet sees the press
        setTimeout(() => {
            fire(PointerEvent, 'pointerup', Object.assign({}, p, { buttons: 0 }));
            fire(MouseEvent, 'mouseup', Object.assign({}, o, { buttons: 0 }));
            fire(MouseEvent, 'click', Object.assign({}, o, { buttons: 0 }));
            if (done) setTimeout(done, 60);
        }, 90);
    }
    // In-game row: the pause menu closes through its own Resume button (the
    // game unpauses and tidies up itself), then the settings dock at the side.
    function openFromGame(resume) {
        const box = resume && isLive(resume) ? screenBox(resume) : null;
        if (!box) { openPanel('side'); return; }
        if (hitbox) hitbox.style.display = 'none';
        tapCanvas(box.x, box.y, () => openPanel('side'));
    }
    // layer -> page coordinates, from the layer's own view and scale
    function screenBox(inst) {
        const layer = layerOf(inst), canvas = document.getElementById('c2canvas');
        if (!layer || !canvas || !canvas.width) return null;
        const z = typeof layer.Lc === 'function' ? layer.Lc() : (typeof layer.getScale === 'function' ? layer.getScale() : 1);
        const vl = layer.Ca !== undefined ? layer.Ca : layer.viewLeft, vr = layer.Ha !== undefined ? layer.Ha : layer.viewRight;
        const vt = layer.Da !== undefined ? layer.Da : layer.viewTop, vb = layer.Ga !== undefined ? layer.Ga : layer.viewBottom;
        if (![z, vl, vr, vt, vb].every(isFinite) || !z) return null;
        const rect = canvas.getBoundingClientRect(), sx = rect.width / canvas.width, sy = rect.height / canvas.height;
        const x = (inst.x - (vl + vr) / 2) * z + canvas.width / 2, y = (inst.y - (vt + vb) / 2) * z + canvas.height / 2;
        return { x: rect.left + x * sx, y: rect.top + y * sy, w: Math.abs(inst.width * z) * sx, h: Math.abs(inst.height * z) * sy };
    }
    function syncHitbox() {
        const hb = ensureHitbox();
        const box = row && (!panelOpen() || panelMode === 'side') ? screenBox(row.plate) : null;
        if (!box || !(box.w > 1) || !(box.h > 1)) { hb.style.display = 'none'; return; }
        hb.style.left = (box.x - box.w / 2) + 'px';
        hb.style.top = (box.y - box.h / 2) + 'px';
        hb.style.width = box.w + 'px';
        hb.style.height = box.h + 'px';
        hb.style.display = 'block';
        hb.title = t('title');
        hb.setAttribute('aria-label', t('title'));
    }

    // ---------------------------------------------------------------
    // The panel
    // ---------------------------------------------------------------
    // (sec: a section starts here - its title and its own Reset)
    const SLIDERS = [
        { key: 'strength', label: 'strength', min: 0, max: 1, step: 0.05, sec: 'light' },
        { key: 'shadows', label: 'shadows', min: 0, max: 2, step: 0.1 },
        { key: 'ao', label: 'ao', min: 0, max: 2, step: 0.1 },
        { key: 'lamps', label: 'lamps', min: 0, max: 2, step: 0.1 },
        { key: 'glow', label: 'glow', min: 0, max: 2, step: 0.1 },
        { key: 'shine', label: 'shine', min: 0, max: 2, step: 0.1 },
        { key: 'rays', label: 'rays', min: 0, max: 2, step: 0.1 },
        { key: 'light', label: 'pool', min: 0, max: 2, step: 0.1 },
        { key: 'vignette', label: 'vignette', min: 0, max: 2, step: 0.1 },
        { key: 'grain', label: 'grain', min: 0, max: 2, step: 0.1 },
        { key: 'aberration', label: 'aberration', min: 0, max: 2, step: 0.1 },
        { key: 'nvg', label: 'nvg', min: 0, max: 1, step: 0.05 },
        { key: 'wind', label: 'wind', min: 0, max: 4, step: 0.1, sec: 'nature' },
        { key: 'water', label: 'water', min: 0, max: 2, step: 0.1 },
        { key: 'fireflies', label: 'fireflies', min: 0, max: 2, step: 0.1 },
        { key: 'flySize', label: 'flySize', min: 0.3, max: 3, step: 0.1 },
        { key: 'leaves', label: 'leaves', min: 0, max: 2, step: 0.1 },
        { key: 'fog', label: 'fog', min: 0, max: 2, step: 0.1 },
        { key: 'snowfall', label: 'snowfall', min: 0, max: 2, step: 0.1, sec: 'snow' },
        { key: 'frost', label: 'frost', min: 0, max: 2, step: 0.1 }
    ];
    const SEC_TITLE = { light: 'secLight', nature: 'secNature', snow: 'secSnow' };
    const PRESETS = ['extreme', 'cinematic', 'balanced', 'subtle', 'performance'];
    function injectCss() {
        if (document.getElementById(STYLE_ID)) return;
        const P = '#' + PANEL_ID;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = [
            P + '{position:fixed;inset:0;z-index:100050;display:none;align-items:center;justify-content:center;padding:10px;background:rgba(0,0,0,.72);font-family:"Segoe UI","Times New Roman",serif;color:#e8e2d2;user-select:none;-webkit-user-select:none;}',
            P + '.open{display:flex;}',
            // docked at the side while playing: no backdrop, the game stays visible and playable
            P + '.side{background:transparent;pointer-events:none;justify-content:flex-end;align-items:stretch;padding:8px;}',
            P + '.side .sgShell{pointer-events:auto;width:min(360px,48vw);max-height:none;background:linear-gradient(rgba(22,19,16,.86),rgba(10,10,10,.92));}',
            P + '.side .sgHead{padding:8px 12px;}',
            P + '.side .sgTitle{font-size:18px;}',
            P + '.side .sgBody{padding:8px 12px 10px;flex:1;}',
            P + '.side .sgRow label,' + P + '.side .sgRow .sgLbl{width:96px;font-size:13px;}',
            P + '.side .sgVal{width:36px;}',
            P + '.side .sgMaster{padding:6px 10px;}',
            P + '.side .sgSwitch{min-width:72px;height:32px;font-size:14px;}',
            P + '.side .sgFoot{padding:6px 12px;}',
            P + ' *{box-sizing:border-box;}',
            P + ' .sgShell{width:min(560px,96vw);max-height:94vh;display:flex;flex-direction:column;position:relative;background:linear-gradient(rgba(22,19,16,.90),rgba(10,10,10,.96)),url("images/options_menu-sheet0.png") center/100% 100% no-repeat;border:1px solid #6f6250;box-shadow:0 0 0 2px #171411,0 20px 70px #000;}',
            P + ' .sgShell:before{content:"";position:absolute;inset:6px;pointer-events:none;border:1px solid rgba(178,154,118,.16);}',
            P + ' .sgHead{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(190,174,145,.22);background:rgba(8,8,8,.5);}',
            P + ' .sgTitle{font-size:22px;letter-spacing:1.5px;text-shadow:0 2px 2px #000;}',
            P + ' .sgClose{margin-left:auto;width:36px;height:36px;border:1px solid #574d41;background:rgba(0,0,0,.35);color:#bdb5a5;font-size:22px;line-height:1;cursor:pointer;}',
            P + ' .sgClose:hover{color:#fff;border-color:#9d3b35;background:#491b19;}',
            P + ' .sgBody{overflow:auto;padding:12px 16px 14px;touch-action:pan-y;-webkit-overflow-scrolling:touch;}',
            P + ' .sgBody::-webkit-scrollbar{width:8px;}',
            P + ' .sgBody::-webkit-scrollbar-thumb{background:#51493e;}',
            P + ' .sgMaster{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin-bottom:6px;background:rgba(0,0,0,.35);border:1px solid rgba(155,125,89,.35);}',
            P + ' .sgMaster span{font-size:17px;}',
            P + ' .sgSwitch{min-width:92px;height:38px;border:0;cursor:pointer;color:#f3ead8;font:16px "Segoe UI","Times New Roman",serif;text-shadow:0 2px #000;background:linear-gradient(#6a5238,#3e2f20);border:1px solid #1e1710;box-shadow:inset 0 1px 0 rgba(255,225,170,.25),inset 0 0 0 1px rgba(155,125,89,.45);}',
            P + ' .sgSwitch.on{background:linear-gradient(#56703a,#2f4220);box-shadow:inset 0 1px 0 rgba(220,255,190,.3),inset 0 0 0 1px #7fae5a;color:#e6ffd6;}',
            P + ' .sgHint{font:12px Arial,sans-serif;color:#9f978a;margin:2px 2px 8px;}',
            P + ' .sgMissing{font:12px Arial,sans-serif;color:#f08a80;margin:4px 2px 8px;display:none;}',
            P + ' .sgSettings.dim{opacity:.4;pointer-events:none;}',
            P + ' .sgRow{display:flex;align-items:center;gap:10px;min-height:34px;border-bottom:1px solid rgba(190,174,145,.10);}',
            P + ' .sgRow label,' + P + ' .sgRow .sgLbl{width:132px;flex:none;font-size:14px;color:#d8d0bf;}',
            P + ' .sgRow input[type=range]{flex:1;min-width:0;height:26px;accent-color:#c8943e;touch-action:none;}',
            P + ' .sgVal{width:44px;flex:none;text-align:right;font:12px Arial,sans-serif;color:#fff;}',
            P + ' .sgRow select{flex:1;min-width:0;height:30px;background:#16130f;color:#eee4d0;border:1px solid #5b4f40;font:13px Arial,sans-serif;}',
            P + ' .sgCheck{display:flex;align-items:center;gap:6px;font:13px Arial,sans-serif;color:#d8d0bf;cursor:pointer;}',
            P + ' .sgCheck input{width:18px;height:18px;accent-color:#c8943e;}',
            P + ' .sgBtns{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap;}',
            P + ' .sgBtn{height:34px;padding:0 14px;border:1px solid #5b4f40;background:rgba(0,0,0,.4);color:#e8e2d2;font:14px "Segoe UI","Times New Roman",serif;cursor:pointer;}',
            P + ' .sgBtn:hover{border-color:#a98b5c;color:#fff;}',
            P + ' .sgWarn{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:14px;}',
            P + ' .sgWarnBox{max-width:360px;background:#1a1612;border:1px solid #a98b5c;box-shadow:0 10px 40px #000;padding:14px 16px;font:14px "Segoe UI","Times New Roman",serif;color:#eee4d0;}',
            P + ' .sgWarnBox b{color:#ffc766;}',
            P + ' .sgWarnDev{margin-top:8px;font:12px Arial,sans-serif;color:#b9b1a2;}',
            P + ' .sgSec{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 0 2px;padding:4px 2px 5px;border-bottom:1px solid rgba(200,148,62,.5);font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#f0c878;text-shadow:0 1px 1px #000;}',
            P + ' .sgSecBtn{height:24px;padding:0 9px;border:1px solid #5b4f40;background:rgba(0,0,0,.4);color:#d8d0bf;font:12px Arial,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer;}',
            P + ' .sgSecBtn:hover{border-color:#a98b5c;color:#fff;}',
            P + ' .sgCode{flex:1;min-width:0;height:30px;padding:0 6px;background:#16130f;color:#eee4d0;border:1px solid #5b4f40;font:12px monospace;user-select:text;-webkit-user-select:text;}',
            P + ' .sgSmall{height:30px;padding:0 9px;font-size:13px;flex:none;}',
            P + ' .sgFoot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid rgba(190,174,145,.22);background:rgba(8,8,8,.5);font:13px Arial,sans-serif;color:#b9b1a2;}',
            P + ' .sgFoot b{color:#f0c878;font-weight:bold;}',
            P + ' .sgDiscord{height:32px;padding:0 14px;border:0;cursor:pointer;color:#fff;font:bold 13px Arial,sans-serif;background:#5865f2;border-radius:3px;}',
            P + ' .sgDiscord:hover{background:#6b76f5;}',
            '@media (max-height:480px){' + P + ' .sgHead{padding:7px 12px;}' + P + ' .sgTitle{font-size:18px;}' + P + ' .sgRow{min-height:30px;}' + P + ' .sgFoot{padding:6px 12px;}}',
            '@media (max-width:420px){' + P + ' .sgRow label,' + P + ' .sgRow .sgLbl{width:104px;font-size:13px;}}'
        ].join('\n');
        document.head.appendChild(s);
    }
    let panel = null;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const fmt = v => String(Math.round(v * 100) / 100);
    const hourText = h => {
        if (h === null || h === undefined || h < 0) return t('game');
        const m = Math.round(h * 60) % 1440;
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    };
    const L = () => window.MDZLighting || null;
    function buildPanel() {
        injectCss();
        const root = el('div');
        root.id = PANEL_ID;
        shield(root);
        const shell = el('div', 'sgShell');
        root.appendChild(shell);
        root.addEventListener('click', e => { if (e.target === root && panelMode !== 'side') closePanel(); });

        const head = el('div', 'sgHead');
        const title = el('span', 'sgTitle');
        const close = el('button', 'sgClose', '×');
        close.type = 'button';
        close.onclick = closePanel;
        head.append(title, close);

        const body = el('div', 'sgBody');
        const master = el('div', 'sgMaster');
        const masterLbl = el('span');
        const sw = el('button', 'sgSwitch');
        sw.type = 'button';
        sw.onclick = () => { const l = L(); if (!l) return; l.enable(!l.get().enabled); sync(); };
        master.append(masterLbl, sw);
        const hint = el('div', 'sgHint'), missing = el('div', 'sgMissing');

        const settings = el('div', 'sgSettings');
        // preset
        const presetRow = el('div', 'sgRow'), presetLbl = el('span', 'sgLbl'), preset = el('select');
        preset.onchange = () => {
            const l = L(), v = preset.value;
            if (!v || !l || typeof l.preset !== 'function') { sync(); return; }
            const go = () => { l.preset(v); sync(); };
            if (v === 'extreme') warnHigh(go, sync); else go();
        };
        presetRow.append(presetLbl, preset);
        settings.appendChild(presetRow);
        // sliders
        const sliders = {}, extra = {};
        const secs = [];
        for (const d of SLIDERS) {
            if (d.sec) {
                const hr = el('div', 'sgSec'), ht = el('span'), hb = el('button', 'sgSecBtn');
                hb.type = 'button';
                hb.onclick = () => { const l = L(); if (l && typeof l.resetSection === 'function') { l.resetSection(d.sec); sync(); } };
                hr.append(ht, hb);
                settings.appendChild(hr);
                secs.push({ sec: d.sec, row: hr, txt: ht, btn: hb });
            }
            const r = el('div', 'sgRow'), lbl = el('label'), inp = el('input'), val = el('span', 'sgVal');
            inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step;
            inp.id = 'mdz-sg-' + d.key; lbl.htmlFor = inp.id;
            inp.oninput = () => { val.textContent = fmt(+inp.value); const l = L(); if (l) l.set({ [d.key]: parseFloat(inp.value) }); };
            r.append(lbl, inp, val);
            settings.appendChild(r);
            sliders[d.key] = { row: r, lbl, inp, val, d };
            if (d.key === 'shadows') {
                const cr = el('div', 'sgRow'), cw = el('label', 'sgCheck'), cc = el('input'), ct = el('span');
                cc.type = 'checkbox';
                cc.onchange = () => { const l = L(); if (l) l.set({ cleanShadows: cc.checked }); };
                cw.append(cc, ct); cw.style.width = 'auto';
                cr.appendChild(cw);
                settings.appendChild(cr);
                extra.cleanRow = cr; extra.cleanChk = cc; extra.cleanTxt = ct;
            }
            if (d.key === 'frost') {
                for (const [key, name] of [['footprints', 'fpRow'], ['snowCover', 'scRow']]) {
                    const r2 = el('div', 'sgRow'), w2 = el('label', 'sgCheck'), c2 = el('input'), t2 = el('span');
                    c2.type = 'checkbox';
                    c2.onchange = () => { const l = L(); if (l) l.set({ [key]: c2.checked }); };
                    w2.append(c2, t2); w2.style.width = 'auto';
                    r2.appendChild(w2);
                    settings.appendChild(r2);
                    extra[name] = { row: r2, chk: c2, txt: t2, key };
                }
            }
            if (d.key === 'rays') {
                const rr = el('div', 'sgRow'), rl = el('span', 'sgLbl'), rs = el('select');
                rs.onchange = () => { const l = L(); if (l) l.set({ raysMode: rs.value }); };
                rr.append(rl, rs);
                settings.appendChild(rr);
                extra.raysRow = rr; extra.raysLbl = rl; extra.raysSel = rs;
            }
            if (d.key === 'fog') {
                const fr = el('div', 'sgRow'), fl = el('span', 'sgLbl'), fsel = el('select');
                fsel.onchange = () => { const l = L(); if (l) l.set({ fogMode: fsel.value }); };
                fr.append(fl, fsel);
                settings.appendChild(fr);
                extra.fogRow = fr; extra.fogLbl = fl; extra.fogSel = fsel;
            }
            if (d.key === 'flySize') {
                const pr = el('div', 'sgRow'), pw = el('label', 'sgCheck'), pc = el('input'), pt = el('span');
                pc.type = 'checkbox';
                pc.onchange = () => { const l = L(); if (l) l.set({ flyPixel: pc.checked }); };
                pw.append(pc, pt); pw.style.width = 'auto';
                pr.appendChild(pw);
                settings.appendChild(pr);
                extra.pixRow = pr; extra.pixChk = pc; extra.pixTxt = pt;
            }
        }
        // preview hour
        const hourRow = el('div', 'sgRow'), hourLbl = el('label'), hour = el('input'), hourVal = el('span', 'sgVal');
        hour.type = 'range'; hour.min = -1; hour.max = 23.75; hour.step = 0.25; hour.id = 'mdz-sg-hour'; hourLbl.htmlFor = hour.id;
        hour.oninput = () => { const h = parseFloat(hour.value); hourVal.textContent = hourText(h); const l = L(); if (l) l.previewHour(h < 0 ? null : h); };
        hourRow.append(hourLbl, hour, hourVal);
        settings.appendChild(hourRow);
        // quality + auto
        const qRow = el('div', 'sgRow'), qLbl = el('span', 'sgLbl'), quality = el('select');
        // a quality chosen by hand is kept: the automatic step-down goes off
        quality.onchange = () => {
            const l = L(), v = parseInt(quality.value, 10);
            if (!l) return;
            const go = () => { l.set({ quality: v, autoQuality: false }); sync(); };
            if (v === 2 && l.get().quality !== 2) warnHigh(go, sync); else go();
        };
        const autoWrap = el('label', 'sgCheck'), auto = el('input'), autoTxt = el('span');
        auto.type = 'checkbox';
        auto.onchange = () => { const l = L(); if (l) l.set({ autoQuality: auto.checked }); };
        autoWrap.append(auto, autoTxt);
        autoWrap.style.width = 'auto';
        qRow.append(qLbl, quality, autoWrap);
        settings.appendChild(qRow);
        const devHint = el('div', 'sgHint');
        settings.appendChild(devHint);
        extra.devHint = devHint;
        const fpsRow = el('div', 'sgRow'), fpsLbl = el('span', 'sgLbl'), fps = el('select');
        fps.onchange = () => { const l = L(); if (l) l.set({ fpsCap: parseInt(fps.value, 10) || 0 }); };
        fpsRow.append(fpsLbl, fps);
        settings.appendChild(fpsRow);
        const sfRow = el('div', 'sgRow'), sfWrap = el('label', 'sgCheck'), sfChk = el('input'), sfTxt = el('span');
        sfChk.type = 'checkbox';
        sfChk.onchange = () => { const l = L(); if (l) l.set({ showFps: sfChk.checked }); };
        sfWrap.append(sfChk, sfTxt); sfWrap.style.width = 'auto';
        sfRow.appendChild(sfWrap);
        settings.appendChild(sfRow);
        extra.sfRow = sfRow; extra.sfChk = sfChk; extra.sfTxt = sfTxt;
        const msRow = el('div', 'sgRow'), msWrap = el('label', 'sgCheck'), msChk = el('input'), msTxt = el('span');
        msChk.type = 'checkbox';
        msChk.onchange = () => { const l = L(); if (l) l.set({ menuSaver: msChk.checked }); };
        msWrap.append(msChk, msTxt); msWrap.style.width = 'auto';
        msRow.appendChild(msWrap);
        settings.appendChild(msRow);
        extra.msRow = msRow; extra.msChk = msChk; extra.msTxt = msTxt;
        // weather
        const wRow = el('div', 'sgRow'), wWrap = el('label', 'sgCheck'), weather = el('input'), wTxt = el('span');
        weather.type = 'checkbox';
        weather.onchange = () => { const l = L(); if (l) l.set({ weather: weather.checked }); };
        wWrap.append(weather, wTxt);
        wWrap.style.width = 'auto';
        wRow.appendChild(wWrap);
        settings.appendChild(wRow);
        // share: the look as a short code, and a code pasted back in
        const shRow = el('div', 'sgRow'), shLbl = el('span', 'sgLbl'), shInp = el('input', 'sgCode'), shCopy = el('button', 'sgBtn sgSmall'), shApply = el('button', 'sgBtn sgSmall');
        const shMsg = el('div', 'sgHint');
        shInp.type = 'text'; shInp.spellcheck = false; shInp.autocomplete = 'off'; shInp.placeholder = 'MDZ1-\u2026';
        // typing here must not reach the game's keyboard (it listens on the document)
        for (const ev of ['keydown', 'keyup', 'keypress']) shInp.addEventListener(ev, e => { if (e.key !== 'Escape') e.stopPropagation(); }, false);
        shCopy.type = shApply.type = 'button';
        let shTimer = 0;
        const shSay = (msg, bad) => { shMsg.textContent = msg; shMsg.style.color = bad ? '#f08a80' : '#9fd08a'; shMsg.style.display = 'block'; clearTimeout(shTimer); shTimer = setTimeout(() => { shMsg.style.display = 'none'; }, 2500); };
        shCopy.onclick = () => {
            const l = L(); if (!l || typeof l.exportCode !== 'function') return;
            const code = l.exportCode();
            shInp.value = code;
            try { shInp.focus(); shInp.select(); } catch (e) {}
            let done = false;
            try { done = document.execCommand('copy'); } catch (e) {}
            try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(code).catch(() => {}); done = true; } } catch (e) {}
            shSay(done ? t('copied') : code);
        };
        shApply.onclick = () => {
            const l = L(); if (!l || typeof l.importCode !== 'function') return;
            const ok = l.importCode(shInp.value);
            shSay(ok ? t('applied') : t('badCode'), !ok);
            if (ok) sync();
        };
        shRow.append(shLbl, shInp, shCopy, shApply);
        shMsg.style.display = 'none';
        settings.append(shRow, shMsg);
        extra.shRow = shRow; extra.shLbl = shLbl; extra.shCopy = shCopy; extra.shApply = shApply;
        // buttons
        const btns = el('div', 'sgBtns'), strike = el('button', 'sgBtn'), reset = el('button', 'sgBtn');
        strike.type = reset.type = 'button';
        strike.onclick = () => { const l = L(); if (l && typeof l.strike === 'function') l.strike(); };
        reset.onclick = () => {
            const l = L(); if (!l) return;
            const on = !!l.get().enabled;   // Reset keeps the shader on or off as it is
            l.reset(); l.set({ enabled: on }); l.previewHour(null);
            sync();
        };
        btns.append(strike, reset);
        settings.appendChild(btns);
        // line of sight: its own block, usable with the shader on or off
        const vis = el('div', 'sgVision'), visHead = el('div', 'sgSec'), visTitle = el('span');
        visHead.appendChild(visTitle);
        const visOnRow = el('div', 'sgRow'), visOnWrap = el('label', 'sgCheck'), visOn = el('input'), visOnTxt = el('span');
        visOn.type = 'checkbox';
        let visLast = 0.2;   // the darkness to come back to when switched on again
        visOn.onchange = () => { const l = L(); if (!l) return; l.set({ vision: visOn.checked ? visLast : 0 }); sync(); };
        visOnWrap.append(visOn, visOnTxt); visOnWrap.style.width = 'auto';
        visOnRow.appendChild(visOnWrap);
        const visSlider = (key, min, max, step) => {
            const r = el('div', 'sgRow'), lbl = el('label'), inp = el('input'), val = el('span', 'sgVal');
            inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
            inp.id = 'mdz-sg-' + key; lbl.htmlFor = inp.id;
            inp.oninput = () => { val.textContent = fmt(+inp.value); if (key === 'vision') visLast = +inp.value; const l = L(); if (l) l.set({ [key]: parseFloat(inp.value) }); };
            r.append(lbl, inp, val);
            return { row: r, lbl, inp, val };
        };
        const visDark = visSlider('vision', 0.05, 1, 0.05), visRange = visSlider('visionRange', 0.3, 3, 0.1);
        const visHideRow = el('div', 'sgRow'), visHideWrap = el('label', 'sgCheck'), visHide = el('input'), visHideTxt = el('span');
        visHide.type = 'checkbox';
        visHide.onchange = () => { const l = L(); if (l) l.set({ visionHide: visHide.checked }); };
        visHideWrap.append(visHide, visHideTxt); visHideWrap.style.width = 'auto';
        visHideRow.appendChild(visHideWrap);
        vis.append(visHead, visOnRow, visDark.row, visRange.row, visHideRow);
        extra.vis = { box: vis, title: visTitle, on: visOn, onTxt: visOnTxt, dark: visDark, range: visRange, hide: visHide, hideTxt: visHideTxt, hideRow: visHideRow, setLast: v => { visLast = v; } };
        body.append(master, hint, missing, vis, settings);

        const foot = el('div', 'sgFoot'), credit = el('span'), discord = el('button', 'sgDiscord');
        discord.type = 'button';
        discord.onclick = openDiscord;
        foot.append(credit, discord);

        shell.append(head, body, foot);
        document.body.appendChild(root);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && panelOpen()) { e.stopPropagation(); closePanel(); } }, true);
        panel = { root, title, close, masterLbl, sw, hint, missing, settings, presetLbl, preset, sliders, secs, hourLbl, hour, hourVal, qLbl, quality, auto, autoWrap, autoTxt, fpsRow, fpsLbl, fps, extra, weather, wTxt, strike, reset, credit, discord };
    }
    // Before the highest quality / the Extreme preset: what it costs, and
    // what this device was detected as.
    function warnHigh(onKeep, onBack) {
        const shell = panel && panel.root.querySelector('.sgShell');
        if (!shell) { onKeep(); return; }
        const old = shell.querySelector('.sgWarn'); if (old) old.remove();
        const wrap = el('div', 'sgWarn'), box = el('div', 'sgWarnBox'), msg = el('div');
        msg.append(el('b', '', '\u26A0 '), document.createTextNode(t('warnHigh')));
        box.appendChild(msg);
        const l = L(), dev = l && typeof l.device === 'function' ? l.device() : null;
        if (dev && dev.gpu) box.appendChild(el('div', 'sgWarnDev', t('thisDevice') + ': ' + dev.family + ' \u2192 ' + [t('qLow'), t('qMed'), t('qHigh')][dev.tier]));
        const btns = el('div', 'sgBtns'), keep = el('button', 'sgBtn', t('keep')), back = el('button', 'sgBtn', t('goBack'));
        keep.type = back.type = 'button';
        keep.onclick = () => { wrap.remove(); onKeep(); };
        back.onclick = () => { wrap.remove(); onBack(); };
        btns.append(back, keep);
        box.appendChild(btns);
        wrap.appendChild(box);
        shell.appendChild(wrap);
    }
    function openDiscord() {
        try {
            if (window.cordova && window.cordova.InAppBrowser) { window.cordova.InAppBrowser.open(DISCORD_URL, '_system'); return; }
        } catch (e) {}
        try { const w = window.open(DISCORD_URL, '_blank', 'noopener'); if (w) return; } catch (e) {}
        try { window.location.href = DISCORD_URL; } catch (e) {}
    }
    const panelOpen = () => !!(panel && panel.root.classList.contains('open'));
    // Labels, then values from mdz_lighting.js.
    function sync() {
        if (!panel) return;
        const p = panel, l = L(), c = l ? l.get() : null;
        p.title.textContent = t('title');
        p.close.title = t('close');
        p.masterLbl.textContent = t('shader');
        p.presetLbl.textContent = t('preset');
        p.preset.innerHTML = '';
        const pick = el('option', '', t('presetPick')); pick.value = ''; p.preset.appendChild(pick);
        for (const name of PRESETS.concat(['performanceCustom'])) { const o = el('option', '',name==='performanceCustom'?t('performance')+' ('+t('custom')+')':t(name)); o.value = name; p.preset.appendChild(o); }
        p.preset.value = typeof L().presetName === 'function' ? L().presetName() : '';
        for (const k of Object.keys(p.sliders)) p.sliders[k].lbl.textContent = t(p.sliders[k].d.label);
        p.hourLbl.textContent = t('hour');
        p.qLbl.textContent = t('quality');
        p.quality.innerHTML = '';
        [['0', 'qLow'], ['1', 'qMed'], ['2', 'qHigh']].forEach(([v, k]) => { const o = el('option', '', t(k)); o.value = v; p.quality.appendChild(o); });
        p.autoTxt.textContent = t('auto');
        p.extra.fogLbl.textContent = t('fogMode');
        p.extra.raysLbl.textContent = t('raysMode');
        p.extra.raysSel.innerHTML = '';
        [['objects', 'raysObjects'], ['static', 'raysStatic']].forEach(([v, k]) => { const o = el('option', '', t(k)); o.value = v; p.extra.raysSel.appendChild(o); });
        p.extra.sfTxt.textContent = t('showFps');
        p.extra.msTxt.textContent = t('menuSaver');
        p.extra.shLbl.textContent = t('share');
        p.extra.shCopy.textContent = t('copyCode');
        p.extra.shApply.textContent = t('applyCode');
        for (const x of p.secs) { x.txt.textContent = t(SEC_TITLE[x.sec]); x.btn.textContent = '\u21BA ' + t('secReset'); }
        p.extra.fogSel.innerHTML = '';
        [['both', 'fogBoth'], ['ground', 'fogGround'], ['top', 'fogTop']].forEach(([v, k]) => { const o = el('option', '', t(k)); o.value = v; p.extra.fogSel.appendChild(o); });
        p.extra.pixTxt.textContent = t('flyPixel');
        p.extra.cleanTxt.textContent = t('cleanShadows');
        p.extra.fpRow.txt.textContent = t('footprints');
        p.extra.scRow.txt.textContent = t('snowCover');
        p.fpsLbl.textContent = t('fps');
        p.fps.innerHTML = '';
        [['0', t('fpsOff')], ['60', '60'], ['45', '45'], ['30', '30']].forEach(([v, txt]) => { const o = el('option', '', txt); o.value = v; p.fps.appendChild(o); });
        p.autoWrap.title = t('autoTip');
        p.wTxt.textContent = t('weather');
        p.strike.textContent = '⚡ ' + t('strike');
        p.reset.textContent = t('reset');
        p.credit.innerHTML = '';
        p.credit.append(document.createTextNode(t('credits') + ' '), el('b', '', CREDIT_NAME));
        p.discord.textContent = t('discord');
        p.missing.textContent = t('missing');
        p.missing.style.display = l ? 'none' : 'block';
        const policy=l&&typeof l.multiplayerPolicy==='function'?l.multiplayerPolicy():{locked:false};
        p.sw.disabled = !l;
        const on = !!(c && c.enabled);
        p.sw.textContent = on ? t('on') : t('off');
        p.sw.classList.toggle('on', on);
        p.hint.textContent = t('offHint');
        p.hint.style.display = on ? 'none' : 'block';
        p.settings.classList.toggle('dim', !on);
        // line of sight (older mdz_lighting.js without it: the block is hidden)
        const V = p.extra.vis;
        V.title.textContent = t('secVision');
        V.onTxt.textContent = t('vision');
        V.dark.lbl.textContent = t('visionDark');
        V.range.lbl.textContent = t('visionRange');
        V.hideTxt.textContent = t('visionHide');
        V.box.style.display = c && c.vision !== undefined ? '' : 'none';
        V.on.disabled=V.dark.inp.disabled=V.range.inp.disabled=V.hide.disabled=!!policy.locked;
        if(p.sliders.strength)p.sliders.strength.inp.disabled=false;
        let lockHint=V.box.querySelector('.sgServerVisibility');
        if(!lockHint){lockHint=el('div','sgServerVisibility');lockHint.style.cssText='color:#d5bd84;font-size:12px;padding:8px 0';V.box.appendChild(lockHint);}
        lockHint.textContent=typeof window.mdzTr==='function'?window.mdzTr(lang,'Visibility is controlled by this server.'):'Visibility is controlled by this server.';
        lockHint.style.display=policy.locked?'':'none';
        if (c && c.vision !== undefined) {
            const vOn = +c.vision > 0;
            V.on.checked = vOn;
            if (vOn) V.setLast(+c.vision);
            for (const s of [V.dark, V.range]) s.row.style.display = vOn ? '' : 'none';
            V.hideRow.style.display = vOn ? '' : 'none';
            V.dark.inp.value = vOn ? c.vision : 0.75; V.dark.val.textContent = fmt(vOn ? +c.vision : 0.75);
            V.range.inp.value = c.visionRange; V.range.val.textContent = fmt(+c.visionRange);
            V.hide.checked = c.visionHide !== false;
        }
        if (!c) return;
        for (const k of Object.keys(p.sliders)) {
            const s = p.sliders[k];
            s.row.style.display = c[k] === undefined ? 'none' : '';
            if (c[k] === undefined) continue;
            s.inp.value = c[k];
            s.val.textContent = fmt(+c[k]);
        }
        const h = c.hour === null || c.hour === undefined ? -1 : c.hour;
        p.hour.value = h;
        p.hourVal.textContent = hourText(h);
        p.quality.value = String(c.quality);
        const dev = typeof l.device === 'function' ? l.device() : null;
        p.extra.devHint.style.display = dev && dev.gpu ? '' : 'none';
        if (dev && dev.gpu) p.extra.devHint.textContent = t('detected') + ': ' + dev.family + ' \u2192 ' + [t('qLow'), t('qMed'), t('qHigh')][dev.tier];
        p.auto.checked = !!c.autoQuality;
        p.autoWrap.style.display = c.autoQuality === undefined ? 'none' : 'flex';
        p.weather.checked = !!c.weather;
        p.fpsRow.style.display = c.fpsCap === undefined ? 'none' : '';
        p.fps.value = String(c.fpsCap || 0);
        p.extra.fogRow.style.display = c.fogMode === undefined ? 'none' : '';
        p.extra.fogSel.value = c.fogMode || 'both';
        p.extra.raysRow.style.display = c.raysMode === undefined ? 'none' : '';
        p.extra.raysSel.value = c.raysMode || 'objects';
        p.extra.sfRow.style.display = c.showFps === undefined ? 'none' : '';
        p.extra.sfChk.checked = !!c.showFps;
        p.extra.msRow.style.display = c.menuSaver === undefined ? 'none' : '';
        p.extra.msChk.checked = c.menuSaver !== false;
        p.extra.shRow.style.display = typeof l.exportCode === 'function' ? '' : 'none';
        for (const x of p.secs) x.btn.style.display = typeof l.resetSection === 'function' ? '' : 'none';
        p.extra.pixRow.style.display = c.flyPixel === undefined ? 'none' : '';
        p.extra.pixChk.checked = c.flyPixel !== false;
        p.extra.cleanRow.style.display = c.cleanShadows === undefined ? 'none' : '';
        p.extra.cleanChk.checked = c.cleanShadows !== false;
        for (const x of [p.extra.fpRow, p.extra.scRow]) { x.row.style.display = c[x.key] === undefined ? 'none' : ''; x.chk.checked = c[x.key] !== false; }
        p.preset.parentElement.style.display = typeof l.preset === 'function' ? '' : 'none';
    }
    // mode: 'menu' (centred, from the Options screen) or 'side' (docked, in game)
    let panelMode = 'menu';
    function openPanel(mode) {
        if (!panel) buildPanel();
        panelMode = mode === 'side' ? 'side' : 'menu';
        lang = readLang();
        sync();
        panel.root.classList.toggle('side', panelMode === 'side');
        panel.root.classList.add('open');
        syncHitbox();
    }
    function closePanel() {
        if (!panel) return;
        panel.root.classList.remove('open', 'side');
        redraw();
    }

    // ---------------------------------------------------------------
    // Every frame: keep the row where the Options screen is
    // ---------------------------------------------------------------
    // Once, the first time in the game: where Video Settings is, and what
    // this device was detected as.
    const TIP_KEY = 'mdz_vs_tip_v1', TIP_ID = 'mdz-vs-tip';
    let tipDue = 0, tipDone = false;
    try { tipDone = localStorage.getItem(TIP_KEY) === '1'; } catch (e) { tipDone = true; }
    function showTip() {
        tipDone = true;
        try { localStorage.setItem(TIP_KEY, '1'); } catch (e) {}
        if (document.getElementById(TIP_ID)) return;
        const box = el('div'), msg = el('div'), ok = el('button');
        box.id = TIP_ID;
        box.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:100040;max-width:min(520px,92vw);padding:10px 12px;display:flex;align-items:center;gap:12px;background:linear-gradient(rgba(22,19,16,.94),rgba(10,10,10,.96));border:1px solid #a98b5c;box-shadow:0 8px 30px #000;color:#eee4d0;font:14px "Segoe UI","Times New Roman",serif;transition:opacity .4s;';
        msg.appendChild(document.createTextNode('\uD83C\uDFA8 ' + t('tip')));
        const l = L(), dev = l && typeof l.device === 'function' ? l.device() : null;
        if (dev && dev.gpu) msg.appendChild(el('div', '', t('thisDevice') + ': ' + dev.family + ' \u2192 ' + [t('qLow'), t('qMed'), t('qHigh')][dev.tier])).style.cssText = 'margin-top:4px;font:12px Arial,sans-serif;color:#b9b1a2;';
        ok.type = 'button'; ok.textContent = t('gotIt');
        ok.style.cssText = 'flex:none;height:32px;padding:0 12px;border:1px solid #5b4f40;background:rgba(0,0,0,.4);color:#e8e2d2;font:14px "Segoe UI","Times New Roman",serif;cursor:pointer;';
        const bye = () => { box.style.opacity = '0'; setTimeout(() => box.remove(), 450); };
        ok.onclick = bye;
        shield(box);
        box.append(msg, ok);
        document.body.appendChild(box);
        setTimeout(bye, 12000);
    }
    let lastLangCheck = 0;
    function frame(now) {
        try {
            if (rt()) {
                if (now - lastLangCheck > 500) { lastLangCheck = now; const g = readLang(); if (g !== lang) { lang = g; if (panelOpen()) sync(); } }
                syncRow(findSlot());
                if (!tipDone) {
                    const r0 = rt(), L0 = r0 && (r0.wa || r0.running_layout);
                    if (L0 && L0.name === 'Map') { if (!tipDue) tipDue = now + 2500; else if (now >= tipDue) { lang = readLang(); showTip(); } }
                    else tipDue = 0;
                }
                if (panelOpen()) {
                    const r = rt(), L = r && (r.wa || r.running_layout);
                    if (panelMode === 'menu' && !row) closePanel();                              // left the Options screen
                    else if (panelMode === 'side' && L && L.name !== 'Map') closePanel();     // left the game
                }
                syncHitbox();
            }
        } catch (e) {
            if (!frame.warned) { frame.warned = true; console.warn('[MDZ Shader Menu]', e); }
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    window.MDZShaderMenu = {
        open: openPanel,
        mode: () => panelMode,
        close: closePanel,
        isOpen: panelOpen,
        // (tests) the native row, and where it is on the page
        _tip: () => { tipDone = false; tipDue = 0; try { localStorage.removeItem(TIP_KEY); } catch (e) {} },
        _row: () => row && { kind: row.kind, plate: row.plate, label: row.label, text: textOf(row.label), box: screenBox(row.plate) }
    };
})();
