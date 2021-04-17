import LootSheet from "./loot-sheet.js";

function registerSheets() {
    Actors.registerSheet("dnd5e", LootSheet, {
        types: ["npc"],
        makeDefault: false
    });
}

export default registerSheets