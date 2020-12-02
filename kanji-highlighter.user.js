// ==UserScript==
// @name        Kanji Highlighter 2
// @namespace   japanese
// @description Based on the original Kanji Highlighter by looki, this will highlight all kanji using specific colours, depending on the user's knowledge level (currently optimized for WaniKani users).
// @include     *
// @exclude     http*://mail.google.com*
// @version     2.0.0
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_openInTab
// @require     http://ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js
// ==/UserScript==

// Visiblity coefficient for markup
var COL_ALPHA = 0.5;

// Number of color steps to generate for the unknown Kanji levels
var COLOR_STEPS = 5;

// Colors to use to generate color levels with
var COL_FROM = [255, 255, 128]; // yellow
var COL_TO = [255, 128, 128]; // red

// Special colors
var COL_KNOWN = "rgba(221, 255, 208, " + COL_ALPHA + ")";
var COL_CURRENT = "rgba(140, 255, 120, " + COL_ALPHA + ")";
var COL_ADDITIONAL = "rgba(208, 255, 255, " + COL_ALPHA + ")"; // User-added known kanji that have not been learned in one of the levels
var COL_SEEN = "rgba(255, 192, 255, " + COL_ALPHA + ")"; // User-added seen kanji
var COL_MISSING = "rgba(190, 190, 190, " + COL_ALPHA + ")";

// Matches a kanji in a string
var kanjiRegexp = /[\u4e00-\u9faf\u3400-\u4dbf]/;
// Matches all non-kanji characters
var notKanjiRegexp = /[^\u4e00-\u9faf\u3400-\u4dbf]+/g;

// Renderer setting mask bits
var R_KNOWN = 1;
var R_MISSING = 2;
var R_UNKNOWN = 4;
var R_ADD_K = 8;
var R_ADD_S = 16;
var R_CURRENT = 32;

// CSS that applies to all classes
var CSS_GLOBAL = "display:inline!important;margin:0!important;padding:0!important;border:0!important;"
                + "outline:0!important;font-size:100%!important;vertical-align:baseline!important;";

// Main
window.addEventListener("load", function (e) {
    // Register menu items
    GM_registerMenuCommand("Set current level", setKanjiLevel, "l");
    GM_registerMenuCommand("Show kanji statistics", countKanji);
    GM_registerMenuCommand("Re-scan website", rescanWebsite, "r");
    GM_registerMenuCommand("Open info for selected kanji", openKanjiDetails, "o");
    GM_registerMenuCommand("Set highlight settings", setRenderSettings);
    GM_registerMenuCommand("Temporarily disable on this site", undoHighlighting, "d");
    GM_registerMenuCommand("== Kanji from other sources:", function() { alert("Hey! I'm just a caption. Don't click me!"); });
    GM_registerMenuCommand("Set known", function() { setCustomKanji("known"); });
    GM_registerMenuCommand("Add known", function() { addCustomKanji("known"); }, "k");
    GM_registerMenuCommand("Remove known", function() { remCustomKanji("known"); });
    GM_registerMenuCommand("Set seen", function() { setCustomKanji("seen"); });
    GM_registerMenuCommand("Add seen", function() { addCustomKanji("seen"); }, "s");
    GM_registerMenuCommand("Remove seen", function() { remCustomKanji("seen"); });
    GM_registerMenuCommand("== Advanced:", function () { alert("Hey! I'm just a caption. Don't click me!"); });
    GM_registerMenuCommand("Set info website URLs", setInfoURLs);
    GM_registerMenuCommand("Modify level dictionary", setKanjiDict);
    GM_registerMenuCommand("Reset level dictionary", resetKanjiDict);
    GM_registerMenuCommand("Reset additionally known", function() { resetCustomKanji("known"); });
    GM_registerMenuCommand("Reset additionally seen", function() { resetCustomKanji("seen"); });
    GM_registerMenuCommand("Copy list of known kanji", copyKnownKanji);
    GM_registerMenuCommand("Copy list of unknown kanji", copyUnknownKanji);

    // GM_deleteValue("level");
    // GM_deleteValue("dictionary");

    loadSettings();
    rescanWebsite();
}, false);

// Register shortcut for setting the level
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 76 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        setKanjiLevel();
    }
}, false);
})();

// Register shortcut for opening the selected kanji on WK
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 79 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        openKanjiDetails();
    }
}, false);
})();

// Register shortcut for 'add additional known kanji'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 75 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        addCustomKanji("known");
    }
}, false);
})();

// Register shortcut for 'add additional seen kanji'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 83 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        addCustomKanji("seen");
    }
}, false);
})();

// Register shortcut for 're-scan website'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 82 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        rescanWebsite();
    }
}, false);
})();

// Register shortcut for 'Temporarily disable highlighting'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 68 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        undoHighlighting();
    }
}, false);
})();

function loadSettings() {
    // First time running the script
    if (GM_getValue("level") == null) {

        // Circumvent weird bug
        GM_setValue("level", 1);
        if (GM_getValue("level") == null)
            return;
        GM_deleteValue("level");

        alert("Since this is the first time that you're using the kanji highlighter script, " +
            "please adjust the following options to your needs.");
        setKanjiLevel();
    }

    // Load the dictionary - Wanikani's by default
    var dictionary;
    var dictValue = GM_getValue("dictionary");
    if (dictValue == null) {
        dictionary = getWKKanjiLevels();
        GM_setValue("dictionary", JSON.stringify(dictionary));
        GM_setValue("levelCount", dictionary.length);
    } else {
        dictionary = JSON.parse(dictValue);
    }
    if (GM_getValue("levelCount") == null && dictionary !== null)
        GM_setValue("levelCount", dictionary.length);
    unsafeWindow.dictionary = dictionary;

    // Legacy support
    if (old = GM_getValue("additionalKanji")) {
        GM_setValue("knownKanji", old);
        GM_deleteValue("additionalKanji");
    }

    // Store global values
    unsafeWindow.renderSettings = GM_getValue("renderSettings", 0xff);
    unsafeWindow.levelCount = GM_getValue("levelCount", getWKKanjiLevels().length); // TODO: Allow changing
    unsafeWindow.levelThreshold = GM_getValue("level", 1);
    unsafeWindow.knownKanji = GM_getValue("knownKanji", "");
    unsafeWindow.seenKanji = GM_getValue("seenKanji", "");
    unsafeWindow.infoPage = GM_getValue("infoPage", "https://www.wanikani.com/kanji/$K");
    unsafeWindow.infoFallback = GM_getValue("infoPage", "http://jisho.org/search/$K #kanji");
    unsafeWindow.dictionary = dictionary;

    // Build linear map
    unsafeWindow.kanjiMap = buildKanjiMap();

    // Generate CSS classes
    css = ".wk_K {  " + CSS_GLOBAL + " background-color: " + COL_KNOWN + " !important; /*color: black !important;*/ } ";
    css += ".wk_X { " + CSS_GLOBAL + " background-color: " + COL_MISSING + " !important; /*color: black !important;*/ } ";
    css += ".wk_A { " + CSS_GLOBAL + " background-color: " + COL_ADDITIONAL + " !important; /*color: black !important;*/ } ";
    css += ".wk_S { " + CSS_GLOBAL + " background-color: " + COL_SEEN + " !important; /*color: black !important;*/ } ";
    css += ".wk_C { " + CSS_GLOBAL + " background-color: " + COL_CURRENT + " !important; /*color: black !important;*/ } ";
    // Now generate a rainbow for the unknown levels
    for (i = 0; i < COLOR_STEPS; ++i) {
        ii = i * 1.0 / (COLOR_STEPS - 1);
        r = COL_FROM[0] * (1 - ii) + COL_TO[0] * ii;
        g = COL_FROM[1] * (1 - ii) + COL_TO[1] * ii;
        b = COL_FROM[2] * (1 - ii) + COL_TO[2] * ii;

        bgCol = 'rgba(' + Math.floor(r) + ',' + Math.floor(g) + ', ' + Math.floor(b) + ', ' + COL_ALPHA + ')';
        css += ".wk_" + i + " { " + CSS_GLOBAL + " /*color: black;*/ background-color: " + bgCol + " !important; } ";
    }
    GM_addStyle(css);
}

/*
 * Set render settings
 */
function setRenderSettings() {
    var t = "Enter 1 if you want to highlight ";
    var tmp, result = 0;
    var render = GM_getValue("renderSettings", unsafeWindow.renderSettings);
    do {
        if (null === (tmp = window.prompt(t + "officially learned (green) kanji, or 0 otherwise.", (render & R_KNOWN) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_KNOWN;

        if (null === (tmp = window.prompt(t + "new kanji from the current level (darker green), or 0 otherwise.", (render & R_CURRENT) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_CURRENT;

        if (null === (tmp = window.prompt(t + "not yet officially learned (yellow - red) kanji, or 0 otherwise.", (render & R_UNKNOWN) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_UNKNOWN;

        if (null === (tmp = window.prompt(t + "kanji not present in the levels (black), or 0 otherwise.", (render & R_MISSING) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_MISSING;

        if (null === (tmp = window.prompt(t + "additionally known (blue) kanji, or 0 otherwise.", (render & R_ADD_K) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_ADD_K;

        if (null === (tmp = window.prompt(t + "additionally seen (purple) kanji, or 0 otherwise.", (render & R_ADD_S) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_ADD_S;

        alert("You need to refresh the page in order to see the changes.");
        GM_setValue("renderSettings", result);
    } while (0);
}

/* 
 * Specifies the URLs to use when opening kanji detail pages.
 */
function setInfoURLs() {
    var infoPage, infoFallback;
    if (infoPage = window.prompt("Enter the URL to use when opening a kanji detail page " 
        + "($K will be replaced with the kanji).", unsafeWindow.infoPage)) {
        unsafeWindow.infoPage = infoPage;

        if (infoPage = window.prompt("Enter the URL to use as a fallback for unavailable kanji "
            + "($K will be replaced with the kanji).", unsafeWindow.infoFallback)) {
            unsafeWindow.infoFallback = infoFallback;
        }
    }
}

/*
 * Counts all the kanji and displays them in a popup.
 */
function countKanji() {
    currentLevel = unsafeWindow.levelThreshold;
    kanjiMap = buildKanjiMap();
    var known = 0, unknown = 0, additional = 0, formallyknown = 0, seen = 0;
    for (var kanji in kanjiMap) {
        level = kanjiMap[kanji];
        if (level <= currentLevel && level >= -1)
            known++;
        else if (level == -2)
            seen++;
        else
            unknown++;
        if (level == -1)
            additional++;
        else if (level <= currentLevel)
            formallyknown++;
    }
    alert((formallyknown) + " kanji have already been learned. There are " + additional +
        " additionally known kanji. The number of known kanji in total is " + known + ", plus " + seen + " marked as seen.");
}

/*
 * Removes the CSS decoration generated by the script, just this once. Useful for viewing Chinese pages
 * or just pages dealing with many kanji in general.
 */
function undoHighlighting() {
    $('span[class^=wk_]').removeClass();
}

/*
 * Prompts a dialog that allows the user to change his current threshold level
 */
function setKanjiLevel() {
    var level = window.prompt("Please enter the highest kanji level that should be marked as 'known'.", GM_getValue("level", 1));
    if (level !== null) {
        level = Math.max(1, Math.min(GM_getValue("levelCount", 1), parseInt(level, 10)));
        GM_setValue("level", level);
    }
}

/*
 * Prompts a dialog that allows the user to edit the raw kanji dictionary
 */
function setKanjiDict() {
    var kanjiDict = "";
    GM_setClipboard(JSON.stringify(unsafeWindow.dictionary, null, 4));
    alert("The dictionary has been copied into your clipboard. You should modify it using a text editor. "+
        "Once you're done, paste it into the text field in the next dialog.");

    // Try until proper JSON was specified
    while (true) {
        kanjiDict = window.prompt("Paste the new dictionary here.", kanjiDict);

        // Abort if nothing entiered
        if (kanjiDict == null)
            break;

        try {
            dict = JSON.parse(kanjiDict);
            if (dict instanceof Object) {
                // Find highest level
                var levelCount = Object.keys(dict).length;

                // Update & finish
                GM_setValue("levelCount", levelCount);
                GM_setValue("dictionary", kanjiDict);
                alert("Dictionary updated successfully - " + levelCount + " levels detected.");
                return;
            } else
                alert("The specified JSON is not a dictionary!");
        } catch (e) {
            if (e instanceof SyntaxError)
                alert("Error while parsing: " + e.message);
            else
                alert("Error: " + e.message);
        }
    }
}

/*
 * Opens a kanji detail website for every kanji in the selected phrase.
 * Uses a fallback website for kanji that are not within the levels
 * Defaults: WaniKani + beta.jisho.org as fallback.
 */
function openKanjiDetails() {
    var kanjiMap = unsafeWindow.kanjiMap;
    var kanji = getKanjiInString(getSelection().toString());
    var infoPage = unsafeWindow.infoPage;
    var infoFallback = unsafeWindow.infoFallback;

    for (var i = 0; i < kanji.length; ++i) {
        if (kanjiMap[kanji[i]] >= 1)
            GM_openInTab(infoPage.replace("$K", kanji[i]));
        else
            GM_openInTab(infoFallback.replace("$K", kanji[i]));
    }
}

/*
 * Opens a dialog to confirm that the dictionary should be reset to its default value
 */
function resetKanjiDict() {
    if (window.prompt("You are about to reset your level dictionary. If you have modified it on your own, "
        + "all changes will be lost. Enter 'yes' to confirm.", "") == "yes")
    {
        var wk = getWKKanjiLevels();
        GM_setValue("dictionary", JSON.stringify(wk));
        GM_setValue("levelCount", wk.length);
    }
}

/*
 * Prompts a dialog that allows the user to change his set of additional known/seen kanji from other sources
 */
function setCustomKanji(mode) {
    var kanji = window.prompt("Please enter a list of kanji that should always be regarded as '" + mode + "'. " +
        "You may insert an entire text - all non-kanji characters will automatically be removed.", GM_getValue(mode + "Kanji", ""));
    if (kanji !== null) {
        kanji = getKanjiInString(kanji);
        GM_setValue(mode + "Kanji", kanji);
    }
}

/*
 * Prompts a dialog that allows the user to add new manually known/seen kanji
 */
function addCustomKanji(mode) {
    var kanji = window.prompt("Please enter the kanji that you want to add as '" + mode + "'. " +
        "You may insert an entire text - all non-kanji characters will automatically be removed.",
        getKanjiInString(window.getSelection().toString()));
    if (kanji !== null) {
        kanji =getKanjiInString(GM_getValue(mode + "Kanji", "") + kanji);
        GM_setValue(mode + "Kanji", kanji);
    }
}

/*
 * Prompts a dialog that allows the user to remove manually known/seen kanji
 */
function remCustomKanji(mode) {
    var kanji = window.prompt("Please enter the kanji that you want to remove from the '" + mode + "' list. " +
        "You may insert an entire text - all non-kanji characters will automatically be removed.",
        getKanjiInString(window.getSelection().toString()));
    if (kanji !== null) {
        filter = new RegExp("[" + kanji + "]");
        kanji = getKanjiInString(GM_getValue(mode + "Kanji", "").replace(filter, ""));
        GM_setValue(mode + "Kanji", kanji);
    }
}

/*
 * Removes all kanji from the additionally known/seen list 
 */
function resetCustomKanji(mode) {
    if (window.prompt("You are about to reset list of additional " + mode + "kanji. "
        + "All changes will be lost. Enter 'yes' to confirm.", "") == "yes") {
        GM_setValue(mode + "Kanji", "");
    }
}


/*
 * (Re-)highlight all elements, ignoring already highlighted elements
 */
var scannedBefore = false;
function rescanWebsite() {
    // ':not([class^=wk_])' will filter out already highlighted kanji for when we want to update dynamically loaded content
    if (!scannedBefore) {
        highlightKanji("body *:not(noscript):not(script):not(style):not(textarea):not([class^=wk_])");
        scannedBefore = true;
    } else {
        highlightKanji("body *:not(noscript):not(script):not(style):not(textarea)");
    }
}

/* 
 * Lets the user copy a list of each kanji marked as "known" (including additional ones)
 */
 function copyKnownKanji() {
    kanjiMap = unsafeWindow.kanjiMap;
    levelThreshold = unsafeWindow.levelThreshold;
    output = "";
    for (var key in kanjiMap) {
        if (kanjiMap[key] <= levelThreshold && kanjiMap[key] >= -1)
            output += key;
    }
    window.prompt("Press ctrl+C to copy this list. It includes all kanji up to the current level and those marked as known manually.", output);
 }

 /* 
 * Lets the user copy a list of each kanji not yet learned
 */
 function copyUnknownKanji() {
    kanjiMap = unsafeWindow.kanjiMap;
    levelThreshold = unsafeWindow.levelThreshold;
    output = "";
    for (var key in kanjiMap) {
        if (kanjiMap[key] > levelThreshold)
            output += key;
    }
    window.prompt("Press ctrl+C to copy this list. It includes all kanji that were not yet learned.", output);
 }

/*
 * Highlights all the Kanji within selector's elements
 */
function highlightKanji(selector) {
    // Retrieve global variables
    var kanjiMap = unsafeWindow.kanjiMap;
    var levelThreshold = unsafeWindow.levelThreshold;
    var levelCount = unsafeWindow.levelCount;
    var renderSettings = unsafeWindow.renderSettings;

    $(selector).forEachText(function (str) {
        var output = "";
        var previousClass = "";
        for (var i = 0; i < str.length; ++i) {
            var chr = str[i];

            // Not a kanji, just keep it the same
            if (kanjiRegexp.test(chr)) {
                var level = kanjiMap[chr];

                // Assume that Kanji is known
                var className = "";

                // Self-learned kanji
                if ((renderSettings & R_ADD_K) && level == -1)
                    className = "A";
                else if ((renderSettings & R_ADD_S) && level == -2)
                    className = "S";
                // Not in WaniKani, highlight as missing
                else if ((renderSettings & R_MISSING) && isNaN(level))
                    className = "X";
                // Kanji on the *current* level
                else if ((renderSettings & R_CURRENT) && level == levelThreshold)
                    className = "C";
                // Kanji known
                else if ((renderSettings & R_KNOWN) && level <= levelThreshold)
                    className = "K";
                // Kanji that will be in one of the upper levels
                else if ((renderSettings & R_UNKNOWN) && level > levelThreshold) {
                    var classIndex = (level - levelThreshold) / (levelCount - levelThreshold);
                    classIndex *= (COLOR_STEPS - 1);
                    className = Math.round(classIndex);
                }

                // NOTE to self: !== is needed because 0 == ""

                // Level changed from previous char, 
                if (className !== previousClass) {
                    if (previousClass !== "")
                        output += "</span>";

                    if (className !== "")
                        output += '<span class="wk_' + className + '">'; /*'" title="Level: ' + (level > 0 ? level : "None") + ' ">';*/
                }

                previousClass = className;
                output += chr;
                continue;
            }

            if (previousClass !== "")
                output += "</span>";
            previousClass = "";

            // Default: Write the character with no modifications
            output += chr;
        }

        // Close last opened span tag
        if (previousClass !== "")
            output += "</span>";

        return output;
    });
}

/*
 * Returns a string containing all kanji of the input string
 */
function getKanjiInString(str) {
    // Remove all non-kanji characters
    str = str.replace(notKanjiRegexp, "");
    // Remove duplicates
    str = str.split("").filter(function (x, n, s) {
        return s.indexOf(x) == n;
    }).sort().join("");
    return str;
}

/* 
 * Converts and returns a one-dimensional Kanji->Level map of the specified Level->Kanji dictionary.
 */
function buildKanjiMap(dict, additional) {
    var map = {};
    var dict = unsafeWindow.dictionary;
    var customKnown = unsafeWindow.knownKanji;
    var customSeen = unsafeWindow.seenKanji;

    // If the  dictionary is an array, indices (keys) are 0-based
    var offset = (dict instanceof Array) ? 1 : 0;

    for (var level in dict) {
        var kanjiList = dict[level];
        for (var i = 0; i < kanjiList.length; ++i) {
            map[kanjiList[i]] = parseInt(level) + offset;
        }
    }

    // Insert / update specified additional kanji
    for (var i = 0; i < customKnown.length; ++i) {
        // Only use the 'additional' tag for kanji that have not been in one of the levels yet!
        // ... and kanji that are not in the dictionary at all, of course!
        if (map[customKnown[i]] > unsafeWindow.levelThreshold
         || map[customKnown[i]] == null)
            map[customKnown[i]] = -1;
    }
    for (var i = 0; i < customSeen.length; ++i) {
        // Do the same for seen as for known
        if (map[customSeen[i]] > unsafeWindow.levelThreshold
         || map[customSeen[i]] == null)
            map[customSeen[i]] = -2;
    }

    return map;
}

/*
 * Returns all WK Kanji categorized by their respective levels. This is the default dictionary that is used by the script.
 */
function getWKKanjiLevels() {
    return [
      /* 1:*/ "一七三上下九二人入八力十口大女山川工",
      /* 2:*/ "丁中丸了五六円出刀千又右四土夕天子小左手才文日月木本正水火犬玉王田白目立々",
      /* 3:*/ "万今元公内冬分切北午半友古台外太少市広引心戸方止母毛父牛生用矢",
      /* 4:*/ "不世主仕他代休先写去号名央字宝平年打早村気氷申男町百皿石礼竹糸耳花虫見貝赤足車",
      /* 5:*/ "交会体何作兄光同回図声多学弟当形来林毎皮社空米羽考肉自色草行西角言谷走近里金雨青音麦斤",
      /* 6:*/ "両亡京全前化南向国地夜妹姉安室州店後思明星曲有東次歩死活海点画直知私科羊茶血長食首",
      /* 7:*/ "付以夏失家弱強必教時未末札校欠氏民理由紙組船記辺通週雪風高魚鳥黄黒",
      /* 8:*/ "住助医反君場対局役所投支数朝森楽池決番研究答絵者話買身道間雲電馬",
      /* 9:*/ "乗予事仮使保具勝受和売定実客屋度持新服泳物界発相県美苦表要試談負返送部重験",
      /*10:*/ "始最業横歌求漢病算終線習聞落葉親語読調起路転軽農速進運配酒鉄開院集頭顔飲鳴",
      /*11:*/ "争令仲伝位低便働共初別利功努労味命好岸意成戦拾指放昔波注洋特神秒競級老育良追",
      /*12:*/ "倍僕勉動合員商寒島庭待息悪旅族暑期根植歯泉流消深温港湯球登着短祭章童第都野陽階",
      /*13:*/ "像億問器士宿情想感整料映暗様標橋殺然熱疑皆福緑練詩課謝賞輪選銀鏡題願養館駅",
      /*14:*/ "例卒協参周囲固基妥季完希念性技折望材束松格残的約能芸術雰頑骨",
      /*15:*/ "丈仏信列勇区単司坂変夫寺岩帰建式春昨昼晩晴毒法泣浅猫秋築紀英計軍飯",
      /*16:*/ "係典冒冗危取品園存守専幸府弁急政曜書治浴留真笑箱荷証辞遠門関阪険面",
      /*17:*/ "側兵劇原喜因堂塩官察席常干幻底恋悲愛敗是果栄梅渉無細結署薬虚覚詳説識警非鼻",
      /*18:*/ "借僧句可告喫報座弓忘枚汽洗焼煙祈禁禅種等胸脳訓許達静類喉叩飴",
      /*19:*/ "乱冊加史善団宇宙容履布徒得忙改昆易暴歴比混減笛節絡続舌若詞財連閥順",
      /*20:*/ "余個倒厚困圧在夢妨妻嫌害尻尾械機災犯率産確穴経罪臭被裕論議防難震飛",
      /*21:*/ "件任企判制務増委審岡批挙敵断条査検権派済省税素総義解設評認責資際羨",
      /*22:*/ "価値副勢各吸営坊域姿宮寝応態提援案状示策統置罰脱藤観誕費賀過領諦袖",
      /*23:*/ "乳俳停備優則割収呼城宅導崎師幹張律施沢準演現看秀職裁規護贅革鬼",
      /*24:*/ "供型境届展層差庁担株武燃狭環祝管肩腕腰製視触象販質載輸述違量額",
      /*25:*/ "与候効含居属巻影慣抜捕捜掛景替構模況渡満票絞肥補訟訴豊輩逮限隠響鮮捉",
      /*26:*/ "再刺創励占印往従復徴怪我振授接故汗河激独獣突筆菓討豚貯較造郵針鉛障",
      /*27:*/ "健就屈康怒悩惑招昇暇極段濃症痛眠睡端給締織胃腹訪誘貸迫迷退途郎靴",
      /*28:*/ "並修傘児冷凍処券博奇妙婦巨幼庫微憲撃攻浜清潔益移程稚精絶綺衆逆録隊麗",
      /*29:*/ "乾促催僚壊娘宗宴寄怖恐杯板欧江添烈猛略監督積索緊臣航街診詰請閣雄韓",
      /*30:*/ "乏婚延快懐押撮旗更枕浮渇漏照版盗符系翌背覧貧購越遊適預飾騒魅匂濡",
      /*31:*/ "似倉偵嘆均墓孫富尋巣帯幾廊径徳掃探救散既普棒泥粉編脈菜華融豪貨鑑除陸離驚",
      /*32:*/ "久傷党卵厳密序志恩捨採暖机染桜欲永汚液眼祖秘績興衛複訳賛込迎酸銭雑飼",
      /*33:*/ "否垂宣尊忠拡操敬暮漠灰熟異皇盛砂窓筋簡糖納肺著蒸蔵装裏誌諸賃閉噂",
      /*34:*/ "丼刻勤吐奴射幕承拝推揮損枝歓沿源爪磁粋紅純縦縮聖腐臓芋薦誤豆貴降隷痩",
      /*35:*/ "亀互介剣厄噌寿己彫彼恥払杉汁油測湖滞炎為熊獄破紹舎講遅酔酢醤銅鍋喋",
      /*36:*/ "伎伸依債及奈姓将幅廃換摘旧核沖津牙献甘療盟継維縄舞般諾貿超踏遺頼鹿鮭",
      /*37:*/ "償兆刑削募執塁契崩弾恵患戻抗抱抵掲旬昭湾漁爆狙聴臨葬跡跳遣闘陣香串眉",
      /*38:*/ "伴併傾刊却奏奥妊娠宜慮懸房扱抑択描盤称緒緩繰致託賂賄贈逃避還需齢膝",
      /*39:*/ "仙充免勧圏埋埼壁奪岐御慎拒控斐枠棋渋片甲祉稲群謙譲躍邦鈴銃鋼阜隆雇項宛",
      /*40:*/ "俊兼剤吹唱堀孝巡戒排携敏敷柱殖殿犠獲繁茂薄衝褒誉透鋭隣雅頻顧駆駐妖嬉",
      /*41:*/ "仁伺侵偽儀包墟徹拠拳措撤棄樹潜瀬炭畑至艦虎蛍蜂蜜衣誠遜郷酎鉱喧嘩嘘凄",
      /*42:*/ "克到双哲喪堅床弧括挑掘揚握揺斎暫析枢柄泊滑潟焦範糾紛綱網肝芝荒袋軸",
      /*43:*/ "刷即垣威封岳慰懇懲摩撲擦斉旨朗柔沈沼泰滅滋潮炉牧珍琴筒籍裂襲誰貢趣距露",
      /*44:*/ "丘侍俺刃匹叫叱吉塔姫娯寸嵐忍斗朱桃梨棚涙砲竜笠粒縁缶翼芽謎辛釣雷髪挨拶",
      /*45:*/ "也井凶卓呪塊塾嫁嬢暦曇湿溝滝澄狂狩疲眺矛硬磨稼翔肌脚舟菌裸賭鐘陰霊頃魂",
      /*46:*/ "俵吾墨孔寧寮帝幽庄斬架棟椅歳泡涼猿癖盆瞬瞳碁租穂穏綿菊誇鈍錬鍛鍵阻零魔鳩黙",
      /*47:*/ "伊佐哀唇塀墜如婆尺崖巾帽幣恨憎憩扇扉挿掌柳欺滴炊爽畳瞭砕箸粘粧胴芯虹詐霧",
      /*48:*/ "咲培塗尽帳彩悔憶斜殴溶灯班畜盾穫耐脅脇蓄蚊蛇貼賢踊輝辱迅遂鉢闇隙霜飢餓騎麻",
      /*49:*/ "俗刈剛劣勘唯壇奨妃尼征悟抽拓拘桑概浸淡潤煮珠礎紫衰覆誓謀陛陶隔駒鶴蹴慌",
      /*50:*/ "亭仰伯偶后唐堤堰墳壮奮峰巧廷彰把搬晶洞涯淀漂漫疫簿翻蟹訂諮軌邪銘駄鬱鰐",
      /*51:*/ "亮偉召喚塚媛慈挟枯沸浦渦濯燥玄瓶耕聡肪肯脂膚苗蓮襟貞軒軟邸郊郡釈隅隻頂",
      /*52:*/ "乃倫偏呂唆噴孤怠恒惰慢擁殊没牲猟祥秩糧綾膨芳茨覇貫賠輔遇遭鎖陥陳隼須颯",
      /*53:*/ "丹准剰啓壌寛帥徐惨戴披据搭曙浄瓜稿緋緯繊胞胡舗艇莉葵蒙虐諒諭錦随駿騰鯉",
      /*54:*/ "且傲冠勲卸叙呆呈哺尚庶悠愚拐杏栞栽欄疎疾痴粛紋茎茜荘謡践逸酬酷鎌阿顕鯨",
      /*55:*/ "之伏佳傍凝奉尿弥循悼惜愉憂憾抹旦昌朴栃栓瑛癒粗累脊虜該賓赴遼那郭鎮髄龍",
      /*56:*/ "凛凡匠呉嘉宰寂尉庸弊弦恭悦拍搾摂智柴洪猶碑穀窒窮紳縛縫舶蝶轄遥錯陵靖飽",
      /*57:*/ "乙伐俸凸凹哉喝坪堕峡弔敢旋楓槽款漬烏瑠盲紺羅胎腸膜萌蒼衡賊遍遮酵醸閲鼓",
      /*58:*/ "享傑凌剖嘱奔媒帆慨憤戯扶暁朽椎殻淑漣濁瑞璃硫窃絹肖菅藩譜赦迭酌錠陪鶏",
      /*59:*/ "亜侮卑叔吟堪姻屯岬峠崇忌慶憧拙擬曹梓汰沙浪漆甚睦礁禍篤紡胆蔑詠遷酪鋳閑雌",
      /*60:*/ "倹劾匿升唄囚坑妄婿寡廉慕拷某桟殉泌渓湧漸煩狐畔痢矯罷藍藻蛮謹逝醜"
    ];
};

/*
 * BASED ON (SLIGHT MODIFICATIONS)
 * jQuery replaceText - v1.1 - 11/21/2009
 * http://benalman.com/projects/jquery-replacetext-plugin/
 *
 * Copyright (c) 2009 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */
(function ($) {
    $.fn.forEachText = function (callback) {
        return this.each(function () {
            var f = this.firstChild,
                g, e, d = [];
            if (f) {
                do {
                    if (f.nodeType === 3) {
                        g = f.nodeValue;
                        e = callback(g);
                        if (e !== g) {
                            if (/</.test(e)) {
                                $(f).before(e);
                                d.push(f)
                            } else {
                                f.nodeValue = e
                            }
                        }
                    }
                } while (f = f.nextSibling)
            }
            d.length && $(d).remove()
        })
    }
})(jQuery);
