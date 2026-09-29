/**
 * item_spawner.js — Give any item directly to player inventory
 *
 * Calls the game's built-in Check_space_inventory event-sheet function:
 *   window.c2_callFunction("Check_space_inventory", [-1, itemId, fillPct])
 *
 *   slot    = -1   → auto first free slot
 *   itemId  = item ID from l_eng_items.xml
 *   fillPct = 0-100 for liquids/containers; 0 for all other items
 *
 * KEY FINDING (from data.js event-sheet analysis):
 *   The SAME call format works for ALL categories — rifles, pistols, helmets,
 *   vests, backpacks, melee, pants, outerwear, and general items.
 *   No separate function is needed per category.
 *
 * Item ID ranges (from l_eng_items.xml):
 *   1–148    General items (ammo, food, tools, attachments, meds)
 *   151–241  Rifles, SMGs, shotguns + upgraded variants
 *   200–215  Melee weapons
 *   250–276  Helmets / headwear
 *   300–306  Pants
 *   350–366  Outerwear / jackets
 *   400–415  Vests / body armour
 *   450–460  Backpacks
 *   700–768  Extended general items (more ammo, food, special gear)
 *   769      Red Key
 *   786      Red Key (new)
 *   787      Blue Key (new)
 *   788      Black Key (new)
 *   798      Black Key (MOD) ← externally injected via mod_loader.js
 *
 * Include in index.html:  <script src="item_spawner.js"></script>
 * Alt+I shortcut: re-show panel after closing
 */
(function () {
    'use strict';

    if (document.getElementById('smItemSpawnerPanel')) return;

    // ── Item database ─────────────────────────────────────────────────────────────
    // Format: [id, name]
    // IDs confirmed from l_eng_items.xml + data.js event-sheet analysis.
    // All use Check_space_inventory(-1, id, fill) — same format for every category.
    var LIQUID_IDS = { 8:1, 25:1, 53:1, 54:1, 55:1, 62:1, 63:1, 67:1,
                       121:1, 760:1, 761:1, 762:1, 767:1, 782:1 };

    var DB = {
        'General': [
            [1,'Canned Beans'],[2,'Canned Tuna'],[3,'Tactical Bacon'],[4,'Rice'],
            [5,'Tomato'],[6,'Apple'],[7,'Banana'],[8,'Pipsi'],[9,'Spite'],
            [11,'9mm Rounds'],[12,'.45 Rounds'],[13,'5.56 Rounds'],[14,'5.45 Rounds'],
            [15,'7.62x54R Rounds'],[17,'7.62x39 Rounds'],
            [21,'F1 Grenade'],[22,'Battery'],[23,'Campfire Kit'],[24,'Matches'],
            [25,'Whiskey'],[27,'Cranberries'],
            [42,'Hunting Knife'],[43,'Army Knife'],[44,'Butcher Knife'],
            [45,'Morphine'],[46,'Tetracycline'],
            [49,'Newspapers'],[50,'Woodpiles'],
            [51,'Crafted Arrow'],[52,'Composite Arrow'],
            [53,'Gasoline Can'],[54,'Water Bottle'],[55,'Canteen'],
            [56,'Land Mine'],[57,'Bear Trap'],
            [58,'.22 LR Ammo'],[59,'Car Tool Kit'],
            [60,'Raw Steak'],[61,'Cooked Steak'],
            [62,'Nuka-Cola'],[63,'Energy Drink'],
            [69,'9x19 Ammo'],[70,'Barbed Wire'],
            [73,'Cloudberries'],[74,'Bilberries'],
            [75,'Radio'],
            [76,'RDS'],[77,'PU Scope'],[78,'PSO-1 Scope'],[79,'ACOG Scope'],
            [80,'5.45 Suppressor'],[81,'5.56 Suppressor'],
            [82,'Hacksaw'],[83,'Bandolier'],[85,'MRE'],
            [86,'Spinning Fishing Rod'],[87,'Simple Fishing Rod'],
            [88,'Protective Case'],[89,'Magpul'],[90,'Choke'],
            [97,'Mushroom'],[98,'Long Range Scope'],[99,'Claymore'],
            [100,'9x18 Ammo'],[101,'9x39 Ammo'],[102,'Molotov Cocktail'],
            [103,'Flare Gun'],[104,'.50 Ammo'],
            [105,'40mm Grenade'],[106,'VOG-25 Grenade'],
            [107,'M203 Launcher'],[108,'GP-25 Launcher'],
            [109,'IV Kit'],[110,'Whetstone'],
            [111,'AK Grip'],[112,'Rail Grip'],[113,'Map Notes'],
            [115,'Binoculars'],[117,'Canvas'],
            [118,'Adhesive Plaster'],[119,'Smoke Grenade'],[120,'Cigarettes'],
            [121,'Beer'],[122,'Epoxy Glue'],[123,'Fertilizer'],
            [124,'Laser Sight'],[125,'Lighter'],[126,"Officer's Keycard"],
            [127,'Improvised Suppressor'],[128,'PVS-4 NV Scope'],[129,'1PN51 NV Scope'],
            [130,'C-MAG 5.56 Drum'],[131,'7.62x39 Drum Mag'],
            [138,'.308 Ammo'],[142,'Gun Sling'],[143,'Charcoal Tablets'],
            [144,'Blowtorch'],
            [146,'Underbarrel Flashlight'],[147,'Laser AK Grip'],[148,'Laser Rail Grip'],
            [700,'NBC Boots'],[701,'NBC Gloves'],[704,'12 Gauge Drum Mag'],
            [705,'Dye Bucket'],[708,'AI-2 Medkit'],[709,'Doggo Kennel'],
            [710,'Adrenaline'],[714,'Deerskin'],
            [715,'C-MAG 5.45 Drum'],
            [718,'Egg'],[719,'Raw Chicken'],[720,'Cooked Chicken'],
            [721,'Pistol Sights'],[722,'Pistol Suppressor'],[723,'Pistol Flashlight'],
            [729,'VOG-25 Khatabka'],[747,'C4 Explosive'],
            [748,'Christmas Hat'],[749,'Gift'],
            [755,'12.7x108mm Ammo'],
            [756,'Chips Zagorky'],[757,'Zagorky+Peanuts'],[758,'Zagorky'],
            [759,'Canned Sardines'],
            [760,'Monster ZERO'],[761,'PulseUp'],[762,'Bed-rul'],
            [763,'Pear'],[764,'Psychostimulants'],[765,'Energy Bar'],
            [766,'Bag of Berries'],[767,'Vodka Beluga'],[768,'Merchant Chocolate'],
            [769,'Red Key'],[782,'Item 782'],
            [786,'Red Key (new)'],[787,'Blue Key (new)'],[788,'Black Key (new)'],
            [798,'Black Key (MOD)']
        ],
        'Rifles': [
            [156,'Mosin-Nagant'],[157,'SKS'],[158,'M4A1'],[159,'AKM'],
            [160,'AK-74'],[161,'AKs-74U'],[162,'L85A2'],
            [163,'Improvised Bow'],[164,'Crossbow'],
            [166,'Sporter'],[167,'M92 Repeater'],[168,'SVD Dragunov'],
            [169,'MP5K'],[173,'UMP-45'],[174,'RPK'],
            [175,'FN-FAL'],[177,'AUG A1'],[178,'Saiga-12K'],
            [183,'PP-19 Bizon'],[184,'OTs-14 Groza'],[185,'VSS Vintorez'],
            [186,'SV-98'],[187,'Madsen'],[188,'AN-94'],
            [190,'Silenced Remington'],[191,'M16A2'],[192,'KRISS Vector'],
            [193,'M4A1+'],[194,'AKM+'],[195,'M70'],
            [196,'Saiga-12K+'],[197,'RPK+'],[198,'M16A2+'],[199,'AUG A1+'],
            [230,'Milkor MGL'],[231,'Blaze'],[232,'FAMAS F1'],[233,'Mini-14'],
            [234,'M79'],[235,'Sawn-Off Blaze'],[236,'Longhorn'],
            [237,'AK-74+'],[238,'AKs-74U+'],[239,'Mini-UZI'],
            [240,'As-Val'],[241,'V94 Volga']
        ],
        'Pistols': [
            [151,'FNX 45'],[152,'Colt 1911'],[153,'Magnum Revolver'],
            [154,'IZh-43'],[165,'Amphibia S'],[170,'Glock 17'],
            [171,'Sawn-Off IZh-43'],[172,'Sawn-Off Mosin'],[176,'Engraved Colt'],
            [179,'MAC-10'],[180,"Mare's Leg"],[181,'PM'],[182,'PB'],
            [189,'Desert Eagle']
        ],
        'Melee': [
            [200,'Pipe Wrench'],[201,'Shovel'],[202,'Hatchet'],
            [203,'Baseball Bat'],[204,'Fire Axe'],[205,'Crowbar'],
            [206,'Pickaxe'],[207,'Pitchfork'],[208,'Sledgehammer'],
            [209,'Crusader Sword'],[210,'Frying Pan'],[211,'Katana'],
            [212,'Barbed Baseball Bat'],[213,'Chainsaw'],
            [214,'Generator'],[215,'Metal Sheet']
        ],
        'Helmets': [
            [250,'Gas Mask'],[251,'Army Helmet'],
            [252,'Motorcycle Helmet'],[253,'Motorcycle Helmet (col)'],
            [254,'Warm Hat'],[255,'Beret'],[256,'Cap'],[257,'Balaclava'],
            [258,'Ushanka'],[259,'Hard Hat'],
            [260,'Headlamp'],[261,'Cowboy Hat'],[262,'Welding Mask'],
            [263,'Gorka Helmet'],[264,'Police Hat'],
            [265,'NVG'],[266,'Bandana'],[267,'Crusader Helm'],
            [268,'Pilot Helmet'],[269,'Altyn Helmet'],
            [270,'"Killa" Altyn Helmet'],[271,'GP5 Gas Mask'],
            [272,'Clown Mask'],[273,'Assault Helmet m1'],
            [274,'Assault Helmet m2'],[275,'Assault Helmet m3'],
            [276,'Assault Helmet m4']
        ],
        'Outerwear': [
            [350,'T-shirt'],[351,'Shirt'],[352,'Shirt (alt)'],
            [353,'Raincoat'],[354,'Jacket'],[355,'Gorka Jacket'],
            [356,'Hoodie'],[357,'Hoodie (alt)'],[358,'Trench Coat'],
            [359,'Paramedic Jacket'],[360,'Orel Jacket'],
            [361,'Tracksuit Jacket'],[362,'Dress'],
            [363,'Down Jacket'],[364,'Hunter Jacket'],
            [365,'Sweater'],[366,'Awesome Hoodie'],
            [702,'C Protective Suit'],[703,'Hazmat Suit'],
            [711,'CBRN Suit'],[712,'NBC Suit'],[713,'"C" NBC Suit']
        ],
        'Vests': [
            [400,'Bulletproof Vest'],[401,'Press Vest'],
            [402,'Assault Vest'],[403,'High Capacity Vest'],
            [404,'Kevlar Vest'],[405,'Soviet Vest'],
            [406,'Apron'],[407,'Ghillie Suit'],
            [408,'M Heavy Armor'],[409,'C Protective Suit (v)'],
            [410,'M Kevlar CBRN Suit'],[411,'M Heavy CBRN Suit'],
            [412,'M Ghillie CBRN Suit'],[413,'Hazmat Suit (v)'],
            [414,'NBC Suit (v)'],[415,'CBRN Suit (v)']
        ],
        'Pants': [
            [300,'Jeans'],[301,'Worker Pants'],[302,'Tracksuit Pants'],
            [303,'Gorka Pants'],[304,'Orel Pants'],
            [305,'Paramedic Pants'],[306,'Hunter Pants']
        ],
        'Backpacks': [
            [450,'Taloon Backpack'],[451,'Hunting Backpack'],
            [452,'Mountain Backpack'],[453,'School Backpack'],
            [454,'Improvised Sling Bag'],[455,'Improvised Backpack'],
            [456,'Camping Backpack'],[457,'Tortilla Backpack'],
            [458,'Satchel'],[459,'Military Satchel'],[460,'IFAK Satchel'],
            [752,'Shoulder Bag'],[753,'Military Shoulder Bag'],
            [754,'Medical Shoulder Bag']
        ]
    };

    var CAT_ORDER = ['General','Rifles','Pistols','Melee','Helmets',
                     'Outerwear','Vests','Pants','Backpacks'];

    // ── Helpers ───────────────────────────────────────────────────────────────────
    function toast(msg, color) {
        var el = document.getElementById('smISToast');
        if (!el) return;
        el.textContent = msg;
        el.style.color  = color || '#0f0';
        el.style.opacity = '1';
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.style.opacity = '0'; }, 3500);
    }

    function giveItem(itemId, fillPct, count) {
        if (typeof window.c2_callFunction !== 'function') {
            toast('c2_callFunction not found — game not loaded?', '#f55');
            return null;
        }
        itemId  = parseInt(itemId, 10);
        fillPct = parseFloat(fillPct);
        count   = Math.max(1, parseInt(count, 10) || 1);
        if (isNaN(itemId) || itemId <= 0) { toast('Invalid item ID', '#f55'); return null; }

        var results = [];
        for (var i = 0; i < count; i++) {
            results.push(window.c2_callFunction('Check_space_inventory', [-1, itemId, fillPct]));
        }
        return results;
    }

    function showResult(itemId, fillPct, count, results) {
        var el = document.getElementById('smISResult');
        if (!results) { el.style.color = '#f55'; el.textContent = 'Error — see toast'; return; }
        var detail = 'ID=' + itemId + '  fill=' + fillPct + '  ×' + count;
        var retStr = '[' + results.join(', ') + ']';
        var ok = results.some(function (r) { return r !== 0 && r !== undefined; });
        el.style.color = ok ? '#0d0' : '#f80';
        el.textContent = (ok ? '✅' : '⚠️') + ' ×' + results.length + '  ' + detail + '\nret: ' + retStr;
        toast((ok ? 'Gave ' : 'Returned 0 — inv full? ') + 'ID ' + itemId + ' ×' + count,
              ok ? '#0f0' : '#f80');
        console.log('[ItemSpawner] Check_space_inventory(-1,' + itemId + ',' + fillPct + ')×' + count +
                    ' → ' + JSON.stringify(results));
    }

    // ── Spawn Drop helpers (mirrors c2injt.js dropNewItemNearPlayer logic) ────────
    // Mirrors c2injt.js getInst() — finds the instances array on a C2 type object.
    function getInst(t) {
        if (t.instances) return t.instances;
        if (t._smISProp) {
            var ca = t[t._smISProp];
            if (Array.isArray(ca)) return ca;
            delete t._smISProp;
        }
        for (var k in t) {
            var v = t[k];
            if (Array.isArray(v) && v[0] && typeof v[0].uid === 'number') {
                t._smISProp = k;
                return v;
            }
        }
        return [];
    }

    // Returns true for any non-General item (uses spawn_drop, not Spawn_drop).
    // Checks our own DB first, then falls back to c2injt.js range 41-80.
    function isWeaponItem(id) {
        id = parseInt(id, 10);
        for (var cat in DB) {
            if (cat === 'General') continue;
            var items = DB[cat];
            for (var i = 0; i < items.length; i++) {
                if (items[i][0] === id) return true;
            }
        }
        return (id >= 41 && id <= 80);
    }

    // Spawns item(s) on the ground near the player.
    // Uses same function routing as c2injt.js dropNewItemNearPlayer:
    //   weapons/equipment → c2_callFunction("spawn_drop", [id, x, y, 1, cond*100])
    //   count > 1 general → c2_callFunction("Spawn_drop_from_player", [id, x, y, count])
    //   single general   → c2_callFunction("Spawn_drop", [id, x, y, -1])
    function spawnDrop(itemId, count, condPct) {
        if (typeof window.c2_callFunction !== 'function') {
            toast('c2_callFunction not found', '#f55'); return null;
        }
        var rt = typeof cr_getC2Runtime === 'function' ? cr_getC2Runtime() : null;
        if (!rt) { toast('Runtime not ready', '#f55'); return null; }

        itemId  = parseInt(itemId, 10);
        count   = Math.max(1, parseInt(count, 10) || 1);
        condPct = Math.max(0, Math.min(100, parseFloat(condPct) || 100));
        if (isNaN(itemId) || itemId <= 0) { toast('Invalid item ID', '#f55'); return null; }

        // Locate player (type t181) — same as c2injt.js
        var types = rt['S'] || [];
        var pType = null;
        for (var i = 0; i < types.length; i++) {
            if (types[i] && types[i].name === 't181') { pType = types[i]; break; }
        }
        if (!pType) { toast('t181 not found — not in game?', '#f55'); return null; }
        var pArr = getInst(pType);
        if (!pArr.length) { toast('Player not found — not in game?', '#f55'); return null; }
        var player = pArr[0];

        var useWeapon = isWeaponItem(itemId);
        var el = document.getElementById('smISResult');
        var spawned = 0;

        if (!useWeapon && count > 1) {
            // Stack all in one call
            window.c2_callFunction('Spawn_drop_from_player',
                [itemId, player.x + 40, player.y, count]);
            spawned = count;
        } else {
            for (var j = 0; j < count; j++) {
                var dx = player.x + 40 + (j * 12);
                if (useWeapon) {
                    window.c2_callFunction('spawn_drop',
                        [itemId, dx, player.y, 1, condPct * 100]);
                } else {
                    window.c2_callFunction('Spawn_drop', [itemId, dx, player.y, -1]);
                }
                spawned++;
            }
        }

        var fn = useWeapon ? 'spawn_drop' : (count > 1 ? 'Spawn_drop_from_player' : 'Spawn_drop');
        el.style.color = '#fc0';
        el.textContent = '📦 Dropped ×' + spawned + '  ID=' + itemId +
                         '\nfn: ' + fn + '  near (' +
                         Math.round(player.x) + ', ' + Math.round(player.y) + ')';
        toast('Dropped ×' + spawned + '  ID ' + itemId, '#fc0');
        console.log('[ItemSpawner] spawnDrop id=' + itemId + ' ×' + spawned +
                    ' fn=' + fn + ' x=' + player.x + ' y=' + player.y);
        return spawned;
    }

    // ── Panel HTML ────────────────────────────────────────────────────────────────
    var panel = document.createElement('div');
    panel.id = 'smItemSpawnerPanel';
    panel.style.cssText = [
        'position:fixed','top:60px','right:10px','width:230px',
        'background:rgba(10,10,20,0.95)',
        'border:1px solid rgba(0,220,255,0.35)',
        'border-radius:6px','padding:10px 12px',
        'font:12px/1.5 monospace','color:#ccc',
        'z-index:2147483647',
        'box-shadow:0 0 18px rgba(0,180,255,0.15)',
        'user-select:none'
    ].join(';');

    var INP = 'width:100%;box-sizing:border-box;background:#111;border:1px solid #333;' +
              'color:#fff;padding:3px 6px;margin-bottom:6px;border-radius:3px;font:12px monospace;';
    var LBL = 'color:#888;font-size:10px;display:block;';

    panel.innerHTML =
        '<div style="color:#0cf;font-weight:bold;font-size:13px;margin-bottom:8px;">' +
        '  🎒 Item Spawner' +
        '  <span id="smISClose" style="float:right;cursor:pointer;color:#666;font-size:14px;">✕</span>' +
        '</div>' +

        '<label style="' + LBL + '">CATEGORY</label>' +
        '<select id="smISCat" style="' + INP + '">' +
        CAT_ORDER.map(function(c){ return '<option value="'+c+'">'+c+'</option>'; }).join('') +
        '</select>' +

        '<label style="' + LBL + '">ITEM NAME</label>' +
        '<select id="smISName" style="' + INP + '"></select>' +

        '<label style="' + LBL + '">ITEM ID (manual override)</label>' +
        '<input id="smISItemId" type="number" min="1" max="9999" style="' + INP + '">' +

        '<label style="' + LBL + '">FILL / VALUE % (0–100)</label>' +
        '<input id="smISFill" type="number" min="0" max="100" value="0"' +
        '  style="' + INP + '">' +

        '<label style="' + LBL + '">COUNT</label>' +
        '<input id="smISCount" type="number" min="1" max="50" value="1"' +
        '  style="' + INP + '">' +

        '<div style="display:flex;gap:5px;margin-bottom:8px;">' +
        '<button id="smISGive"' +
        '  style="flex:1;padding:6px 2px;background:rgba(0,200,100,0.18);' +
        '  border:1px solid rgba(0,200,100,0.5);color:#0d0;border-radius:4px;' +
        '  cursor:pointer;font:bold 11px monospace;">' +
        '  ✅ Give' +
        '</button>' +
        '<button id="smISDrop"' +
        '  style="flex:1;padding:6px 2px;background:rgba(255,180,0,0.15);' +
        '  border:1px solid rgba(255,180,0,0.45);color:#fc0;border-radius:4px;' +
        '  cursor:pointer;font:bold 11px monospace;">' +
        '  📦 Drop' +
        '</button>' +
        '</div>' +

        '<div id="smISResult"' +
        '  style="background:#0a0a0a;border:1px solid #222;border-radius:3px;' +
        '  padding:5px 7px;font-size:10px;color:#555;min-height:28px;white-space:pre-wrap;">' +
        'No result yet' +
        '</div>' +

        '<div id="smISToast" style="margin-top:5px;font-size:10px;color:#0f0;opacity:0;transition:opacity 0.4s;"></div>';

    document.body.appendChild(panel);

    // ── Item selection logic ──────────────────────────────────────────────────────
    function populateCat(cat) {
        var sel = document.getElementById('smISName');
        sel.innerHTML = '';
        var items = DB[cat] || [];
        items.forEach(function(it) {
            var opt = document.createElement('option');
            opt.value = it[0];
            opt.textContent = it[0] + ' — ' + it[1];
            sel.appendChild(opt);
        });
        if (items.length) selectItem(items[0][0]);
    }

    function selectItem(id) {
        id = parseInt(id, 10);
        document.getElementById('smISItemId').value = id;
        document.getElementById('smISFill').value = LIQUID_IDS[id] ? 100 : 0;
    }

    // ── Wire events ───────────────────────────────────────────────────────────────
    document.getElementById('smISClose').addEventListener('click', function () {
        panel.style.display = 'none';
    });

    document.getElementById('smISCat').addEventListener('change', function () {
        populateCat(this.value);
    });

    document.getElementById('smISName').addEventListener('change', function () {
        selectItem(this.value);
    });

    document.getElementById('smISItemId').addEventListener('input', function () {
        var id = parseInt(this.value, 10);
        if (!isNaN(id)) {
            document.getElementById('smISFill').value = LIQUID_IDS[id] ? 100 : 0;
        }
    });

    document.getElementById('smISGive').addEventListener('click', function () {
        var itemId  = document.getElementById('smISItemId').value;
        var fillPct = document.getElementById('smISFill').value;
        var count   = document.getElementById('smISCount').value;
        showResult(itemId, fillPct, count, giveItem(itemId, fillPct, count));
    });

    document.getElementById('smISDrop').addEventListener('click', function () {
        var itemId  = document.getElementById('smISItemId').value;
        var condPct = document.getElementById('smISFill').value;  // fill % doubles as condition %
        var count   = document.getElementById('smISCount').value;
        spawnDrop(itemId, count, condPct);
    });

    // ── Init ──────────────────────────────────────────────────────────────────────
    populateCat(CAT_ORDER[0]);

    // Alt+I shortcut to re-show after close
    document.addEventListener('keydown', function (e) {
        if (e.altKey && (e.key === 'i' || e.key === 'I')) panel.style.display = '';
    });

    // ── Draggable ─────────────────────────────────────────────────────────────────
    (function () {
        var dragging = false, ox = 0, oy = 0;
        panel.addEventListener('pointerdown', function (e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
                e.target.tagName === 'SELECT') return;
            dragging = true;
            ox = e.clientX - panel.getBoundingClientRect().left;
            oy = e.clientY - panel.getBoundingClientRect().top;
            panel.setPointerCapture(e.pointerId);
        });
        panel.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            panel.style.left = (e.clientX - ox) + 'px';
            panel.style.top  = (e.clientY - oy) + 'px';
            panel.style.right = 'auto';
        });
        panel.addEventListener('pointerup', function () { dragging = false; });
    })();

    console.log('[ItemSpawner] Ready — ' + CAT_ORDER.length + ' categories. Alt+I to re-show.');

})();
