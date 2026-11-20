// =========================================
// ТЕМЫ ЧАТА И ЦВЕТ ТЕКСТА
// Только CSS + localStorage. Supabase не используется.
// =========================================

(function () {
    "use strict";

    var STORAGE_PREFIX = "chatAppearance:";
    var DEFAULTS = { theme: "classic", text: "#111111", messageStyle: "classic" };

    var THEMES = [
        {
            id: "classic-original",
            name: "Classic",
            preview: "linear-gradient(135deg,#eadcc8,#f4eadc)",
            vars: {
                bg: "#eadcc8",
                pattern: "radial-gradient(circle at 18px 18px,rgba(255,255,255,.28) 0 2px,transparent 2.5px),radial-gradient(circle at 70px 42px,transparent 0 8px,rgba(116,82,54,.09) 8.5px 10px,transparent 10.5px),radial-gradient(circle at 118px 76px,rgba(255,255,255,.22) 0 1.5px,transparent 2px),radial-gradient(circle at 42px 88px,transparent 0 6px,rgba(116,82,54,.07) 6.5px 8px,transparent 8.5px)",
                size: "150px 120px,180px 150px,130px 110px,210px 170px",
                bubble: "rgba(255,250,243,.88)",
                border: "rgba(117,82,50,.09)",
                shadow: "rgba(76,53,35,.06)"
            }
        },
        {
            id: "gold-shine-original",
            name: "Gold Shine",
            preview: "linear-gradient(135deg,#8a641e,#f7d774,#fff3bd,#b17a1f)",
            vars: {
                bg: "#d9bd70",
                pattern: "radial-gradient(circle at 20% 30%,rgba(255,255,255,.34) 0 2px,transparent 3px),linear-gradient(115deg,rgba(255,255,255,.10),rgba(255,255,255,.42),rgba(255,255,255,.08),rgba(112,70,0,.08))",
                size: "95px 95px,220px 220px",
                bubble: "rgba(255,249,225,.94)",
                border: "rgba(135,94,22,.18)",
                shadow: "rgba(104,72,15,.14)"
            }
        },
        {
            id: "gold-large-cells",
            name: "Gold — крупные клетки",
            preview: "repeating-linear-gradient(0deg,transparent 0 30px,rgba(255,255,255,.55) 31px 33px,transparent 34px 64px),repeating-linear-gradient(90deg,transparent 0 30px,rgba(112,70,0,.28) 31px 33px,transparent 34px 64px),linear-gradient(135deg,#8f6215,#f6d56c,#fff1ad,#b47b1d)",
            vars: {
                bg: "#d9bd70",
                pattern: "linear-gradient(125deg,rgba(255,244,176,.30),rgba(193,119,25,.20),rgba(255,226,122,.32))",
                size: "260% 260%",
                bubble: "rgba(255,249,225,.94)",
                border: "rgba(135,94,22,.18)",
                shadow: "rgba(104,72,15,.14)"
            }
        },
        {
            id: "royal-violet-original",
            name: "Royal Violet",
            preview: "linear-gradient(135deg,#34204e,#74519a,#d6b76a)",
            vars: {
                bg: "#57406f",
                pattern: "radial-gradient(circle at 22px 22px,rgba(255,255,255,.12) 0 2px,transparent 2.5px),linear-gradient(135deg,rgba(255,255,255,.07),rgba(48,24,75,.16))",
                size: "120px 100px,100% 100%",
                bubble: "rgba(250,245,255,.94)",
                border: "rgba(226,204,255,.26)",
                shadow: "rgba(35,18,54,.18)"
            }
        },
        {
            id: "gold-shine-small-cells",
            name: "Gold переливающийся — маленькие клетки",
            preview: "linear-gradient(135deg,#8a641e,#d9bd70,#f7d774,#fff3bd,#b17a1f)",
            vars: {
                bg: "#b58a35",
                pattern: "linear-gradient(115deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,.38) 25%,rgba(255,255,255,.08) 48%,rgba(112,70,0,.10) 75%,rgba(255,255,255,.12) 100%),radial-gradient(circle at 20% 30%,rgba(255,255,255,.34) 0 2px,transparent 3px),linear-gradient(135deg,#8a641e,#d9bd70,#f7d774,#fff3bd,#b17a1f)",
                size: "260% 260%,120px 120px,100% 100%",
                bubble: "rgba(255,249,225,.94)",
                border: "rgba(135,94,22,.18)",
                shadow: "rgba(104,72,15,.14)"
            }
        },
        {
            id: "gold-shine-large-cells",
            name: "Gold переливающийся — большие клетки",
            preview: "linear-gradient(135deg,#8a641e,#d9bd70,#f7d774,#fff3bd,#b17a1f)",
            vars: {
                bg: "#b58a35",
                pattern: "linear-gradient(115deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,.38) 25%,rgba(255,255,255,.08) 48%,rgba(112,70,0,.10) 75%,rgba(255,255,255,.12) 100%),repeating-conic-gradient(rgba(255,247,205,.25) 0% 25%,transparent 0% 50%),repeating-conic-gradient(rgba(92,55,0,.20) 0% 25%,transparent 0% 50%),linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(0deg,rgba(92,55,0,.16) 1px,transparent 1px),linear-gradient(135deg,#8a641e 0%,#d9bd70 25%,#f7d774 50%,#fff3bd 70%,#b17a1f 100%)",
                size: "260% 260%,256px 192px,256px 192px,128px 96px,128px 96px,100% 100%",
                bubble: "rgba(255,249,225,.94)",
                border: "rgba(135,94,22,.18)",
                shadow: "rgba(104,72,15,.14)"
            }
        },
        {
            id: "metal-small-cells",
            name: "Metal — маленькие клетки",
            preview: "linear-gradient(135deg,#69747a,#cbd1d4,#929da2,#e9edef,#737e83)",
            vars: {
                bg: "#92999d",
                pattern: "linear-gradient(115deg,rgba(255,255,255,.12) 0%,rgba(255,255,255,.42) 25%,rgba(255,255,255,.10) 48%,rgba(35,42,46,.12) 75%,rgba(255,255,255,.16) 100%),repeating-conic-gradient(rgba(245,250,252,.26) 0% 25%,transparent 0% 50%),repeating-conic-gradient(rgba(35,42,46,.18) 0% 25%,transparent 0% 50%),linear-gradient(90deg,rgba(255,255,255,.22) 1px,transparent 1px),linear-gradient(0deg,rgba(35,42,46,.16) 1px,transparent 1px),linear-gradient(145deg,#69747a 0%,#cbd1d4 25%,#929da2 50%,#e9edef 70%,#737e83 100%)",
                size: "260% 260%,256px 192px,256px 192px,128px 96px,128px 96px,100% 100%",
                bubble: "rgba(245,248,250,.94)",
                border: "rgba(65,78,84,.20)",
                shadow: "rgba(40,50,55,.16)"
            }
        },
        {
            id: "metal-large-cells",
            name: "Metal — большие клетки",
            preview: "linear-gradient(135deg,#69747a,#cbd1d4,#929da2,#e9edef,#737e83)",
            vars: {
                bg: "#92999d",
                pattern: "linear-gradient(115deg,rgba(255,255,255,.12) 0%,rgba(255,255,255,.42) 25%,rgba(255,255,255,.10) 48%,rgba(35,42,46,.12) 75%,rgba(255,255,255,.16) 100%),repeating-conic-gradient(rgba(245,250,252,.26) 0% 25%,transparent 0% 50%),repeating-conic-gradient(rgba(35,42,46,.18) 0% 25%,transparent 0% 50%),linear-gradient(90deg,rgba(255,255,255,.22) 1px,transparent 1px),linear-gradient(0deg,rgba(35,42,46,.16) 1px,transparent 1px),linear-gradient(145deg,#69747a 0%,#cbd1d4 25%,#929da2 50%,#e9edef 70%,#737e83 100%)",
                size: "260% 260%,256px 192px,256px 192px,128px 96px,128px 96px,100% 100%",
                bubble: "rgba(245,248,250,.94)",
                border: "rgba(65,78,84,.20)",
                shadow: "rgba(40,50,55,.16)"
            }
        },
        {
            id: "midnight-gold-original",
            name: "Midnight Gold",
            preview: "linear-gradient(135deg,#151b29,#27334b,#c49a42)",
            vars: {
                bg: "#202a3d",
                pattern: "radial-gradient(circle at 25px 25px,rgba(255,218,130,.13) 0 1.5px,transparent 2px),linear-gradient(145deg,rgba(255,255,255,.04),rgba(0,0,0,.12))",
                size: "115px 95px,100% 100%",
                bubble: "rgba(241,239,232,.96)",
                border: "rgba(255,214,125,.22)",
                shadow: "rgba(0,0,0,.22)"
            }
        },
        {
            id: "aqua-pearl-original",
            name: "Aqua Pearl",
            preview: "linear-gradient(135deg,#8acfd0,#e7fbf5,#86b9c8)",
            vars: {
                bg: "#bfe5e1",
                pattern: "radial-gradient(circle at 20px 20px,rgba(255,255,255,.46) 0 2px,transparent 2.5px),radial-gradient(circle at 82px 55px,rgba(70,145,157,.10) 0 2px,transparent 2.5px),linear-gradient(135deg,rgba(255,255,255,.22),rgba(66,155,165,.08))",
                size: "110px 90px,140px 120px,100% 100%",
                bubble: "rgba(246,253,251,.95)",
                border: "rgba(51,132,145,.16)",
                shadow: "rgba(35,105,117,.10)"
            }
        },
        {
            id: "aurora",
            name: "Северное сияние Iris",
            preview: "linear-gradient(125deg,#073e4d,#32c79a,#4d9df2,#b36bdb,#b4edbd)",
            vars: {
                bg: "#244f55",
                pattern: "radial-gradient(ellipse at 12% 18%,rgba(71,235,176,.72),transparent 48%),radial-gradient(ellipse at 82% 22%,rgba(75,166,255,.66),transparent 46%),radial-gradient(ellipse at 65% 88%,rgba(194,91,226,.54),transparent 48%),linear-gradient(135deg,rgba(7,47,69,.32),rgba(14,112,103,.30))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#effff7,#d9fff0,#e2f4ff,#f7eaff)",
                border: "rgba(179,239,216,.34)",
                shadow: "rgba(5,35,42,.20)"
            }
        },
        {
            id: "sakura",
            name: "Сакура Iris",
            preview: "linear-gradient(125deg,#f49cbd,#fff0d9,#d9a4f0,#f6c6b0,#e7a0c0)",
            vars: {
                bg: "#f1d5dc",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(255,160,192,.76),transparent 46%),radial-gradient(ellipse at 82% 24%,rgba(255,218,160,.72),transparent 45%),radial-gradient(ellipse at 62% 88%,rgba(195,135,224,.50),transparent 48%),linear-gradient(135deg,rgba(255,255,255,.30),rgba(210,108,151,.22))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fff5f8,#ffe5ed,#fff1dc,#f5eaff)",
                border: "rgba(174,104,128,.17)",
                shadow: "rgba(112,62,79,.10)"
            }
        },
        {
            id: "ocean",
            name: "Глубокий океан Iris",
            preview: "linear-gradient(125deg,#07506b,#27c4c1,#4a9be8,#9be5c7,#176d91)",
            vars: {
                bg: "#316d7d",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(38,202,205,.68),transparent 46%),radial-gradient(ellipse at 82% 24%,rgba(54,140,235,.66),transparent 46%),radial-gradient(ellipse at 62% 88%,rgba(115,221,191,.54),transparent 48%),repeating-linear-gradient(155deg,transparent 0 34px,rgba(255,255,255,.14) 35px 37px)",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#edffff,#d9f8ff,#e3efff,#e0fff4)",
                border: "rgba(151,218,231,.30)",
                shadow: "rgba(8,38,55,.20)"
            }
        },
        {
            id: "lavender-mist",
            name: "Лавандовый туман Iris",
            preview: "linear-gradient(125deg,#a57be7,#d7b8ff,#86b9f4,#f0b4dc,#b4a7ef)",
            vars: {
                bg: "#d2c8e8",
                pattern: "radial-gradient(ellipse at 14% 20%,rgba(190,127,255,.68),transparent 46%),radial-gradient(ellipse at 82% 25%,rgba(116,167,255,.62),transparent 46%),radial-gradient(ellipse at 60% 88%,rgba(255,157,208,.58),transparent 48%),linear-gradient(125deg,rgba(255,255,255,.34),rgba(135,119,184,.20))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fbf4ff,#eee4ff,#e7f0ff,#fff0f7)",
                border: "rgba(123,103,166,.18)",
                shadow: "rgba(74,57,111,.12)"
            }
        },
        {
            id: "mint-garden",
            name: "Мятный сад Iris",
            preview: "linear-gradient(125deg,#62c88f,#c5f1d1,#8bd9e5,#e1e99a,#69bda6)",
            vars: {
                bg: "#c2e0d1",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(90,205,145,.68),transparent 46%),radial-gradient(ellipse at 82% 25%,rgba(118,207,226,.62),transparent 46%),radial-gradient(ellipse at 60% 88%,rgba(220,231,120,.54),transparent 48%),linear-gradient(135deg,rgba(255,255,255,.30),rgba(70,145,107,.18))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#f2fff6,#ddf9e8,#e2fbff,#f9ffe5)",
                border: "rgba(70,137,102,.17)",
                shadow: "rgba(40,91,66,.11)"
            }
        },
        {
            id: "coral-sunset",
            name: "Коралловый закат Iris",
            preview: "linear-gradient(125deg,#ed786e,#ffc16e,#f7a6a8,#c98bd5,#f4d18b)",
            vars: {
                bg: "#e9b49d",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(255,119,112,.72),transparent 46%),radial-gradient(ellipse at 82% 22%,rgba(255,190,92,.74),transparent 46%),radial-gradient(ellipse at 60% 88%,rgba(207,107,157,.56),transparent 48%),linear-gradient(145deg,rgba(255,244,202,.34),rgba(157,72,65,.18))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fff4e9,#ffe2d5,#fff0d9,#fce7f3)",
                border: "rgba(166,91,74,.19)",
                shadow: "rgba(112,57,48,.12)"
            }
        },
        {
            id: "gold-shine",
            name: "Gold Shine Iris",
            preview: "linear-gradient(125deg,#fff0a8,#f4bd45,#fff7cf,#d99a2d,#ffe9a0)",
            vars: {
                bg: "#d9bd70",
                pattern: "radial-gradient(ellipse at 18% 22%,rgba(255,255,255,.48),transparent 38%),radial-gradient(ellipse at 82% 28%,rgba(255,190,55,.38),transparent 42%),radial-gradient(ellipse at 60% 88%,rgba(255,245,180,.48),transparent 44%),linear-gradient(125deg,rgba(255,244,176,.30),rgba(193,119,25,.20),rgba(255,226,122,.32))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,rgba(255,250,220,.98),rgba(255,226,151,.96),rgba(255,248,211,.98),rgba(255,218,132,.96))",
                border: "rgba(135,94,22,.18)",
                shadow: "rgba(104,72,15,.14)"
            }
        },
        {
            id: "royal-violet",
            name: "Royal Violet Iris",
            preview: "linear-gradient(125deg,#51306f,#d36bb5,#648ee5,#e4b86a,#8a62bd)",
            vars: {
                bg: "#57406f",
                pattern: "radial-gradient(ellipse at 15% 18%,rgba(255,104,190,.62),transparent 46%),radial-gradient(ellipse at 82% 22%,rgba(90,190,255,.56),transparent 44%),radial-gradient(ellipse at 72% 88%,rgba(255,205,92,.48),transparent 48%),linear-gradient(135deg,rgba(116,68,180,.46),rgba(43,28,88,.28))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#fff0fb,#f0e8ff,#e5f1ff,#fff0e2)",
                border: "rgba(226,204,255,.26)",
                shadow: "rgba(35,18,54,.18)"
            }
        },
        {
            id: "midnight-gold",
            name: "Midnight Gold Iris",
            preview: "linear-gradient(125deg,#172b4d,#3b7eaa,#ad78bd,#d0a34b,#243047)",
            vars: {
                bg: "#202a3d",
                pattern: "radial-gradient(ellipse at 18% 20%,rgba(44,145,220,.62),transparent 45%),radial-gradient(ellipse at 82% 30%,rgba(210,151,67,.52),transparent 42%),radial-gradient(ellipse at 55% 92%,rgba(179,105,198,.42),transparent 48%),linear-gradient(135deg,rgba(14,28,53,.38),rgba(63,46,78,.30))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#f4f5f8,#e5eff9,#f5e8d5,#e9e4f5)",
                border: "rgba(255,214,125,.22)",
                shadow: "rgba(0,0,0,.22)"
            }
        },
        {
            id: "aqua-pearl",
            name: "Aqua Pearl Iris",
            preview: "linear-gradient(125deg,#38bdb1,#d5fff0,#70b9e9,#c4f2dc,#4f9cae)",
            vars: {
                bg: "#bfe5e1",
                pattern: "radial-gradient(ellipse at 15% 20%,rgba(57,205,190,.62),transparent 48%),radial-gradient(ellipse at 82% 28%,rgba(91,174,235,.56),transparent 46%),radial-gradient(ellipse at 58% 90%,rgba(179,237,211,.72),transparent 48%),linear-gradient(135deg,rgba(255,255,255,.28),rgba(66,155,165,.20))",
                size: "220% 220%,220% 220%,220% 220%,220% 220%",
                bubble: "linear-gradient(125deg,#f2fffb,#d9fff1,#e2f5ff,#f5ffed)",
                border: "rgba(51,132,145,.16)",
                shadow: "rgba(35,105,117,.10)"
            }
        }
    ];


    var MESSAGE_STYLES = [
        {id:"classic",name:"Классика",preview:"linear-gradient(135deg,#fffaf3,#f1e4d4)",vars:{bg:"rgba(255,250,243,.96)",pattern:"none",size:"auto",border:"rgba(117,82,50,.12)",shadow:"rgba(76,53,35,.08)",userBg:"rgba(255,255,255,.62)",userColor:"#55705e",userBorder:"#d49a62",time:"#88786a",replyBg:"rgba(238,238,238,.92)",replyBorder:"#8E44AD",buttonBg:"#9B7AC2",buttonColor:"#ffffff"}},
        {id:"mushrooms",name:"Грибная поляна",preview:"linear-gradient(135deg,#f0e4d0,#a8b98a)",vars:{bg:"#f0e4d0",pattern:"radial-gradient(ellipse at 16% 22%,rgba(160,92,55,.30) 0 5px,transparent 6px),radial-gradient(ellipse at 16% 17%,rgba(225,190,139,.92) 0 10px,transparent 11px),radial-gradient(ellipse at 76% 72%,rgba(177,104,62,.24) 0 6px,transparent 7px),radial-gradient(ellipse at 76% 66%,rgba(245,213,163,.90) 0 12px,transparent 13px),radial-gradient(circle at 48% 38%,rgba(94,132,78,.22) 0 2px,transparent 3px)",size:"110px 100px",border:"rgba(115,92,61,.24)",shadow:"rgba(76,83,48,.13)",userBg:"rgba(255,248,231,.88)",userColor:"#665038",userBorder:"#b18a5d",time:"#786b55",replyBg:"rgba(225,235,210,.94)",replyBorder:"#78945f",buttonBg:"#718b5c",buttonColor:"#ffffff"}},
        {id:"hemp-real-leaf",name:"Конопля — настоящий лист",preview:"linear-gradient(135deg,#183b1d,#76ad43)",vars:{bg:"#244126",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p3.hippopx.com/preview/765/341/cannabis-leaves-green-leaves-close-up-shot-vibrant-green-detailed-texture-intricate-patterns-marijuana-plant-cannabis-plant-leaf-details-plant-close-up.jpg")',size:"cover",border:"rgba(154,205,112,.42)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(239,255,229,.93)",userColor:"#244525",userBorder:"#91b96c",time:"#e5f2d8",replyBg:"rgba(220,241,205,.95)",replyBorder:"#83ad5e",buttonBg:"#315d32",buttonColor:"#ffffff"}},
        {id:"hemp-real-closeup",name:"Конопля — крупный зелёный лист",preview:"linear-gradient(135deg,#092d43,#1a9a5a)",vars:{bg:"#123c42",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p3.hippopx.com/preview/682/45/cannabis-leaves-marijuana-leaves-close-up-photo-vibrant-green-freshness-growth-plant-leaves-cannabis-plant-marijuana-plant-leaf-details.jpg")',size:"cover",border:"rgba(77,190,133,.42)",shadow:"rgba(0,0,0,.28)",userBg:"rgba(232,255,242,.93)",userColor:"#14543a",userBorder:"#70bd91",time:"#d9f5e6",replyBg:"rgba(208,244,222,.95)",replyBorder:"#47a879",buttonBg:"#176b4b",buttonColor:"#ffffff"}},
        {id:"hemp-real-garden",name:"Конопля — зелёная листва",preview:"linear-gradient(135deg,#17452d,#83b75b)",vars:{bg:"#1d432d",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p3.hippopx.com/preview/111/174/marijuana-plant-cannabis-leaves-close-up-photo-green-leaves-unique-shape-vibrant-color-detailed-close-up-marijuana-leaves-cannabis-plant-plant-details.jpg")',size:"cover",border:"rgba(137,199,111,.40)",shadow:"rgba(0,0,0,.26)",userBg:"rgba(240,255,231,.93)",userColor:"#28502e",userBorder:"#8dbd70",time:"#e4f3d8",replyBg:"rgba(218,241,203,.95)",replyBorder:"#79a95f",buttonBg:"#356c3c",buttonColor:"#ffffff"}},
        {id:"amanita-red-closeup",name:"Мухомор — яркая красная шляпка",preview:"linear-gradient(135deg,#641b16,#f34c35)",vars:{bg:"#43231f",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p3.hippopx.com/preview/952/242/fly-agaric-amanita-muscaria-toxic-mushroom-close-up-photo-natural-habitat-red-cap-white-spots-forest-floor-woodland-fungi.jpg")',size:"cover",border:"rgba(235,121,91,.45)",shadow:"rgba(0,0,0,.28)",userBg:"rgba(255,242,232,.94)",userColor:"#8a3025",userBorder:"#d77b62",time:"#f8ded3",replyBg:"rgba(255,224,211,.95)",replyBorder:"#cf5c48",buttonBg:"#a9362a",buttonColor:"#ffffff"}},
        {id:"amanita-scarlet-forest",name:"Мухомор — алый лесной",preview:"linear-gradient(135deg,#a51e27,#f16a4c)",vars:{bg:"#4b2924",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p3.hippopx.com/preview/823/68/amanita-muscaria-fly-agaric-mushroom-red-and-white-spotted-autumn-forest-close-up-photography-leafy-setting-red-mushroom-white-spots-forest-floor-nature-photography.jpg")',size:"cover",border:"rgba(242,139,111,.46)",shadow:"rgba(0,0,0,.27)",userBg:"rgba(255,244,234,.94)",userColor:"#8e302a",userBorder:"#dc9273",time:"#f8e4d8",replyBg:"rgba(255,229,211,.95)",replyBorder:"#d56a50",buttonBg:"#b43d32",buttonColor:"#ffffff"}},
        {id:"amanita-ruby-macro",name:"Мухомор — рубиновый",preview:"linear-gradient(135deg,#4c1116,#e52d32,#ff9b45)",vars:{bg:"#33201d",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p3.hippopx.com/preview/750/583/fly-agaric-amanita-muscaria-red-spotted-mushroom-forest-setting-close-up-shot-detailed-view-red-mushroom-white-spots-woodland-nature.jpg")',size:"cover",border:"rgba(238,104,83,.46)",shadow:"rgba(0,0,0,.30)",userBg:"rgba(255,241,230,.94)",userColor:"#862b27",userBorder:"#d67b65",time:"#f4ddd1",replyBg:"rgba(255,224,207,.95)",replyBorder:"#c95748",buttonBg:"#a92f2b",buttonColor:"#ffffff"}},
        {id:"porcini-classic",name:"Белый гриб — классический",preview:"linear-gradient(135deg,#c8a77a,#6e5036)",vars:{bg:"#4a3a2c",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p1.hippopx.com/preview/385/210/338/boletus-edulis-mushroom-mushrooms-edible-mushrooms.jpg")',size:"cover",border:"rgba(198,165,119,.42)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,247,232,.94)",userColor:"#705237",userBorder:"#c4a276",time:"#eddfc9",replyBg:"rgba(242,225,198,.95)",replyBorder:"#aa8558",buttonBg:"#80603e",buttonColor:"#ffffff"}},
        {id:"porcini-forest",name:"Белые грибы — лесная корзина",preview:"linear-gradient(135deg,#d7b58a,#7c6547)",vars:{bg:"#514333",pattern:'linear-gradient(135deg,rgba(5,12,4,.18),rgba(5,12,4,.30)),url("https://p1.hippopx.com/preview/59/397/107/grzyb-ceps-porcini-boletus-edulis.jpg")',size:"cover",border:"rgba(210,181,139,.42)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,248,235,.94)",userColor:"#6d5538",userBorder:"#c6a77c",time:"#eee1cd",replyBg:"rgba(244,231,210,.95)",replyBorder:"#ad8d62",buttonBg:"#806747",buttonColor:"#ffffff"}},
        {id:"strawberry",name:"Лесная земляника",preview:"linear-gradient(135deg,#ffe0df,#f3a5a5)",vars:{bg:"#ffe9e4",pattern:"radial-gradient(ellipse at 20% 24%,rgba(205,45,68,.82) 0 5px,transparent 6px),radial-gradient(ellipse at 20% 19%,rgba(91,142,65,.78) 0 3px,transparent 4px),radial-gradient(ellipse at 74% 70%,rgba(210,55,75,.72) 0 6px,transparent 7px),radial-gradient(ellipse at 74% 64%,rgba(83,145,66,.78) 0 3px,transparent 4px),radial-gradient(circle,rgba(255,255,255,.55) 0 1px,transparent 1.8px)",size:"92px 82px,92px 82px,122px 104px,122px 104px,18px 18px",border:"rgba(177,68,79,.22)",shadow:"rgba(151,57,66,.13)",userBg:"rgba(255,248,247,.90)",userColor:"#9b3448",userBorder:"#df9aa0",time:"#986c70",replyBg:"rgba(255,214,215,.88)",replyBorder:"#d45c70",buttonBg:"#c94f65",buttonColor:"#ffffff"}},
        {id:"meadow-grass",name:"Луговая трава",preview:"linear-gradient(135deg,#dff1d5,#82b77b)",vars:{bg:"#e4f1dc",pattern:"repeating-linear-gradient(78deg,transparent 0 13px,rgba(75,139,74,.16) 14px 16px,transparent 17px 29px),radial-gradient(ellipse at 30% 100%,rgba(91,151,78,.22),transparent 58%),radial-gradient(circle at 82% 20%,rgba(255,255,255,.52) 0 2px,transparent 3px)",size:"90px 90px,100% 100%,60px 60px",border:"rgba(74,126,68,.22)",shadow:"rgba(53,105,54,.12)",userBg:"rgba(247,255,242,.86)",userColor:"#376b3d",userBorder:"#9abf8b",time:"#698368",replyBg:"rgba(207,231,197,.90)",replyBorder:"#6b9b62",buttonBg:"#5d9258",buttonColor:"#ffffff"}},
        {id:"hemp-leaves",name:"Листья конопли",preview:"linear-gradient(135deg,#d8edc7,#5f9b69)",vars:{bg:"#dcebcf",pattern:"repeating-conic-gradient(from 8deg at 22% 45%,transparent 0deg 8deg,rgba(49,111,63,.20) 9deg 11deg,transparent 12deg 22deg),radial-gradient(ellipse at 22% 45%,rgba(74,139,78,.26) 0 4px,transparent 5px),repeating-conic-gradient(from 18deg at 78% 60%,transparent 0deg 9deg,rgba(48,105,59,.16) 10deg 12deg,transparent 13deg 23deg)",size:"90px 90px,90px 90px,120px 110px",border:"rgba(58,112,65,.24)",shadow:"rgba(43,91,49,.14)",userBg:"rgba(246,255,239,.88)",userColor:"#35653d",userBorder:"#8bb58a",time:"#66806a",replyBg:"rgba(198,224,190,.92)",replyBorder:"#54875b",buttonBg:"#4f8758",buttonColor:"#ffffff"}},
        {id:"fern",name:"Папоротник",preview:"linear-gradient(135deg,#d6e5c9,#6f9675)",vars:{bg:"#e2ead8",pattern:"repeating-linear-gradient(145deg,transparent 0 12px,rgba(62,112,72,.18) 13px 15px,transparent 16px 26px),repeating-linear-gradient(35deg,transparent 0 18px,rgba(103,145,91,.12) 19px 21px,transparent 22px 36px)",size:"100px 90px,130px 120px",border:"rgba(75,112,76,.22)",shadow:"rgba(53,82,53,.13)",userBg:"rgba(248,252,241,.88)",userColor:"#496b4a",userBorder:"#9ab18d",time:"#71806b",replyBg:"rgba(211,226,199,.92)",replyBorder:"#71936c",buttonBg:"#66865f",buttonColor:"#ffffff"}},
        {id:"blueberry",name:"Черничный сад",preview:"linear-gradient(135deg,#e3e0f4,#8d83bb)",vars:{bg:"#e8e4f3",pattern:"radial-gradient(circle at 18% 25%,rgba(70,67,139,.72) 0 5px,transparent 6px),radial-gradient(circle at 20% 22%,rgba(174,190,224,.8) 0 2px,transparent 3px),radial-gradient(circle at 76% 72%,rgba(91,81,157,.68) 0 6px,transparent 7px),radial-gradient(circle at 78% 69%,rgba(191,202,230,.8) 0 2px,transparent 3px)",size:"100px 92px,100px 92px,130px 115px,130px 115px",border:"rgba(91,79,143,.22)",shadow:"rgba(66,55,119,.13)",userBg:"rgba(250,248,255,.90)",userColor:"#5c5289",userBorder:"#aaa1d1",time:"#77708f",replyBg:"rgba(218,215,240,.92)",replyBorder:"#8278b8",buttonBg:"#786eae",buttonColor:"#ffffff"}},
        {id:"raspberry",name:"Малиновый куст",preview:"linear-gradient(135deg,#ffe0e9,#c65c83)",vars:{bg:"#f8e2e8",pattern:"radial-gradient(circle at 18% 22%,rgba(190,40,91,.72) 0 4px,transparent 5px),radial-gradient(circle at 22% 18%,rgba(76,133,72,.55) 0 5px,transparent 6px),radial-gradient(circle at 75% 75%,rgba(207,57,103,.68) 0 5px,transparent 6px),radial-gradient(circle at 79% 70%,rgba(80,140,75,.55) 0 4px,transparent 5px)",size:"85px 80px,85px 80px,115px 105px,115px 105px",border:"rgba(169,61,98,.22)",shadow:"rgba(140,48,83,.12)",userBg:"rgba(255,247,250,.90)",userColor:"#963d62",userBorder:"#d99aaf",time:"#966d7d",replyBg:"rgba(246,207,220,.90)",replyBorder:"#c45a80",buttonBg:"#b94f78",buttonColor:"#ffffff"}},
        {id:"eucalyptus",name:"Эвкалипт",preview:"linear-gradient(135deg,#e2eee8,#8bb6a6)",vars:{bg:"#e5efeb",pattern:"radial-gradient(ellipse at 18% 25%,rgba(93,145,126,.28) 0 5px,transparent 6px),radial-gradient(ellipse at 25% 18%,rgba(125,174,153,.24) 0 5px,transparent 6px),radial-gradient(ellipse at 76% 72%,rgba(91,143,124,.24) 0 6px,transparent 7px),linear-gradient(135deg,rgba(255,255,255,.25),transparent)",size:"92px 82px,92px 82px,125px 110px,100% 100%",border:"rgba(79,126,108,.20)",shadow:"rgba(56,100,84,.11)",userBg:"rgba(248,255,251,.90)",userColor:"#4e7868",userBorder:"#a2c2b4",time:"#728b80",replyBg:"rgba(210,231,221,.92)",replyBorder:"#6d9b87",buttonBg:"#648f7c",buttonColor:"#ffffff"}},
        {id:"hemp-photo-garden",name:"Конопля — зелёный сад",preview:"linear-gradient(135deg,#234c2a,#91bd65)",vars:{bg:"#29452b",pattern:'linear-gradient(135deg,rgba(8,25,10,.38),rgba(8,25,10,.58)),url("https://i0.hippopx.com/photos/902/223/616/cannabis-green-plant-preview.jpg")',size:"cover",border:"rgba(172,211,132,.38)",shadow:"rgba(0,0,0,.24)",userBg:"rgba(241,255,229,.91)",userColor:"#25452b",userBorder:"#9bc47d",time:"#e9f6d8",replyBg:"rgba(224,244,207,.94)",replyBorder:"#8db96c",buttonBg:"#315f35",buttonColor:"#ffffff"}},
        {id:"hemp-photo-leaf",name:"Конопля — крупный лист",preview:"linear-gradient(135deg,#315c31,#a5c77c)",vars:{bg:"#31502d",pattern:'linear-gradient(135deg,rgba(10,27,8,.38),rgba(10,27,8,.60)),url("https://i0.hippopx.com/photos/941/886/387/cannabis-leaf-nature-preview.jpg")',size:"cover",border:"rgba(177,211,139,.38)",shadow:"rgba(0,0,0,.24)",userBg:"rgba(244,255,235,.92)",userColor:"#2d4e27",userBorder:"#9cbd78",time:"#edf7df",replyBg:"rgba(225,242,210,.94)",replyBorder:"#8aaa65",buttonBg:"#426b36",buttonColor:"#ffffff"}},
        {id:"tropical",name:"Тропические листья",preview:"linear-gradient(135deg,#d9f0d5,#6db9a1,#f0d78b)",vars:{bg:"#e1f0df",pattern:"repeating-linear-gradient(125deg,transparent 0 17px,rgba(42,133,92,.18) 18px 21px,transparent 22px 38px),radial-gradient(ellipse at 15% 85%,rgba(236,196,93,.24),transparent 45%),radial-gradient(ellipse at 85% 15%,rgba(83,177,142,.22),transparent 48%)",size:"105px 95px,100% 100%,100% 100%",border:"rgba(53,132,99,.22)",shadow:"rgba(40,108,79,.13)",userBg:"rgba(247,255,244,.90)",userColor:"#36765b",userBorder:"#9cc9ad",time:"#6d8b79",replyBg:"rgba(207,234,214,.92)",replyBorder:"#58a47c",buttonBg:"#4e9875",buttonColor:"#ffffff"}},
        {id:"hemp-leaf-4",name:"Конопля — лист крупным планом",preview:"linear-gradient(135deg,#0b3418,#65bd37)",vars:{bg:"#173b20",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/928/250/marijuana-leaves-cannabis-leaf-close-up-photo-vibrant-green-blurred-background-plant-growth-freshness-cannabis-plant-leaf-details-natural-texture.jpg")',size:"cover",border:"rgba(116,194,92,.45)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(239,255,229,.94)",userColor:"#244525",userBorder:"#91b96c",time:"#e5f2d8",replyBg:"rgba(220,241,205,.95)",replyBorder:"#83ad5e",buttonBg:"#315d32",buttonColor:"#ffffff"}},
        {id:"hemp-leaf-5",name:"Конопля — насыщенная зелень",preview:"linear-gradient(135deg,#0b3418,#65bd37)",vars:{bg:"#173b20",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/657/853/cannabis-leaf-green-leafy-plant-close-up-photo-detailed-texture-dark-background-lush-green-marijuana-leaf-plant-photography-leaf-texture-green-foliage.jpg")',size:"cover",border:"rgba(116,194,92,.45)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(239,255,229,.94)",userColor:"#244525",userBorder:"#91b96c",time:"#e5f2d8",replyBg:"rgba(220,241,205,.95)",replyBorder:"#83ad5e",buttonBg:"#315d32",buttonColor:"#ffffff"}},
        {id:"hemp-leaf-6",name:"Конопля — резные листья",preview:"linear-gradient(135deg,#0b3418,#65bd37)",vars:{bg:"#173b20",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/128/702/cannabis-leaf-green-leaf-close-up-shot-vibrant-cannabis-blurred-background-marijuana-leaf-plant-leaf-natural-leaf-cannabis-plant-leaf-detail.jpg")',size:"cover",border:"rgba(116,194,92,.45)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(239,255,229,.94)",userColor:"#244525",userBorder:"#91b96c",time:"#e5f2d8",replyBg:"rgba(220,241,205,.95)",replyBorder:"#83ad5e",buttonBg:"#315d32",buttonColor:"#ffffff"}},
        {id:"hemp-leaf-7",name:"Конопля — листва на тёмном фоне",preview:"linear-gradient(135deg,#0b3418,#65bd37)",vars:{bg:"#173b20",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/765/230/marijuana-plant-cannabis-plant-close-up-photo-green-foliage-natural-depth-of-field-detailed-close-up-cannabis-leaves-marijuana-leaves-plant-photography-botanical-photography.jpg")',size:"cover",border:"rgba(116,194,92,.45)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(239,255,229,.94)",userColor:"#244525",userBorder:"#91b96c",time:"#e5f2d8",replyBg:"rgba(220,241,205,.95)",replyBorder:"#83ad5e",buttonBg:"#315d32",buttonColor:"#ffffff"}},
        {id:"hemp-leaf-8",name:"Конопля — яркая листва",preview:"linear-gradient(135deg,#0b3418,#65bd37)",vars:{bg:"#173b20",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/924/878/cannabis-plant-close-up-photo-cannabis-leaves-vibrant-green-leaf-texture-detailed-close-up-marijuana-plant-green-leaves-plant-texture-cannabis-close-up.jpg")',size:"cover",border:"rgba(116,194,92,.45)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(239,255,229,.94)",userColor:"#244525",userBorder:"#91b96c",time:"#e5f2d8",replyBg:"rgba(220,241,205,.95)",replyBorder:"#83ad5e",buttonBg:"#315d32",buttonColor:"#ffffff"}},
        {id:"hemp-leaf-9",name:"Конопля — сочный зелёный лист",preview:"linear-gradient(135deg,#0b3418,#65bd37)",vars:{bg:"#173b20",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/912/508/cannabis-plant-close-up-vibrant-detailed-leaves-natural-growth-marijuana-green-leaves-plant-details-botanical-nature.jpg")',size:"cover",border:"rgba(116,194,92,.45)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(239,255,229,.94)",userColor:"#244525",userBorder:"#91b96c",time:"#e5f2d8",replyBg:"rgba(220,241,205,.95)",replyBorder:"#83ad5e",buttonBg:"#315d32",buttonColor:"#ffffff"}},
        {id:"amanita-4",name:"Мухомор — яркая шляпка",preview:"linear-gradient(135deg,#6a1717,#ff573b)",vars:{bg:"#48231f",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/259/249/red-mushroom-fly-agaric-amanita-muscaria-close-up-forest-ground-lush-forest-nature-photography-outdoor-photography-red-cap-white-spots.jpg")',size:"cover",border:"rgba(242,139,111,.46)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,234,.94)",userColor:"#8e302a",userBorder:"#dc9273",time:"#f8e4d8",replyBg:"rgba(255,229,211,.95)",replyBorder:"#d56a50",buttonBg:"#b43d32",buttonColor:"#ffffff"}},
        {id:"amanita-5",name:"Мухомор — красный с белыми точками",preview:"linear-gradient(135deg,#6a1717,#ff573b)",vars:{bg:"#48231f",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/984/857/fly-agaric-mushroom-close-up-shot-vibrant-mushroom-natural-forest-setting-red-mushroom-white-spots-forest-floor-woodland-scene-amanita-muscaria-outdoor-photography.jpg")',size:"cover",border:"rgba(242,139,111,.46)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,234,.94)",userColor:"#8e302a",userBorder:"#dc9273",time:"#f8e4d8",replyBg:"rgba(255,229,211,.95)",replyBorder:"#d56a50",buttonBg:"#b43d32",buttonColor:"#ffffff"}},
        {id:"amanita-6",name:"Мухомор — алый лесной",preview:"linear-gradient(135deg,#6a1717,#ff573b)",vars:{bg:"#48231f",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/705/868/amanita-muscaria-toxic-mushroom-hallucinogen-mushroom-fly-agaric-vibrant-mushroom-woodland-habitat-close-up-mushroom-red-mushroom-white-spots-forest-floor.jpg")',size:"cover",border:"rgba(242,139,111,.46)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,234,.94)",userColor:"#8e302a",userBorder:"#dc9273",time:"#f8e4d8",replyBg:"rgba(255,229,211,.95)",replyBorder:"#d56a50",buttonBg:"#b43d32",buttonColor:"#ffffff"}},
        {id:"chanterelle",name:"Лисички",preview:"linear-gradient(135deg,#a64b20,#e78b43)",vars:{bg:"#56301f",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/615/691/chanterelle-mushrooms-edible-cantharellus-cibarius-fungus-girolle.jpg")',size:"cover",border:"rgba(222,139,83,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,232,.94)",userColor:"#85451f",userBorder:"#d69b6c",time:"#f5e0ca",replyBg:"rgba(249,225,202,.95)",replyBorder:"#c47b4c",buttonBg:"#a85f34",buttonColor:"#ffffff"}},
        {id:"ryzhik",name:"Рыжики",preview:"linear-gradient(135deg,#a64b20,#e78b43)",vars:{bg:"#56301f",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/699/159/saffron-milk-caps-fir-saffron-milk-caps-mushroom-milchling-moss-fall-wild-mushroom-edible.jpg")',size:"cover",border:"rgba(222,139,83,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,232,.94)",userColor:"#85451f",userBorder:"#d69b6c",time:"#f5e0ca",replyBg:"rgba(249,225,202,.95)",replyBorder:"#c47b4c",buttonBg:"#a85f34",buttonColor:"#ffffff"}},
        {id:"podberezovik",name:"Подберёзовики",preview:"linear-gradient(135deg,#6f563b,#c3a47b)",vars:{bg:"#4b3d2e",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/58/143/mushroom-birch-bolete-birch-mushroom-scaber-stalk-grass-nature-close-up-autumn-mushroom-screen-fungus-mushroom-species.jpg")',size:"cover",border:"rgba(198,165,119,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,247,232,.94)",userColor:"#705237",userBorder:"#c4a276",time:"#eddfc9",replyBg:"rgba(242,225,198,.95)",replyBorder:"#aa8558",buttonBg:"#80603e",buttonColor:"#ffffff"}},
        {id:"podosinovik",name:"Подосиновики",preview:"linear-gradient(135deg,#a64b20,#e78b43)",vars:{bg:"#56301f",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/390/211/mushrooms-forest-orange-cap-boletus-fungus-fungi-plants.jpg")',size:"cover",border:"rgba(222,139,83,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,232,.94)",userColor:"#85451f",userBorder:"#d69b6c",time:"#f5e0ca",replyBg:"rgba(249,225,202,.95)",replyBorder:"#c47b4c",buttonBg:"#a85f34",buttonColor:"#ffffff"}},
        {id:"opyonok",name:"Опята",preview:"linear-gradient(135deg,#8a633b,#d2a875)",vars:{bg:"#4b3828",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/700/62/honey-fungus-mushrooms-mycology-armillaria-mellea-nature-forest-moss-fungi.jpg")',size:"cover",border:"rgba(210,181,139,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,248,235,.94)",userColor:"#6d5538",userBorder:"#c6a77c",time:"#eee1cd",replyBg:"rgba(244,231,210,.95)",replyBorder:"#ad8d62",buttonBg:"#806747",buttonColor:"#ffffff"}},
        {id:"maslenok",name:"Маслята",preview:"linear-gradient(135deg,#6f563b,#c3a47b)",vars:{bg:"#4b3d2e",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/568/254/mushroom-mycology-fungus-butter-mushroom-suillus-luteus-sponge-forest-fall-nature-close-up.jpg")',size:"cover",border:"rgba(198,165,119,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,247,232,.94)",userColor:"#705237",userBorder:"#c4a276",time:"#eddfc9",replyBg:"rgba(242,225,198,.95)",replyBorder:"#aa8558",buttonBg:"#80603e",buttonColor:"#ffffff"}},
        {id:"smorchok",name:"Сморчки",preview:"linear-gradient(135deg,#6f563b,#c3a47b)",vars:{bg:"#4b3d2e",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/633/796/mushroom-true-morel-grass-morchella-lawn-nature-morel-fungus-mycology.jpg")',size:"cover",border:"rgba(198,165,119,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,247,232,.94)",userColor:"#705237",userBorder:"#c4a276",time:"#eddfc9",replyBg:"rgba(242,225,198,.95)",replyBorder:"#aa8558",buttonBg:"#80603e",buttonColor:"#ffffff"}},
        {id:"syroezhka",name:"Сыроежки",preview:"linear-gradient(135deg,#486a39,#a8be73)",vars:{bg:"#39442c",pattern:'linear-gradient(135deg,rgba(4,12,5,.14),rgba(4,12,5,.28)),url("https://p3.hippopx.com/preview/624/198/mushroom-forest-floor-plant-russula-green-cracking-russula-quilted-green-russula-nature-forest-edible-mushroom-green.jpg")',size:"cover",border:"rgba(160,190,119,.44)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(246,255,239,.94)",userColor:"#35653d",userBorder:"#8bb58a",time:"#e4f1dc",replyBg:"rgba(211,231,197,.95)",replyBorder:"#71936c",buttonBg:"#66865f",buttonColor:"#ffffff"}},
        {id:"amanita-7",name:"Мухоморы — три яркие шляпки",preview:"linear-gradient(135deg,#6a1717,#ff573b)",vars:{bg:"#48231f",pattern:'linear-gradient(135deg,rgba(4,10,4,.14),rgba(4,10,4,.28)),url("https://p3.hippopx.com/preview/881/430/amanita-muscaria-red-mushroom-fly-agaric-forest-floor-nature-bright-white-spotted-fungi-lumix-fz1000.jpg")',size:"cover",border:"rgba(242,139,111,.46)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,234,.94)",userColor:"#8e302a",userBorder:"#dc9273",time:"#f8e4d8",replyBg:"rgba(255,229,211,.95)",replyBorder:"#d56a50",buttonBg:"#b43d32",buttonColor:"#ffffff"}},
        {id:"amanita-8",name:"Мухомор — красная шляпка с точками",preview:"linear-gradient(135deg,#6a1717,#ff573b)",vars:{bg:"#48231f",pattern:'linear-gradient(135deg,rgba(4,10,4,.14),rgba(4,10,4,.28)),url("https://p1.hippopx.com/preview/475/934/522/fly-agaric-mushroom-red-symbol-of-good-luck.jpg")',size:"cover",border:"rgba(242,139,111,.46)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,234,.94)",userColor:"#8e302a",userBorder:"#dc9273",time:"#f8e4d8",replyBg:"rgba(255,229,211,.95)",replyBorder:"#d56a50",buttonBg:"#b43d32",buttonColor:"#ffffff"}},
        {id:"amanita-9",name:"Мухомор — яркий на зелёной поляне",preview:"linear-gradient(135deg,#6a1717,#ff573b)",vars:{bg:"#48231f",pattern:'linear-gradient(135deg,rgba(4,10,4,.14),rgba(4,10,4,.28)),url("https://p3.hippopx.com/preview/860/286/amanita-muscaria-wild-mushroom-bright-red-mushroom-white-spots-green-field-close-up-wild-growing-ground-nature-fungi.jpg")',size:"cover",border:"rgba(242,139,111,.46)",shadow:"rgba(0,0,0,.25)",userBg:"rgba(255,244,234,.94)",userColor:"#8e302a",userBorder:"#dc9273",time:"#f8e4d8",replyBg:"rgba(255,229,211,.95)",replyBorder:"#d56a50",buttonBg:"#b43d32",buttonColor:"#ffffff"}},
    ];

    var TEXT_COLORS = [
        ["Чёрный", "#111111"],
        ["Графитовый", "#30343b"],
        ["Тёмно-синий", "#183b63"],
        ["Тёмно-зелёный", "#24533b"],
        ["Тёмно-коричневый", "#543522"],
        ["Бордовый", "#6b1f2b"],
        ["Тёмно-фиолетовый", "#4a285f"],
        ["Тёмно-красный", "#8b1e1e"],
        ["Белый", "#ffffff"],
        ["Снежно-белый", "#f5f7fa"],
        ["Светло-серый", "#e2e6eb"],
        ["Слоновая кость", "#fff1d6"],
        ["Светло-мятный", "#d8f3e2"],
        ["Светло-голубой", "#d9edff"]
    ];

    function storageKey(scope) {
        var id = window.currentUser && window.currentUser.id ? window.currentUser.id : "guest";
        var key = STORAGE_PREFIX + id;
        if (scope === "chat") {
            var chatId = Number(window.currentChatId || 0);
            if (chatId) return key + ":chat:" + chatId;
        }
        return key;
    }

    function loadSettings(scope) {
        try {
            var raw = localStorage.getItem(storageKey(scope));
            if (!raw && scope === "chat") return loadSettings("all");
            if (!raw) return Object.assign({}, DEFAULTS);
            var saved = JSON.parse(raw);
            return {
                theme: (THEMES.some(function (t) { return t.id === saved.theme; }) || (saved.theme === "custom-photo-theme" && typeof saved.customThemeImage === "string" && saved.customThemeImage.indexOf("data:image/") === 0)) ? saved.theme : DEFAULTS.theme,
                text: TEXT_COLORS.some(function (c) { return c[1] === saved.text; }) ? saved.text : DEFAULTS.text,
                messageStyle: (MESSAGE_STYLES.some(function (style) { return style.id === saved.messageStyle; }) || (saved.messageStyle === "custom-photo" && typeof saved.customMessageImage === "string" && saved.customMessageImage.indexOf("data:image/") === 0)) ? saved.messageStyle : DEFAULTS.messageStyle,
                customMessageImage: typeof saved.customMessageImage === "string" && saved.customMessageImage.indexOf("data:image/") === 0 ? saved.customMessageImage : "",
                customThemeImage: typeof saved.customThemeImage === "string" && saved.customThemeImage.indexOf("data:image/") === 0 ? saved.customThemeImage : ""
            };
        } catch (e) {
            return scope === "chat" ? loadSettings("all") : Object.assign({}, DEFAULTS);
        }
    }

    function saveSettings(settings, scope) {
        localStorage.setItem(storageKey(scope), JSON.stringify(settings));
    }

    function getThemeMotion(themeId) {
        if (themeId === "gold-shine-original" || themeId === "gold-shine" || themeId === "gold-shine-small-cells" || themeId === "gold-shine-large-cells") return null;
        if (themeId === "metal-small-cells" || themeId === "metal-large-cells") return null;
        if (themeId === "gold-large-cells") {
            return {
                pattern: "repeating-linear-gradient(0deg,transparent 0 62px,rgba(255,255,255,.30) 63px 65px,transparent 66px 128px),repeating-linear-gradient(90deg,transparent 0 62px,rgba(255,255,255,.26) 63px 65px,transparent 66px 128px),repeating-linear-gradient(0deg,transparent 0 62px,rgba(112,70,0,.24) 63px 65px,transparent 66px 128px),repeating-linear-gradient(90deg,transparent 0 62px,rgba(112,70,0,.22) 63px 65px,transparent 66px 128px)",
                size: "256px 192px,256px 192px,128px 96px,128px 96px"
            };
        }
        var activeThemes = THEMES.filter(function (theme) {
            return theme.id !== "gold-shine-original" && theme.id !== "gold-shine" && theme.id !== "gold-large-cells" && theme.id !== "gold-shine-small-cells" && theme.id !== "gold-shine-large-cells";
        });
        var index = activeThemes.findIndex(function (theme) { return theme.id === themeId; });
        var cycle = ["grid", "stripe-forward", "stripe-reverse", "grid", "stripe-reverse", "stripe-forward"];
        var type = index >= 0 ? cycle[index % cycle.length] : "stripe-forward";
        if (type === "grid") {
            return {
                pattern: "repeating-linear-gradient(0deg,transparent 0 29px,rgba(255,255,255,.19) 30px 32px,transparent 33px 34px),repeating-linear-gradient(90deg,transparent 0 29px,rgba(0,0,0,.12) 30px 32px,transparent 33px 34px)",
                size: "34px 34px,34px 34px"
            };
        }
        var angle = type === "stripe-forward" ? "135deg" : "45deg";
        return {
            pattern: "repeating-linear-gradient(" + angle + ",transparent 0 27px,rgba(255,255,255,.20) 28px 30px,transparent 31px 48px),repeating-linear-gradient(" + angle + ",transparent 0 27px,rgba(0,0,0,.11) 28px 30px,transparent 31px 48px)",
            size: "48px 48px,48px 48px"
        };
    }

    function applyTheme(themeId, textColor, messageStyleId) {
        var box = document.getElementById("messages");
        if (!box) return;
        var theme = THEMES.find(function (t) { return t.id === themeId; }) || THEMES[0];
        var activeSettings = loadSettings(Number(window.currentChatId || 0) > 0 ? "chat" : "all");
        if (themeId === "custom-photo-theme" && activeSettings.customThemeImage) {
            theme = {
                id: "custom-photo-theme",
                vars: {
                    bg: "#34404a",
                    pattern: 'url("' + activeSettings.customThemeImage + '")',
                    size: "cover",
                    bubble: "rgba(255,250,243,.88)",
                    border: "rgba(255,255,255,.28)",
                    shadow: "rgba(0,0,0,.22)"
                }
            };
        }
        box.style.setProperty("--chat-theme-bg", theme.vars.bg);
        box.style.setProperty("--chat-theme-pattern", theme.vars.pattern);
        var motion = getThemeMotion(theme.id);
        if (motion) {
            box.style.setProperty("--chat-theme-motion-pattern", motion.pattern);
            box.style.setProperty("--chat-theme-motion-size", motion.size);
        } else {
            box.style.removeProperty("--chat-theme-motion-pattern");
            box.style.removeProperty("--chat-theme-motion-size");
        }
        box.style.setProperty("--chat-theme-size", theme.vars.size);
        box.style.setProperty("--chat-message-bg", theme.vars.bubble);
        box.style.setProperty("--chat-message-border", theme.vars.border);
        box.style.setProperty("--chat-message-shadow", theme.vars.shadow);
        box.style.setProperty("--chat-message-text", textColor || DEFAULTS.text);
        box.dataset.chatTheme = theme.id;
        var messageStyle = MESSAGE_STYLES.find(function (style) { return style.id === messageStyleId; }) || MESSAGE_STYLES[0];
        if (messageStyleId === "custom-photo" && (!activeSettings.customMessageImage || activeSettings.messageStyle !== "custom-photo")) {
            var globalSettings = loadSettings("all");
            if (globalSettings.messageStyle === "custom-photo" && globalSettings.customMessageImage) activeSettings = globalSettings;
        }
        if (messageStyleId === "custom-photo" && activeSettings.customMessageImage) {
            messageStyle = {
                id: "custom-photo",
                vars: {
                    bg: "#34404a",
                    pattern: 'linear-gradient(135deg,rgba(0,0,0,.18),rgba(0,0,0,.28)),url("' + activeSettings.customMessageImage + '")',
                    size: "cover",
                    border: "rgba(255,255,255,.28)",
                    shadow: "rgba(0,0,0,.22)",
                    userBg: "rgba(255,255,255,.88)",
                    userColor: "#263238",
                    userBorder: "rgba(255,255,255,.55)",
                    time: "#ffffff",
                    replyBg: "rgba(255,255,255,.86)",
                    replyBorder: "#718096",
                    buttonBg: "#455a64",
                    buttonColor: "#ffffff"
                }
            };
        }
        Object.keys(messageStyle.vars).forEach(function (key) { box.style.setProperty("--chat-card-" + key.replace(/[A-Z]/g, function (letter) { return "-" + letter.toLowerCase(); }), messageStyle.vars[key]); });
        box.dataset.messageStyle = messageStyle.id;
    }

    function injectCSS() {
        if (document.getElementById("chatThemesCSS")) return;
        var style = document.createElement("style");
        style.id = "chatThemesCSS";
        style.textContent = `
@keyframes chatThemePatternDrift{0%{background-position:0 0,0 0,0% 50%,100% 0%,0% 100%,50% 50%}100%{background-position:44px 44px,-44px -44px,0% 50%,100% 0%,0% 100%,50% 50%}}
#messages[data-chat-theme]:not([data-chat-theme="gold-shine-original"]):not([data-chat-theme="gold-shine"]):not([data-chat-theme="gold-large-cells"]):not([data-chat-theme="gold-shine-small-cells"]):not([data-chat-theme="gold-shine-large-cells"]){background-image:var(--chat-theme-motion-pattern),var(--chat-theme-pattern)!important;background-size:var(--chat-theme-motion-size),var(--chat-theme-size)!important;background-position:0 0,0 0,0% 50%,100% 0%,0% 100%,50% 50%;animation:chatThemePatternDrift 12s linear infinite!important}
@keyframes chatThemeIridescence{0%{background-position:0% 50%,100% 0%,0% 100%,50% 50%}50%{background-position:100% 50%,0% 100%,100% 0%,50% 50%}100%{background-position:0% 50%,100% 0%,0% 100%,50% 50%}}
@keyframes chatThemeGoldCells{0%,100%{background-position:0 0,0 0,64px 48px,64px 48px,0% 50%}50%{background-position:128px 96px,128px 96px,0 0,0 0,100% 50%}}
@keyframes chatThemeGoldSmallShine{0%,100%{background-position:0% 50%,0 0,0% 50%}50%{background-position:100% 50%,60px 60px,100% 50%}}
@keyframes chatThemeGoldLargeCells{0%,100%{background-position:0% 50%,0 0,128px 96px,0 0,0 0,0% 50%}50%{background-position:100% 50%,128px 96px,0 0,128px 96px,128px 96px,100% 50%}}
@keyframes chatThemeMetalSmallCells{0%,100%{background-position:0% 50%,0 0,128px 96px,0 0,0 0,0% 50%}50%{background-position:100% 50%,128px 96px,0 0,0 0,0 0,100% 50%}}
@keyframes chatThemeMetalLargeCells{0%,100%{background-position:0% 50%,0 0,128px 96px,0 0,0 0,0% 50%;background-size:260% 260%,256px 192px,256px 192px,128px 96px,128px 96px,100% 100%}50%{background-position:100% 50%,128px 96px,0 0,0 0,0 0,100% 50%;background-size:260% 260%,288px 216px,224px 168px,128px 96px,128px 96px,100% 100%}}
@keyframes chatBubbleIridescence{0%{background-position:0% 50%}100%{background-position:100% 50%}}
#messages[data-chat-theme="gold-large-cells"]{background-image:var(--chat-theme-motion-pattern),var(--chat-theme-pattern)!important;background-size:var(--chat-theme-motion-size),var(--chat-theme-size)!important;animation:chatThemeGoldCells 12s ease-in-out infinite!important}
#messages[data-chat-theme="metal-small-cells"]{background-image:var(--chat-theme-pattern)!important;background-size:var(--chat-theme-size)!important;animation:chatThemeMetalSmallCells 20s ease-in-out infinite!important}
#messages[data-chat-theme="metal-large-cells"]{background-image:var(--chat-theme-pattern)!important;background-size:var(--chat-theme-size)!important;animation:chatThemeMetalLargeCells 20s ease-in-out infinite!important}
#messages[data-chat-theme]{background-color:var(--chat-theme-bg)!important;background-image:var(--chat-theme-pattern)!important;background-size:var(--chat-theme-size)!important;background-position:0% 50%,100% 0%,0% 100%,50% 50%;animation:chatThemeIridescence 34s ease-in-out infinite;transition:background-color .28s ease}
#messages[data-chat-theme="gold-shine-small-cells"]{background-image:var(--chat-theme-pattern)!important;background-size:var(--chat-theme-size)!important;animation:chatThemeGoldSmallShine 30s ease-in-out infinite!important}
#messages[data-chat-theme="gold-shine-large-cells"]{background-image:var(--chat-theme-pattern)!important;background-size:var(--chat-theme-size)!important;animation:chatThemeGoldLargeCells 20s ease-in-out infinite!important}
#messages[data-chat-theme] .message{background:var(--chat-message-bg)!important;background-size:240% 240%!important;animation:chatBubbleIridescence 18s ease-in-out infinite alternate;border-color:var(--chat-message-border)!important;box-shadow:0 2px 8px var(--chat-message-shadow)!important}
#messages[data-chat-theme] .message-text{color:var(--chat-message-text)!important}
#messages[data-message-style] .message{background:var(--chat-card-bg)!important;background-image:var(--chat-card-pattern)!important;background-size:var(--chat-card-size)!important;animation:none!important;border-color:var(--chat-card-border)!important;box-shadow:0 2px 8px var(--chat-card-shadow)!important}
#messages[data-message-style] .message-user{background:var(--chat-card-user-bg)!important;color:var(--chat-card-user-color)!important;border-color:var(--chat-card-user-border)!important}
#messages[data-message-style] .message-time{color:var(--chat-card-time)!important}
#messages[data-message-style] .message > div[style*="background:#eeeeee"]{background:var(--chat-card-reply-bg)!important;border-left-color:var(--chat-card-reply-border)!important}
#messages[data-message-style] .message > button{background:var(--chat-card-button-bg)!important;color:var(--chat-card-button-color)!important}
@media(prefers-reduced-motion:reduce){#messages[data-chat-theme],#messages[data-chat-theme] .message,#messages[data-chat-theme="metal-small-cells"],#messages[data-chat-theme="metal-large-cells"]{animation:none!important}}
.chat-theme-settings{width:min(520px,calc(100vw - 28px));max-height:min(82vh,720px);overflow:auto;background:#fff;color:#222;border-radius:16px;box-shadow:0 18px 55px rgba(0,0,0,.30);padding:18px;font-family:Arial,sans-serif}
.chat-theme-settings h3{margin:0 0 14px;font-size:20px}.chat-theme-section{margin-top:16px}.chat-theme-section-title{font-weight:700;margin-bottom:9px}.chat-theme-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.chat-theme-option{border:2px solid #ddd;background:#fafafa;border-radius:11px;padding:8px;text-align:left;cursor:pointer;font:inherit}.chat-theme-option.selected{border-color:#8b5a3c;box-shadow:0 0 0 2px rgba(139,90,60,.12)}.chat-theme-preview{height:52px;border-radius:8px;margin-bottom:6px;border:1px solid rgba(0,0,0,.10)}.chat-theme-name{font-size:14px;font-weight:700}.chat-text-grid{display:flex;flex-wrap:wrap;gap:7px}.chat-text-option{border:1px solid #d5d5d5;background:#fff;border-radius:9px;padding:8px 10px;cursor:pointer;font:13px Arial,sans-serif}.chat-text-option.selected{border-color:#8b5a3c;box-shadow:0 0 0 2px rgba(139,90,60,.10)}.chat-text-dot{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:-2px;margin-right:5px;border:1px solid rgba(0,0,0,.16)}.chat-theme-footer{display:flex;justify-content:flex-end;margin-top:18px}.chat-theme-close{border:0;background:#8b5a3c;color:#fff;padding:9px 15px;border-radius:9px;font-weight:700;cursor:pointer}
@media(max-width:520px){.chat-theme-grid{grid-template-columns:1fr}.chat-theme-settings{padding:15px}}
`;
        document.head.appendChild(style);
    }

    function closeSettings() {
        var overlay = document.getElementById("chatThemeSettingsOverlay");
        if (overlay) overlay.remove();
    }

    function openSettings(section, scope, onBack, onClose) {
        closeSettings();
        injectCSS();
        scope = scope || "all";
        onBack = typeof onBack === "function" ? onBack : function () { openAppearanceChoice(scope); };

        var settings = loadSettings(scope);
        var overlay = document.createElement("div");
        overlay.id = "chatThemeSettingsOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:100004;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.52);box-sizing:border-box";

        var panel = document.createElement("div");
        panel.className = "chat-theme-settings";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");

        var backButton = document.createElement("button");
        backButton.type = "button";
        backButton.textContent = "← Назад";
        backButton.style.cssText = "border:0;background:#eee;color:#222;padding:8px 12px;border-radius:8px;margin-bottom:12px;font-weight:700;cursor:pointer";
        backButton.addEventListener("click", function () {
            closeSettings();
            onBack();
        });
        var title = document.createElement("h3");
        title.textContent = section === "theme" ? "Настройка темы" : section === "text" ? "Цвет текста сообщений" : section === "cards" ? "Оформление карточек сообщений" : "Настройки оформления";
        panel.appendChild(title);

        if (!section || section === "theme") {
        var themeSection = document.createElement("div");
        themeSection.className = "chat-theme-section";
        var themeTitle = document.createElement("div");
        themeTitle.className = "chat-theme-section-title";
        themeTitle.textContent = "Тема сообщений";
        if (!section) themeSection.appendChild(themeTitle);

        var themeGrid = document.createElement("div");
        themeGrid.className = "chat-theme-grid";
        var themeUploadButton = document.createElement("button");
        themeUploadButton.type = "button";
        themeUploadButton.className = "chat-theme-option";
        themeUploadButton.style.borderStyle = "dashed";
        var themeUploadPreview = document.createElement("div");
        themeUploadPreview.className = "chat-theme-preview";
        themeUploadPreview.style.cssText = "display:flex;align-items:center;justify-content:center;background:#f3f4f6;color:#555;font-size:30px";
        themeUploadPreview.textContent = "+";
        var themeUploadName = document.createElement("div");
        themeUploadName.className = "chat-theme-name";
        themeUploadName.textContent = settings.customThemeImage ? "Заменить свою тему" : "Добавить свою тему";
        themeUploadButton.appendChild(themeUploadPreview);
        themeUploadButton.appendChild(themeUploadName);
        var themeImageInput = document.createElement("input");
        themeImageInput.type = "file";
        themeImageInput.accept = "image/*";
        themeImageInput.style.display = "none";
        themeImageInput.addEventListener("change", function () {
            var file = themeImageInput.files && themeImageInput.files[0];
            if (!file) return;
            if (file.type && file.type.indexOf("image/") !== 0) {
                alert("Выберите файл изображения.");
                themeImageInput.value = "";
                return;
            }
            if (file.size > 12 * 1024 * 1024) {
                alert("Размер фотографии не должен превышать 12 МБ.");
                themeImageInput.value = "";
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                var image = new Image();
                image.onload = function () {
                    var maxSide = 1600;
                    var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                    var canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(image.width * scale));
                    canvas.height = Math.max(1, Math.round(image.height * scale));
                    var context = canvas.getContext("2d");
                    if (!context) {
                        alert("Не удалось обработать фотографию на этом устройстве.");
                        return;
                    }
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    try {
                        settings.customThemeImage = canvas.toDataURL("image/jpeg", 0.82);
                        settings.theme = "custom-photo-theme";
                        saveSettings(settings, scope);
                        applyTheme(settings.theme, settings.text, settings.messageStyle);
                        openSettings("theme", scope, onBack, onClose);
                    } catch (error) {
                        alert("Не удалось сохранить тему. Возможно, в памяти браузера недостаточно места.");
                    }
                };
                image.onerror = function () { alert("Не удалось открыть выбранное изображение."); };
                image.src = reader.result;
            };
            reader.onerror = function () { alert("Не удалось прочитать файл изображения."); };
            reader.readAsDataURL(file);
        });
        themeUploadButton.addEventListener("click", function () { themeImageInput.click(); });
        themeGrid.appendChild(themeUploadButton);
        themeGrid.appendChild(themeImageInput);

        if (settings.customThemeImage) {
            var personalThemeButton = document.createElement("button");
            personalThemeButton.type = "button";
            personalThemeButton.className = "chat-theme-option" + (settings.theme === "custom-photo-theme" ? " selected" : "");
            personalThemeButton.style.position = "relative";
            var personalThemePreview = document.createElement("div");
            personalThemePreview.className = "chat-theme-preview";
            personalThemePreview.style.background = 'linear-gradient(135deg,rgba(0,0,0,.12),rgba(0,0,0,.18)),url("' + settings.customThemeImage + '") center/cover';
            var personalThemeName = document.createElement("div");
            personalThemeName.className = "chat-theme-name";
            personalThemeName.textContent = "Моя тема";
            personalThemeButton.appendChild(personalThemePreview);
            personalThemeButton.appendChild(personalThemeName);
            personalThemeButton.addEventListener("click", function () {
                settings.theme = "custom-photo-theme";
                saveSettings(settings, scope);
                applyTheme(settings.theme, settings.text, settings.messageStyle);
                themeGrid.querySelectorAll(".chat-theme-option").forEach(function (item) { item.classList.remove("selected"); });
                personalThemeButton.classList.add("selected");
            });
            var deleteThemeButton = document.createElement("button");
            deleteThemeButton.type = "button";
            deleteThemeButton.textContent = "Удалить";
            deleteThemeButton.style.cssText = "position:absolute;right:12px;bottom:38px;padding:4px 8px;border:0;border-radius:6px;background:#f3e5e5;color:#9b3030;font:12px Arial,sans-serif;cursor:pointer;z-index:1";
            deleteThemeButton.addEventListener("click", function (event) {
                event.stopPropagation();
                if (!confirm("Вы точно хотите удалить эту фотографию?")) return;
                settings.customThemeImage = "";
                if (settings.theme === "custom-photo-theme") settings.theme = "classic";
                saveSettings(settings, scope);
                applyTheme(settings.theme, settings.text, settings.messageStyle);
                openSettings("theme", scope, onBack, onClose);
            });
            personalThemeButton.appendChild(deleteThemeButton);
            themeGrid.appendChild(personalThemeButton);
        }

        THEMES.forEach(function (theme) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "chat-theme-option" + (settings.theme === theme.id ? " selected" : "");
            var preview = document.createElement("div");
            preview.className = "chat-theme-preview";
            preview.style.background = theme.preview;
            var name = document.createElement("div");
            name.className = "chat-theme-name";
            name.textContent = theme.name;
            button.appendChild(preview);
            button.appendChild(name);
            button.addEventListener("click", function () {
                settings.theme = theme.id;
                saveSettings(settings, scope);
                applyTheme(settings.theme, settings.text, settings.messageStyle);
                themeGrid.querySelectorAll(".chat-theme-option").forEach(function (item) { item.classList.remove("selected"); });
                button.classList.add("selected");
            });
            themeGrid.appendChild(button);
        });
        themeSection.appendChild(themeGrid);
        panel.appendChild(themeSection);
        }

        if (!section || section === "text") {
        var textSection = document.createElement("div");
        textSection.className = "chat-theme-section";
        var textTitle = document.createElement("div");
        textTitle.className = "chat-theme-section-title";
        textTitle.textContent = "Цвет текста сообщений";
        if (!section) textSection.appendChild(textTitle);

        var textGrid = document.createElement("div");
        textGrid.className = "chat-text-grid";
        TEXT_COLORS.forEach(function (color) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "chat-text-option" + (settings.text === color[1] ? " selected" : "");
            button.innerHTML = '<span class="chat-text-dot" style="background:' + color[1] + '"></span>' + color[0];
            button.addEventListener("click", function () {
                settings.text = color[1];
                saveSettings(settings, scope);
                applyTheme(settings.theme, settings.text, settings.messageStyle);
                textGrid.querySelectorAll(".chat-text-option").forEach(function (item) { item.classList.remove("selected"); });
                button.classList.add("selected");
            });
            textGrid.appendChild(button);
        });
        textSection.appendChild(textGrid);
        panel.appendChild(textSection);
        }

        if (!section || section === "cards") {
        var cardSection = document.createElement("div");
        cardSection.className = "chat-theme-section";
        var cardTitle = document.createElement("div");
        cardTitle.className = "chat-theme-section-title";
        cardTitle.textContent = "Оформление карточек сообщений";
        if (!section) cardSection.appendChild(cardTitle);
        var cardGrid = document.createElement("div");
        cardGrid.className = "chat-theme-grid";
        function selectCardStyle(messageStyle, button) {
            settings.messageStyle = messageStyle.id;
            saveSettings(settings, scope);
            applyTheme(settings.theme, settings.text, settings.messageStyle);
            cardGrid.querySelectorAll(".chat-theme-option").forEach(function (item) { item.classList.remove("selected"); });
            button.classList.add("selected");
        }

        var uploadButton = document.createElement("button");
        uploadButton.type = "button";
        uploadButton.className = "chat-theme-option";
        uploadButton.style.borderStyle = "dashed";
        uploadButton.style.textAlign = "center";
        var uploadPreview = document.createElement("div");
        uploadPreview.className = "chat-theme-preview";
        uploadPreview.style.cssText = "display:flex;align-items:center;justify-content:center;background:#f3f4f6;color:#555;font-size:30px";
        uploadPreview.textContent = "+";
        var uploadName = document.createElement("div");
        uploadName.className = "chat-theme-name";
        uploadName.textContent = settings.customMessageImage ? "Заменить своё фото" : "Добавить своё фото";
        uploadButton.appendChild(uploadPreview);
        uploadButton.appendChild(uploadName);
        var imageInput = document.createElement("input");
        imageInput.type = "file";
        imageInput.accept = "image/*";
        imageInput.style.display = "none";
        imageInput.addEventListener("change", function () {
            var file = imageInput.files && imageInput.files[0];
            if (!file) return;
            if (!/^image\//i.test(file.type)) {
                alert("Выберите файл изображения.");
                imageInput.value = "";
                return;
            }
            if (file.size > 12 * 1024 * 1024) {
                alert("Размер фотографии не должен превышать 12 МБ.");
                imageInput.value = "";
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                var image = new Image();
                image.onload = function () {
                    var maxSide = 1200;
                    var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                    var canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(image.width * scale));
                    canvas.height = Math.max(1, Math.round(image.height * scale));
                    var context = canvas.getContext("2d");
                    if (!context) {
                        alert("Не удалось обработать фотографию на этом устройстве.");
                        return;
                    }
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    try {
                        settings.customMessageImage = canvas.toDataURL("image/jpeg", 0.82);
                        settings.messageStyle = "custom-photo";
                        saveSettings(settings, scope);
                        openSettings("cards", scope, onBack, onClose);
                    } catch (error) {
                        alert("Не удалось сохранить фотографию. Возможно, в памяти браузера недостаточно места.");
                    }
                };
                image.onerror = function () { alert("Не удалось открыть выбранное изображение."); };
                image.src = reader.result;
            };
            reader.onerror = function () { alert("Не удалось прочитать файл изображения."); };
            reader.readAsDataURL(file);
        });
        uploadButton.addEventListener("click", function () { imageInput.click(); });
        cardGrid.appendChild(uploadButton);
        cardGrid.appendChild(imageInput);

        if (settings.customMessageImage) {
            var personalStyle = {
                id: "custom-photo",
                name: "Моя карточка",
                vars: {
                    bg: "#34404a",
                    pattern: 'linear-gradient(135deg,rgba(0,0,0,.18),rgba(0,0,0,.28)),url("' + settings.customMessageImage + '")',
                    size: "cover",
                    border: "rgba(255,255,255,.28)"
                }
            };
            var personalCard = document.createElement("div");
            personalCard.style.cssText = "display:flex;flex-direction:column;min-width:0";
            var personalButton = document.createElement("button");
            personalButton.type = "button";
            personalButton.className = "chat-theme-option" + (settings.messageStyle === "custom-photo" ? " selected" : "");
            var personalPreview = document.createElement("div");
            personalPreview.className = "chat-theme-preview";
            personalPreview.style.backgroundColor = personalStyle.vars.bg;
            personalPreview.style.backgroundImage = personalStyle.vars.pattern;
            personalPreview.style.backgroundSize = personalStyle.vars.size;
            var personalName = document.createElement("div");
            personalName.className = "chat-theme-name";
            personalName.textContent = personalStyle.name;
            personalButton.appendChild(personalPreview);
            personalButton.appendChild(personalName);
            personalButton.addEventListener("click", function () { selectCardStyle(personalStyle, personalButton); });
            var deletePhotoButton = document.createElement("button");
            deletePhotoButton.type = "button";
            deletePhotoButton.textContent = "Удалить";
            deletePhotoButton.style.cssText = "align-self:flex-end;margin:4px 2px 0;padding:4px 8px;border:0;border-radius:6px;background:#f3e5e5;color:#9b3030;font:12px Arial,sans-serif;cursor:pointer";
            deletePhotoButton.addEventListener("click", function () {
                if (!confirm("Удалить добавленную фотографию из этого оформления?")) return;
                settings.customMessageImage = "";
                if (settings.messageStyle === "custom-photo") settings.messageStyle = "classic";
                saveSettings(settings, scope);
                applyTheme(settings.theme, settings.text, settings.messageStyle);
                openSettings("cards", scope, onBack, onClose);
            });
            personalCard.appendChild(personalButton);
            personalCard.appendChild(deletePhotoButton);
            cardGrid.appendChild(personalCard);
        }

        MESSAGE_STYLES.forEach(function (messageStyle) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "chat-theme-option" + (settings.messageStyle === messageStyle.id ? " selected" : "");
            var preview = document.createElement("div");
            preview.className = "chat-theme-preview";
            preview.style.backgroundColor = messageStyle.vars.bg;
            preview.style.backgroundImage = messageStyle.vars.pattern;
            preview.style.backgroundSize = messageStyle.vars.size;
            preview.style.borderColor = messageStyle.vars.border;
            var name = document.createElement("div");
            name.className = "chat-theme-name";
            name.textContent = messageStyle.name;
            button.appendChild(preview);
            button.appendChild(name);
            button.addEventListener("click", function () { selectCardStyle(messageStyle, button); });
            cardGrid.appendChild(button);
        });
        cardSection.appendChild(cardGrid);
        panel.appendChild(cardSection);
        }

        var footer = document.createElement("div");
        footer.className = "chat-theme-footer";
        footer.style.justifyContent = "space-between";
        var closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "chat-theme-close";
        closeButton.textContent = "Готово";
        closeButton.addEventListener("click", function () {
            closeSettings();
            if (typeof onClose === "function") onClose();
        });
        backButton.style.marginBottom = "0";
        footer.appendChild(backButton);
        if (scope === "chat") {
            var resetButton = document.createElement("button");
            resetButton.type = "button";
            resetButton.className = "chat-theme-close";
            resetButton.style.marginRight = "auto";
            resetButton.style.background = "#555";
            resetButton.textContent = "Использовать оформление всех чатов";
            resetButton.addEventListener("click", function () {
                localStorage.removeItem(storageKey("chat"));
                closeSettings();
                applySaved();
                if (typeof onClose === "function") onClose();
            });
            footer.appendChild(resetButton);
        }
        footer.appendChild(closeButton);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (event) { if (event.target === overlay) closeSettings(); });
        document.addEventListener("keydown", function onKey(event) {
            if (event.key === "Escape") closeSettings();
            if (!document.getElementById("chatThemeSettingsOverlay")) document.removeEventListener("keydown", onKey);
        });

        applyTheme(settings.theme, settings.text, settings.messageStyle);
    }

    function applySaved() {
        var scope = Number(window.currentChatId || 0) > 0 ? "chat" : "all";
        var settings = loadSettings(scope);
        applyTheme(settings.theme, settings.text, settings.messageStyle);
    }

    function openAppearanceChoice(scope, onBack, onClose) {
        scope = scope || "all";
        if (scope === "chat" && !Number(window.currentChatId || 0)) {
            console.warn("Нельзя открыть индивидуальное оформление без выбранного чата.");
            return;
        }
        var existing = document.getElementById("chatAppearanceChoiceOverlay");
        if (existing) existing.remove();

        var overlay = document.createElement("div");
        overlay.id = "chatAppearanceChoiceOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:100003;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.52);box-sizing:border-box";
        var panel = document.createElement("div");
        panel.style.cssText = "width:min(300px,calc(100vw - 28px));background:#000;color:#fff;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.45);padding:6px;font-family:Arial,sans-serif;box-sizing:border-box";

        var backButton = document.createElement("button");
        backButton.type = "button";
        backButton.textContent = "← Назад";
        backButton.style.cssText = "display:block;width:100%;border:0;background:#333;color:#fff;text-align:left;padding:12px;border-radius:8px;cursor:pointer;font:inherit";
        backButton.addEventListener("click", function () {
            overlay.remove();
            if (typeof onBack === "function") onBack();
        });
        [["Настройка темы", "theme"], ["Цвет текста сообщений", "text"], ["Оформление карточек сообщений", "cards"]].forEach(function (choice) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = choice[0];
            button.style.cssText = "display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:12px;border-radius:8px;cursor:pointer;font:inherit";
            button.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                openSettings(choice[1], scope, function () {}, function () {
                    overlay.remove();
                    if (typeof onClose === "function") onClose();
                });
            });
            panel.appendChild(button);
        });
        panel.appendChild(backButton);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (event) { if (event.target === overlay) overlay.remove(); });
    }

    window.openChatAppearanceChoice = openAppearanceChoice;
    window.openChatSettings = function (section) {
        if (section) openSettings(section);
        else openAppearanceChoice();
    };
    window.applyChatAppearance = applySaved;

    injectCSS();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applySaved, { once: true });
    } else {
        applySaved();
    }

    document.addEventListener("click", function () {
        setTimeout(applySaved, 0);
    });
})();
